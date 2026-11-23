import type { GameAction } from '../../shared/protocol';
import type {
  WikiRaceAction,
  WikiRaceHostView,
  WikiRacePlayerProgress,
  WikiRacePlayerView,
  WikiRacePhase,
} from '../../shared/games/wikirace';
import type { GameContext, GameDefinition } from '../game';
import { MAX_GAME_SCORE, awardCappedScore, connectedPlayers, playerName } from './helpers';
import {
  CURATED_PAIRS,
  fetchWikiArticle,
  normalizeTitle,
  type ArticleFetcher,
  type WikiArticle,
} from './wikirace-wiki';

interface RacerState {
  path: string[];
  hops: number;
  finishedRank: number | null;
  loadingTitle: string | null;
  error: string | null;
}

export interface WikiRaceState {
  phase: WikiRacePhase;
  round: number;
  startTitle: string;
  targetTitle: string;
  error: string | null;
  articles: Record<string, WikiArticle>;
  redirects: Record<string, string>;
  racers: Record<string, RacerState>;
  finishedOrder: string[];
  loserId: string | null;
  usedPairs: string[];
}

function pickPair(usedPairs: string[]): readonly [string, string] {
  const available = CURATED_PAIRS.filter(
    ([a, b]) => !usedPairs.includes(`${a}::${b}`)
  );
  const pool = available.length > 0 ? available : CURATED_PAIRS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function createInitialRacer(startTitle: string): RacerState {
  return {
    path: [startTitle],
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
      return a.hops - b.hops || a.name.localeCompare(b.name);
    });
}

function checkRaceCompletion(ctx: GameContext, state: WikiRaceState): void {
  if (state.phase !== 'RACING') return;

  const connected = connectedPlayers(ctx);
  if (connected.length === 0) return;

  const unfinished = connected.filter((p) => !state.racers[p.id]?.finishedRank);
  if (unfinished.length > 0) return;

  state.phase = 'RESULTS';
  state.loserId =
    connected.length >= 2
      ? [...connected].sort(
          (a, b) =>
            (state.racers[b.id]?.finishedRank ?? 0) - (state.racers[a.id]?.finishedRank ?? 0)
        )[0]?.id ?? null
      : null;
  ctx.clearTimer();
  ctx.broadcastEvent('wikirace_finished', { loserId: state.loserId });
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
  const racer = state.racers[playerId];
  if (!racer || racer.finishedRank !== null) return;

  racer.hops += 1;
  racer.path.push(article.title);
  racer.loadingTitle = null;
  racer.error = null;

  if (normalizeTitle(article.title) === normalizeTitle(state.targetTitle)) {
    state.finishedOrder.push(playerId);
    racer.finishedRank = state.finishedOrder.length;
    awardCappedScore(ctx, playerId, Math.max(1, MAX_GAME_SCORE - (racer.finishedRank - 1)));
    checkRaceCompletion(ctx, state);
  }
}

function startRace(
  ctx: GameContext,
  fetcher: ArticleFetcher,
  round: number,
  previousUsedPairs: string[]
): WikiRaceState {
  const [rawStart, rawTarget] = pickPair(previousUsedPairs);
  const pairKey = `${rawStart}::${rawTarget}`;
  const usedPairs =
    previousUsedPairs.length >= CURATED_PAIRS.length
      ? [pairKey]
      : [...previousUsedPairs, pairKey];

  Promise.all([fetcher(rawStart), fetcher(rawTarget)])
    .then(([startArticle, targetArticle]) => {
      ctx.dispatch<WikiRaceState>((state) => {
        if (state.phase !== 'LOADING' || state.round !== round) return;
        recordArticle(state, state.startTitle, startArticle);
        state.startTitle = startArticle.title;
        state.targetTitle = targetArticle.title;
        state.phase = 'RACING';
        for (const p of ctx.getPlayers()) {
          state.racers[p.id] = createInitialRacer(startArticle.title);
        }
        ctx.clearTimer();
      });
    })
    .catch((err) => {
      ctx.dispatch<WikiRaceState>((state) => {
        if (state.phase !== 'LOADING' || state.round !== round) return;
        state.error = err instanceof Error ? err.message : 'Failed to load race articles.';
        ctx.clearTimer();
      });
    });

  return {
    phase: 'LOADING',
    round,
    startTitle: rawStart,
    targetTitle: rawTarget,
    error: null,
    articles: {},
    redirects: {},
    racers: {},
    finishedOrder: [],
    loserId: null,
    usedPairs,
  };
}

