import type { GameAction } from '../../shared/protocol';
import {
  POST_PATH_HOLD_MS,
  STEP_ANIM_MS,
  type WikiRaceAction,
  type WikiRaceHostView,
  type WikiRacePhase,
  type WikiRacePlayerProgress,
  type WikiRacePlayerView,
} from '../../shared/games/wikirace';
import type { GameContext, GameDefinition } from '../game';
import {
  MAX_GAME_SCORE,
  awardCappedScore,
  connectedPlayers,
  createRoomHistory,
  playerName,
  takeUnusedItem,
} from './helpers';
import {
  CURATED_PAIRS,
  fetchWikiArticle,
  normalizeTitle,
  type ArticleFetcher,
  type WikiArticle,
} from './wikirace-wiki';

export { POST_PATH_HOLD_MS, STEP_ANIM_MS };
export const WIN_POINTS = MAX_GAME_SCORE;

const ERROR_HOLD_MS = 3_000;
const pairHistory = createRoomHistory();
const fallbackPairPool: { current: Array<readonly [string, string]> | null } = { current: null };

interface RacerState {
  path: string[];
  clicks: string[];
  hops: number;
  finishedRank: number | null;
  loadingTitle: string | null;
  error: string | null;
}

export interface WikiRaceState {
  phase: WikiRacePhase;
  startTitle: string;
  targetTitle: string;
  error: string | null;
  articles: Record<string, WikiArticle>;
  redirects: Record<string, string>;
  racers: Record<string, RacerState>;
  winnerId: string | null;
  winnerPath: string[];
}

function pickPair(roomCode: string): readonly [string, string] {
  const keyOf = ([a, b]: readonly [string, string]) => `${a}::${b}`;
  const { item } = takeUnusedItem(
    roomCode,
    pairHistory,
    keyOf,
    null,
    fallbackPairPool,
    CURATED_PAIRS
  );
  pairHistory.remember(roomCode, keyOf(item));
  return item;
}

function createInitialRacer(startTitle: string): RacerState {
  return {
    path: [startTitle],
    clicks: [startTitle],
    hops: 0,
    finishedRank: null,
    loadingTitle: null,
    error: null,
  };
}

function buildProgressList(ctx: GameContext, state: WikiRaceState): WikiRacePlayerProgress[] {
  return ctx
    .getPlayers()
    .map((p) => {
      const racer = state.racers[p.id];
      return {
        playerId: p.id,
        name: p.name,
        hops: racer?.hops ?? 0,
        finishedRank: racer?.finishedRank ?? null,
        connected: p.connected,
      };
    })
    .sort((a, b) => {
      if (a.finishedRank !== null && b.finishedRank !== null) {
        return a.finishedRank - b.finishedRank;
      }
      if (a.finishedRank !== null) return -1;
      if (b.finishedRank !== null) return 1;
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      return a.hops - b.hops || a.name.localeCompare(b.name);
    });
}

function checkActivePlayers(ctx: GameContext, state: WikiRaceState): void {
  if (state.phase === 'RACING' && connectedPlayers(ctx).length === 0) {
    ctx.clearTimer();
    ctx.endGame();
  }
}

function recordArticle(state: WikiRaceState, requestedTitle: string, article: WikiArticle): void {
  const canonicalKey = normalizeTitle(article.title);
  state.articles[canonicalKey] = article;
  state.redirects[normalizeTitle(requestedTitle)] = canonicalKey;
  state.redirects[canonicalKey] = canonicalKey;
}

function getLoadedArticle(state: WikiRaceState, title: string): WikiArticle | undefined {
  const key = state.redirects[normalizeTitle(title)] ?? normalizeTitle(title);
  return state.articles[key];
}

function moveRacerToArticle(
  ctx: GameContext,
  state: WikiRaceState,
  playerId: string,
  article: WikiArticle
): void {
  if (state.phase !== 'RACING') return;
  const racer = state.racers[playerId];
  if (!racer || racer.finishedRank !== null) return;

  racer.hops += 1;
  racer.path.push(article.title);
  racer.clicks.push(article.title);
  racer.loadingTitle = null;
  racer.error = null;

  if (normalizeTitle(article.title) === normalizeTitle(state.targetTitle)) {
    racer.finishedRank = 1;
    awardCappedScore(ctx, playerId, WIN_POINTS);
    state.winnerId = playerId;
    state.winnerPath = [...racer.clicks];
    state.phase = 'RESULTS';
    for (const other of Object.values(state.racers)) {
      other.loadingTitle = null;
    }
    const duration = Math.max(4_500, state.winnerPath.length * STEP_ANIM_MS + POST_PATH_HOLD_MS);
    ctx.setTimer(duration, false);
    ctx.broadcastEvent('wikirace_finished', {
      winnerId: playerId,
      winnerPath: state.winnerPath,
    });
  }
}

function startRace(ctx: GameContext, fetcher: ArticleFetcher): WikiRaceState {
  const [rawStart, rawTarget] = pickPair(ctx.roomCode);

  Promise.all([fetcher(rawStart), fetcher(rawTarget)])
    .then(([startArticle, targetArticle]) => {
      ctx.dispatch<WikiRaceState>((state) => {
        if (state.phase !== 'LOADING') return;
        recordArticle(state, state.startTitle, startArticle);
        state.startTitle = startArticle.title;
        state.targetTitle = targetArticle.title;
        state.phase = 'RACING';
        for (const p of ctx.getPlayers()) {
          state.racers[p.id] = createInitialRacer(startArticle.title);
        }
        ctx.clearTimer();
        checkActivePlayers(ctx, state);
      });
    })
    .catch((err) => {
      ctx.dispatch<WikiRaceState>((state) => {
        if (state.phase !== 'LOADING') return;
        state.error = err instanceof Error ? err.message : 'Failed to load race articles.';
        ctx.setTimer(ERROR_HOLD_MS, false);
      });
    });

  return {
    phase: 'LOADING',
    startTitle: rawStart,
    targetTitle: rawTarget,
    error: null,
    articles: {},
    redirects: {},
    racers: {},
    winnerId: null,
    winnerPath: [],
  };
}

