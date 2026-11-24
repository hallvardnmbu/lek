import type {
  MostLikelyHostView,
  MostLikelyPhase,
  MostLikelyPlayerView,
  MostLikelyTallyEntry,
} from '../../shared/games/mostlikely';
import { cortiAgent, type PromptGenerator } from '../cortiModels';
import type { GameContext, GameDefinition } from '../game';
import {
  actedConnectedIds,
  allConnected,
  awardCappedScore,
  buildVoteTally,
  countConnectedActed,
  createRoomHistory,
  parseRounds,
  takeUnusedPrompt,
  withoutKey,
} from './helpers';

export interface MostLikelyState {
  phase: MostLikelyPhase;
  round: number;
  totalRounds: number;
  prompt: string | null;
  promptIsAi: boolean;
  votes: Record<string, string>;
  continueVotes: Record<string, boolean>;
  tally: MostLikelyTallyEntry[];
  drinkerIds: string[];
  drinks: Record<string, number>;
  aiPrompts: string[] | null;
  fallbackPrompts: string[] | null;
}

const SYSTEM_PROMPT = [
  'You write prompts for the adult party drinking game "Most Likely To".',
  'Every prompt finishes the sentence "Who is most likely to...".',
  'Style: filthy, degenerate, borderline offensive. Sex, kinks, cheating, crime, drugs, death, toxic exes, shame and terrible life choices are all fair game.',
  'Each prompt should make the room gasp and then burst out laughing.',
  'Hard limits: no slurs, no sexual violence, no instructions for real illegal acts, no real named people.',
  'Each prompt is under 18 words, lowercase, no quotes, no numbering, no trailing period.',
].join(' ');

const PROMPT_PREFIX_RE = /^\s*who\s+is\s+(?:the\s+)?most\s+likely\s+to\s*/i;

const defaultGeneratePrompts = cortiAgent.createPromptGenerator({
  systemPrompt: SYSTEM_PROMPT,
  normalize: (p) => p.replace(PROMPT_PREFIX_RE, '').replace(/\?\s*$/, '').trim(),
});

const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;
const DEFAULT_ROUNDS = 3;
const WIN_POINTS = 1;

const FALLBACK_PROMPTS = [
  'wake up in another country with no memory of how they got there',
  'have a secret second family in a neighboring town',
  'get banned from a wedding, their own',
  'start a fight with a swan and lose',
  'have the most cursed search history in the room',
  'become famous for the worst possible reason',
  'sell their soul for a mild discount',
  'marry someone they met in a parking lot',
  'be the reason a group chat ends up on the news',
  'ghost someone and then attend their wedding',
  'own a jacket that smells like poor decisions',
  'have their dating profile written by their worst enemy',
  'win the lottery and immediately lose it to a scam',
  'be found at 4am explaining their life to a mailbox',
  'accidentally join a pyramid scheme and end up running it',
  'have their most embarrassing moment go viral',
  'show up to a funeral in full party gear',
  'trust a stranger with their house keys',
  'star in a documentary they never agreed to',
  'have their ex write their biography',
  'cry in a supermarket over a discontinued snack',
  'get a tattoo in a language they do not speak',
  'believe a psychic over a doctor',
  'become the subject of a true crime podcast',
];

const promptHistory = createRoomHistory();

function reveal(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  const baseTally = buildVoteTally(ctx, state.votes);
  const maxVotes = baseTally[0]?.votes ?? 0;
  const drinkerIds =
    maxVotes > 0 ? baseTally.filter((t) => t.votes === maxVotes).map((t) => t.playerId) : [];
  const drinkerSet = new Set(drinkerIds);

  for (const id of drinkerIds) {
    state.drinks[id] = (state.drinks[id] ?? 0) + 1;
    awardCappedScore(ctx, id, WIN_POINTS);
  }

  state.phase = 'REVEAL';
  state.tally = baseTally.map((t) => ({ ...t, isDrinker: drinkerSet.has(t.playerId) }));
  state.drinkerIds = drinkerIds;
  state.continueVotes = {};

  ctx.broadcastEvent('most_likely_reveal', {
    prompt: state.prompt,
    drinkers: state.tally.filter((t) => t.isDrinker).map((t) => t.name),
  });

  return state;
}