function handleAction(
  ctx: GameContext,
  state: WikiRaceState,
  playerId: string | null,
  action: GameAction,
  fetcher: ArticleFetcher
): WikiRaceState {
  const typed = action as WikiRaceAction;

  if (typed.type === 'next_race') {
    if (state.phase === 'RESULTS' || state.error !== null) {
      return startRace(ctx, fetcher, state.round + 1, state.usedPairs);
    }
    return state;
  }

  if (state.phase !== 'RACING' || !playerId) {
    return state;
  }

  const racer = state.racers[playerId];
  if (!racer || racer.finishedRank !== null || racer.loadingTitle !== null) {
    return state;
  }

  if (typed.type === 'back') {
    if (racer.path.length <= 1) return state;
    racer.path.pop();
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

    const round = state.round;
    fetcher(requestedTitle)
      .then((article) => {
        ctx.dispatch<WikiRaceState>((current) => {
          if (current.phase !== 'RACING' || current.round !== round) return;
          const currentRacer = current.racers[playerId];
          if (!currentRacer || currentRacer.loadingTitle !== requestedTitle) return;
          recordArticle(current, requestedTitle, article);
          moveRacerToArticle(ctx, current, playerId, article);
        });
      })
      .catch((err) => {
        ctx.dispatch<WikiRaceState>((current) => {
          if (current.phase !== 'RACING' || current.round !== round) return;
          const currentRacer = current.racers[playerId];
          if (!currentRacer || currentRacer.loadingTitle !== requestedTitle) return;
          currentRacer.loadingTitle = null;
          currentRacer.error = err instanceof Error ? err.message : 'Could not load article.';
          ctx.clearTimer();
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
      'Race from the start article to the target using only Wikipedia links. Last to arrive drinks.',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx) {
      return startRace(ctx, fetcher, 1, []);
    },

    onPlayerAction(ctx, state, playerId, action) {
      return handleAction(ctx, state, playerId, action, fetcher);
    },

    onHostAction(ctx, state, action) {
      return handleAction(ctx, state, null, action, fetcher);
    },

    onPlayerJoin(_ctx, state, playerId) {
      if (state.phase === 'RACING' && !state.racers[playerId]) {
        state.racers[playerId] = createInitialRacer(state.startTitle);
      }
      return state;
    },

    onPlayerDisconnect(ctx, state) {
      checkRaceCompletion(ctx, state);
      return state;
    },

    onPlayerLeave(ctx, state, playerId) {
      delete state.racers[playerId];
      checkRaceCompletion(ctx, state);
      return state;
    },

    getHostView(state, ctx) {
      return {
        phase: state.phase,
        round: state.round,
        startTitle: state.startTitle,
        targetTitle: state.targetTitle,
        players: buildProgressList(ctx, state),
        loserId: state.loserId,
        loserName: playerName(ctx, state.loserId),
        error: state.error,
      };
    },

    getPlayerView(state, playerId, ctx) {
      const racer = state.racers[playerId];
      const currentTitle = racer?.path[racer.path.length - 1] ?? null;
      const article = currentTitle ? getLoadedArticle(state, currentTitle) : undefined;

      return {
        phase: state.phase,
        round: state.round,
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
        error: state.error ?? racer?.error ?? null,
        finishedRank: racer?.finishedRank ?? null,
        isLoser: state.phase === 'RESULTS' && state.loserId === playerId,
        loserName: playerName(ctx, state.loserId),
        players: buildProgressList(ctx, state),
      };
    },
  };
}

export const wikiraceGame = createWikiRaceGame();