function handleAction(
  ctx: GameContext,
  state: WikiRaceState,
  playerId: string,
  action: GameAction,
  fetcher: ArticleFetcher
): WikiRaceState {
  if (state.phase !== 'RACING') {
    return state;
  }

  const racer = state.racers[playerId];
  if (!racer || racer.finishedRank !== null || racer.loadingTitle !== null) {
    return state;
  }

  const typed = action as WikiRaceAction;

  if (typed.type === 'back') {
    if (racer.path.length <= 1) return state;
    racer.path.pop();
    const previousTitle = racer.path[racer.path.length - 1];
    if (previousTitle) {
      racer.clicks.push(previousTitle);
    }
    racer.hops += 1;
    racer.error = null;
    return state;
  }

  if (typed.type === 'navigate' && typeof typed.payload?.title === 'string') {
    const requestedTitle = typed.payload.title.trim();
    if (!requestedTitle) return state;

    const currentTitle = racer.path[racer.path.length - 1];
    const currentArticle = currentTitle ? getLoadedArticle(state, currentTitle) : undefined;
    if (!currentArticle) return state;

    const requestedKey = normalizeTitle(requestedTitle);
    const isValidLink = currentArticle.links.some(
      (link) => normalizeTitle(link) === requestedKey
    );
    if (!isValidLink) return state;

    const cached = getLoadedArticle(state, requestedTitle);
    if (cached) {
      moveRacerToArticle(ctx, state, playerId, cached);
      return state;
    }

    racer.loadingTitle = requestedTitle;
    racer.error = null;

    fetcher(requestedTitle)
      .then((article) => {
        ctx.dispatch<WikiRaceState>((current) => {
          if (current.phase !== 'RACING') return;
          const currentRacer = current.racers[playerId];
          if (!currentRacer || currentRacer.loadingTitle !== requestedTitle) return;
          recordArticle(current, requestedTitle, article);
          moveRacerToArticle(ctx, current, playerId, article);
        });
      })
      .catch((err) => {
        ctx.dispatch<WikiRaceState>((current) => {
          if (current.phase !== 'RACING') return;
          const currentRacer = current.racers[playerId];
          if (!currentRacer || currentRacer.loadingTitle !== requestedTitle) return;
          currentRacer.loadingTitle = null;
          currentRacer.error = err instanceof Error ? err.message : 'Could not load article.';
        });
      });

    return state;
  }

  return state;
}

export function createWikiRaceGame(
  fetcher: ArticleFetcher = (title) => fetchWikiArticle(title)
): GameDefinition<WikiRaceState, WikiRaceHostView, WikiRacePlayerView> {
  return {
    id: 'wikirace',
    name: 'Wikipedia',
    description:
      'First to race from the start article to the target using only Wikipedia links wins.',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx) {
      return startRace(ctx, fetcher);
    },

    onPlayerAction(ctx, state, playerId, action) {
      return handleAction(ctx, state, playerId, action, fetcher);
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'RESULTS' || state.error !== null) {
        ctx.endGame();
      }
      return state;
    },

    onPlayerJoin(_ctx, state, playerId) {
      if (state.phase === 'RACING' && !state.racers[playerId]) {
        state.racers[playerId] = createInitialRacer(state.startTitle);
      }
      return state;
    },

    onPlayerDisconnect(ctx, state) {
      checkActivePlayers(ctx, state);
      return state;
    },

    onPlayerLeave(ctx, state, playerId) {
      delete state.racers[playerId];
      checkActivePlayers(ctx, state);
      return state;
    },

    getHostView(state, ctx) {
      return {
        phase: state.phase,
        startTitle: state.startTitle,
        targetTitle: state.targetTitle,
        players: buildProgressList(ctx, state),
        winnerId: state.winnerId,
        winnerName: playerName(ctx, state.winnerId),
        winnerPath: state.winnerPath,
        error: state.error,
      };
    },

    getPlayerView(state, playerId, ctx) {
      const racer = state.racers[playerId];
      const currentTitle = racer?.path[racer.path.length - 1] ?? null;
      const article = currentTitle ? getLoadedArticle(state, currentTitle) : undefined;

      return {
        phase: state.phase,
        startTitle: state.startTitle,
        targetTitle: state.targetTitle,
        currentTitle,
        articleHtml: article?.html ?? null,
        hops: racer?.hops ?? 0,
        canGoBack: Boolean(
          state.phase === 'RACING' &&
            racer &&
            racer.finishedRank === null &&
            racer.loadingTitle === null &&
            racer.path.length > 1
        ),
        loading: state.phase === 'LOADING' || Boolean(racer?.loadingTitle),
        loadingTitle: racer?.loadingTitle ?? null,
        error: state.error ?? racer?.error ?? null,
        finishedRank: racer?.finishedRank ?? null,
        winnerId: state.winnerId,
        winnerName: playerName(ctx, state.winnerId),
        winnerPath: state.winnerPath,
        players: buildProgressList(ctx, state),
      };
    },
  };
}

export const wikiraceGame = createWikiRaceGame();
