import type {
  CategoriesCandidate,
  CategoriesHostView,
  CategoriesPlayerView,
  CategoriesState,
  CategoriesTallyEntry,
} from '../../shared/games/categories';
import { cortiAgent, type PromptGenerator } from '../cortiModels';
import type { GameContext, GameDefinition } from '../game';

const SYSTEM_PROMPT = [
  'You generate categories for the spoken party game "Categories".',
  'Players take turns naming an item that fits the category until someone hesitates, repeats, or fails.',
  'Mix everyday topics, pop culture, food, travel, and cheeky adult party topics.',
  'Each category must be easy to understand when read aloud and have at least 15 obvious answers.',
  'Hard limits: no slurs, no hate speech, no real named private individuals.',
  'Each category is 2 to 6 words, no quotes, no numbering, no trailing period.',
].join(' ');

const defaultGenerateCategories = cortiAgent.createPromptGenerator({
  systemPrompt: SYSTEM_PROMPT,
  userPrompt: (count, avoidNote) =>
    `Generate ${count} diverse party-game categories.${avoidNote} Respond with JSON: {"prompts": ["<category>", ...]}`,
  normalize: (p) => p.replace(/\.+$/, '').trim(),
});

const POLL_MS = 500;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;
const DEFAULT_ROUNDS = 3;
const AVOID_WINDOW = 30;
const MAX_HISTORY_ROOMS = 100;

const FALLBACK_CATEGORIES = [
  'Pizza toppings',
  'Car brands',
  'Things in a fridge',
  '90s movies',
  'Excuses for being late',
  'Dog breeds',
  'Countries in Europe',
  'Fast food chains',
  'Things you find at a beach',
  'Reasons to call in sick',
  'Ice cream flavors',
  'Sports played with a ball',
  'Musical instruments',
  'Things in a bathroom',
  'Video game franchises',
  'Cocktails and mixed drinks',
  'Horror movie tropes',
  'Breakfast foods',
  'Things that are yellow',
  'Superheroes',
  'Bad first date locations',
  'Board games',
  'Kitchen appliances',
  'Things you lose often',
];

const roomCategoryHistory = new Map<string, string[]>();

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function rememberCategory(roomCode: string, category: string): void {
  if (!roomCategoryHistory.has(roomCode) && roomCategoryHistory.size >= MAX_HISTORY_ROOMS) {
    const oldest = roomCategoryHistory.keys().next().value;
    if (oldest !== undefined) roomCategoryHistory.delete(oldest);
  }
  const used = roomCategoryHistory.get(roomCode) ?? [];
  used.push(category.toLowerCase());
  roomCategoryHistory.set(roomCode, used);
}

function isCategoryUsed(roomCode: string, category: string): boolean {
  return (roomCategoryHistory.get(roomCode) ?? []).includes(category.toLowerCase());
}

function recentAvoidList(roomCode: string): string[] {
  return (roomCategoryHistory.get(roomCode) ?? []).slice(-AVOID_WINDOW);
}

function connectedPlayers(ctx: GameContext) {
  return ctx.getPlayers().filter((p) => p.connected);
}

function takeCategory(
  roomCode: string,
  state: CategoriesState
): { category: string; isAi: boolean } {
  const aiCategories = state.aiInbox.categories;
  if (aiCategories) {
    while (aiCategories.length > 0) {
      const candidate = aiCategories.shift()!;
      if (!isCategoryUsed(roomCode, candidate)) {
        return { category: candidate, isAi: true };
      }
    }
  }

  for (let attempt = 0; attempt < FALLBACK_CATEGORIES.length; attempt++) {
    if (!state.fallbackCategories || state.fallbackCategories.length === 0) {
      state.fallbackCategories = shuffle(FALLBACK_CATEGORIES);
    }
    const candidate = state.fallbackCategories.pop()!;
    if (!isCategoryUsed(roomCode, candidate)) {
      return { category: candidate, isAi: false };
    }
  }

  return {
    category: FALLBACK_CATEGORIES[Math.floor(Math.random() * FALLBACK_CATEGORIES.length)],
    isAi: false,
  };
}

