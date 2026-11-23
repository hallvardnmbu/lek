import type {
  CategoriesCandidate,
  CategoriesHostView,
  CategoriesPlayerView,
  CategoriesState,
} from '../../shared/games/categories';
import { cortiAgent, type PromptGenerator } from '../cortiModels';
import type { GameContext, GameDefinition } from '../game';
import {
  allConnected,
  awardCappedScore,
  buildVoteTally,
  connectedPlayers,
  createRoomHistory,
  parseRounds,
  takeUnusedPrompt,
  withoutKey,
} from './helpers';

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
const SURVIVE_POINTS = 1;

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

const categoryHistory = createRoomHistory();

function reveal(ctx: GameContext, state: CategoriesState): CategoriesState {
  const baseTally = buildVoteTally(ctx, state.votes);
  const maxVotes = baseTally[0]?.votes ?? 0;
  const failedIds =
    maxVotes > 0 ? baseTally.filter((t) => t.votes === maxVotes).map((t) => t.playerId) : [];
  const failedSet = new Set(failedIds);

  if (failedIds.length > 0) {
    for (const p of ctx.getPlayers()) {
      if (!failedSet.has(p.id)) {
        awardCappedScore(ctx, p.id, SURVIVE_POINTS);
      }
    }
  }

  state.phase = 'REVEAL';
  state.tally = baseTally.map((t) => ({ ...t, isFailed: failedSet.has(t.playerId) }));
  state.failedIds = failedIds;
  state.continueVotes = {};

  ctx.broadcastEvent('categories_reveal', {
    category: state.category,
    failed: state.tally.filter((t) => t.isFailed).map((t) => t.name),
  });

  return state;
}

function startRound(ctx: GameContext, state: CategoriesState): CategoriesState {
  const fallbackRef = { current: state.fallbackCategories };
  const { text: category, isAi } = takeUnusedPrompt(
    ctx.roomCode,
    categoryHistory,
    state.aiInbox.categories,
    fallbackRef,
    FALLBACK_CATEGORIES
  );
  state.fallbackCategories = fallbackRef.current;
  categoryHistory.remember(ctx.roomCode, category);

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

function viewCounts(ctx: GameContext, state: CategoriesState) {
  const connected = connectedPlayers(ctx);
  return {
    votedCount: connected.filter((p) => state.votes[p.id] !== undefined).length,
    continueCount: connected.filter((p) => state.continueVotes[p.id] === true).length,
    connectedCount: connected.length,
  };
}

function advanceIfReady(ctx: GameContext, state: CategoriesState): CategoriesState {
  if (state.phase === 'PLAYING' && allConnected(ctx, (id) => state.votes[id] !== undefined)) {
    return reveal(ctx, state);
  }
  if (state.phase === 'REVEAL' && allConnected(ctx, (id) => state.continueVotes[id] === true)) {
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
      const totalRounds = parseRounds(config, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_ROUNDS);

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

      void generateCategories(totalRounds, categoryHistory.recent(ctx.roomCode)).then((categories) => {
        state.aiInbox.categories = categories;
      });

      ctx.setTimer(POLL_MS);
      return state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase !== 'GENERATING') return state;
      if (state.aiInbox.categories !== null) {
        return startRound(ctx, state);
      }
      ctx.setTimer(POLL_MS);
      return state;
    },

    onPlayerAction(ctx, state, playerId, action) {
      if (state.phase === 'PLAYING' && action.type === 'vote') {
        const targetId = (action.payload as { targetId?: unknown } | undefined)?.targetId;
        if (typeof targetId !== 'string' || !ctx.getPlayer(targetId)) {
          return state;
        }
        state.votes = { ...state.votes, [playerId]: targetId };
        return advanceIfReady(ctx, state);
      }

      if (state.phase === 'REVEAL' && action.type === 'continue') {
        state.continueVotes = { ...state.continueVotes, [playerId]: true };
        return advanceIfReady(ctx, state);
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

    onPlayerDisconnect(ctx, state) {
      return advanceIfReady(ctx, state);
    },

    onPlayerReconnect(ctx, state) {
      return advanceIfReady(ctx, state);
    },

    onPlayerLeave(ctx, state, playerId) {
      state.votes = withoutKey(state.votes, playerId);
      state.continueVotes = withoutKey(state.continueVotes, playerId);
      return advanceIfReady(ctx, state);
    },

    getHostView(state, ctx): CategoriesHostView {
      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        category: state.category,
        categoryIsAi: state.categoryIsAi,
        ...viewCounts(ctx, state),
        tally: state.tally,
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
        ...viewCounts(ctx, state),
        tally: state.tally,
        iFailed: state.failedIds.includes(playerId),
      };
    },
  };
}

export const categoriesGame = createCategoriesGame();