function viewCounts(ctx: GameContext, state: MostLikelyState) {
  const { acted: votedCount, total: connectedCount } = countConnectedActed(
    ctx,
    (id) => state.votes[id] !== undefined
  );
  const { acted: continueCount } = countConnectedActed(
    ctx,
    (id) => state.continueVotes[id] === true
  );
  return { votedCount, continueCount, connectedCount };
}

function startRound(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  const fallbackRef = { current: state.fallbackPrompts };
  const { text: prompt, isAi } = takeUnusedPrompt(
    ctx.roomCode,
    promptHistory,
    state.aiPrompts,
    fallbackRef,
    FALLBACK_PROMPTS
  );
  state.fallbackPrompts = fallbackRef.current;
  promptHistory.remember(ctx.roomCode, prompt);

  state.phase = 'VOTING';
  state.round += 1;
  state.prompt = prompt;
  state.promptIsAi = isAi;
  state.votes = {};
  state.continueVotes = {};
  state.tally = [];
  state.drinkerIds = [];
  return state;
}

function nextRound(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  if (state.round >= state.totalRounds) {
    ctx.endGame();
    return state;
  }
  return startRound(ctx, state);
}

function advanceIfReady(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  if (state.phase === 'VOTING' && allConnected(ctx, (id) => state.votes[id] !== undefined)) {
    return reveal(ctx, state);
  }
  if (state.phase === 'REVEAL' && allConnected(ctx, (id) => state.continueVotes[id] === true)) {
    return nextRound(ctx, state);
  }
  return state;
}

export function createMostLikelyGame(
  generatePrompts: PromptGenerator = defaultGeneratePrompts
): GameDefinition<MostLikelyState, MostLikelyHostView, MostLikelyPlayerView> {
  return {
    id: 'most-likely',
    name: 'Likely',
    description: 'AI-written edgy prompts. Vote who is most likely. The verdict drinks.',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx, config) {
      const totalRounds = parseRounds(config, MIN_ROUNDS, MAX_ROUNDS, DEFAULT_ROUNDS);

      const state: MostLikelyState = {
        phase: 'GENERATING',
        round: 0,
        totalRounds,
        prompt: null,
        promptIsAi: false,
        votes: {},
        continueVotes: {},
        tally: [],
        drinkerIds: [],
        drinks: {},
        aiPrompts: null,
        fallbackPrompts: null,
      };

      void generatePrompts(totalRounds, promptHistory.recent(ctx.roomCode))
        .catch(() => [])
        .then((prompts) => {
          ctx.dispatch<MostLikelyState>((current) => {
            if (current.phase !== 'GENERATING') return;
            current.aiPrompts = prompts;
            return startRound(ctx, current);
          });
        });

      return state;
    },

    onPlayerAction(ctx, state, playerId, action) {
      if (state.phase === 'VOTING' && action.type === 'vote') {
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

    getHostView(state, ctx): MostLikelyHostView {
      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        prompt: state.prompt,
        votedPlayerIds: actedConnectedIds(ctx, (id) => state.votes[id] !== undefined),
        continuePlayerIds: actedConnectedIds(ctx, (id) => state.continueVotes[id] === true),
        tally: state.tally,
      };
    },

    getPlayerView(state, playerId, ctx): MostLikelyPlayerView {
      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        prompt: state.prompt,
        myVote: state.votes[playerId] ?? null,
        myContinueVote: state.continueVotes[playerId] === true,
        candidates: ctx.getPlayers().map((p) => ({ id: p.id, name: p.name })),
        myDrinks: state.drinks[playerId] ?? 0,
        ...viewCounts(ctx, state),
        tally: state.tally,
        iAmDrinking: state.drinkerIds.includes(playerId),
      };
    },
  };
}

export const mostLikelyGame = createMostLikelyGame();