function buildTally(ctx: GameContext, votes: Record<string, string>): CategoriesTallyEntry[] {
  const counts = new Map<string, number>();
  for (const targetId of Object.values(votes)) {
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  return ctx
    .getPlayers()
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      votes: counts.get(p.id) ?? 0,
      isFailed: false,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

function reveal(ctx: GameContext, state: CategoriesState): CategoriesState {
  const tally = buildTally(ctx, state.votes);
  const maxVotes = tally[0]?.votes ?? 0;
  const failedIds =
    maxVotes > 0 ? tally.filter((t) => t.votes === maxVotes).map((t) => t.playerId) : [];
  const failedSet = new Set(failedIds);

  if (failedIds.length > 0) {
    for (const p of ctx.getPlayers()) {
      if (!failedSet.has(p.id)) {
        ctx.addPlayerScore(p.id, 1);
      }
    }
  }

  state.phase = 'REVEAL';
  state.tally = tally.map((t) => ({ ...t, isFailed: failedSet.has(t.playerId) }));
  state.failedIds = failedIds;
  state.continueVotes = {};

  ctx.broadcastEvent('categories_reveal', {
    category: state.category,
    failed: state.tally.filter((t) => t.isFailed).map((t) => t.name),
  });

  return state;
}

function startRound(ctx: GameContext, state: CategoriesState): CategoriesState {
  const { category, isAi } = takeCategory(ctx.roomCode, state);
  rememberCategory(ctx.roomCode, category);

  state.phase = 'PLAYING';
  state.round += 1;
  state.category = category;
  state.categoryIsAi = isAi;
  state.votes = {};
  state.continueVotes = {};
  state.tally = [];
  state.failedIds = [];
  return state;
}

function nextRound(ctx: GameContext, state: CategoriesState): CategoriesState {
  if (state.round >= state.totalRounds) {
    ctx.endGame();
    return state;
  }
  return startRound(ctx, state);
}

function connectedVotedCount(ctx: GameContext, state: CategoriesState): number {
  return connectedPlayers(ctx).filter((p) => state.votes[p.id] !== undefined).length;
}

function connectedContinueCount(ctx: GameContext, state: CategoriesState): number {
  return connectedPlayers(ctx).filter((p) => state.continueVotes[p.id] === true).length;
}

function maybeReveal(ctx: GameContext, state: CategoriesState): CategoriesState {
  const players = connectedPlayers(ctx);
  if (
    state.phase === 'PLAYING' &&
    players.length > 0 &&
    players.every((p) => state.votes[p.id] !== undefined)
  ) {
    return reveal(ctx, state);
  }
  return state;
}

function maybeContinue(ctx: GameContext, state: CategoriesState): CategoriesState {
  const players = connectedPlayers(ctx);
  if (
    state.phase === 'REVEAL' &&
    players.length > 0 &&
    players.every((p) => state.continueVotes[p.id] === true)
  ) {
    return nextRound(ctx, state);
  }
  return state;
}

export function createCategoriesGame(
  generateCategories: PromptGenerator = defaultGenerateCategories
): GameDefinition<CategoriesState, CategoriesHostView, CategoriesPlayerView> {
  return {
    id: 'categories',
    name: 'Categories',
    description: 'AI picks a category. Go around until someone fails, then vote who failed.',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx, config) {
      const requested = Number(config?.rounds);
      const totalRounds = Number.isFinite(requested)
        ? Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(requested)))
        : DEFAULT_ROUNDS;

      const state: CategoriesState = {
        phase: 'GENERATING',
        round: 0,
        totalRounds,
        category: null,
        categoryIsAi: false,
        votes: {},
        continueVotes: {},
        tally: [],
        failedIds: [],
        aiInbox: { categories: null },
        fallbackCategories: null,
      };

      void generateCategories(totalRounds, recentAvoidList(ctx.roomCode)).then((categories) => {
        state.aiInbox.categories = categories;
      });

      ctx.setTimer(POLL_MS);
      return state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'GENERATING') {
        if (state.aiInbox.categories !== null) {
          return startRound(ctx, state);
        }
        ctx.setTimer(POLL_MS);
        return state;
      }
      return state;
    },

    onPlayerAction(ctx, state, playerId, action) {
      if (state.phase === 'PLAYING' && action.type === 'vote') {
        const targetId = (action.payload as { targetId?: unknown } | undefined)?.targetId;
        if (typeof targetId !== 'string' || !ctx.getPlayer(targetId)) {
          return state;
        }
        state.votes = { ...state.votes, [playerId]: targetId };
        return maybeReveal(ctx, state);
      }

      if (state.phase === 'REVEAL' && action.type === 'continue') {
        state.continueVotes = { ...state.continueVotes, [playerId]: true };
        return maybeContinue(ctx, state);
      }

      return state;
    },

    onHostAction(ctx, state, action) {
      if (action.type !== 'next') {
        return state;
      }
      if (state.phase === 'PLAYING') {
        return reveal(ctx, state);
      }
      if (state.phase === 'REVEAL') {
        return nextRound(ctx, state);
      }
      return state;
    },

    onPlayerDisconnect(ctx, state, _playerId) {
      if (state.phase === 'PLAYING') return maybeReveal(ctx, state);
      if (state.phase === 'REVEAL') return maybeContinue(ctx, state);
      return state;
    },

    onPlayerReconnect(ctx, state, _playerId) {
      if (state.phase === 'PLAYING') return maybeReveal(ctx, state);
      if (state.phase === 'REVEAL') return maybeContinue(ctx, state);
      return state;
    },

    onPlayerLeave(ctx, state, playerId) {
      const { [playerId]: _removedVote, ...votes } = state.votes;
      const { [playerId]: _removedContinue, ...continueVotes } = state.continueVotes;
      state.votes = votes;
      state.continueVotes = continueVotes;
      if (state.phase === 'PLAYING') return maybeReveal(ctx, state);
      if (state.phase === 'REVEAL') return maybeContinue(ctx, state);
      return state;
    },

    getHostView(state, ctx): CategoriesHostView {
      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        category: state.category,
        categoryIsAi: state.categoryIsAi,
        votedCount: connectedVotedCount(ctx, state),
        continueCount: connectedContinueCount(ctx, state),
        connectedCount: connectedPlayers(ctx).length,
        tally: state.tally,
        failedNames: state.failedIds
          .map((id) => ctx.getPlayer(id)?.name)
          .filter((name): name is string => Boolean(name)),
      };
    },

    getPlayerView(state, playerId, ctx): CategoriesPlayerView {
      const candidates: CategoriesCandidate[] = ctx
        .getPlayers()
        .map((p) => ({ id: p.id, name: p.name }));

      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        category: state.category,
        myVote: state.votes[playerId] ?? null,
        myContinueVote: state.continueVotes[playerId] === true,
        candidates,
        myScore: ctx.getPlayer(playerId)?.score ?? 0,
        votedCount: connectedVotedCount(ctx, state),
        continueCount: connectedContinueCount(ctx, state),
        connectedCount: connectedPlayers(ctx).length,
        tally: state.tally,
        iFailed: state.failedIds.includes(playerId),
      };
    },
  };
}

export const categoriesGame = createCategoriesGame();
