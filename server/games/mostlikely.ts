import type {
  MostLikelyCandidate,
  MostLikelyHostView,
  MostLikelyPlayerView,
  MostLikelyState,
  MostLikelyTallyEntry,
} from '../../shared/games/mostlikely';
import { generateMostLikelyPrompts, type PromptGenerator } from '../cortiModels';
import type { GameContext, GameDefinition } from '../game';

const POLL_MS = 500;
const VOTE_MS = 30_000;
const REVEAL_MS = 10_000;
const MIN_ROUNDS = 3;
const MAX_ROUNDS = 20;
const DEFAULT_ROUNDS = 3;
const AVOID_WINDOW = 30;
const MAX_HISTORY_ROOMS = 100;

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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const roomPromptHistory = new Map<string, string[]>();

function rememberPrompt(roomCode: string, prompt: string): void {
  if (!roomPromptHistory.has(roomCode) && roomPromptHistory.size >= MAX_HISTORY_ROOMS) {
    const oldest = roomPromptHistory.keys().next().value;
    if (oldest !== undefined) roomPromptHistory.delete(oldest);
  }
  const used = roomPromptHistory.get(roomCode) ?? [];
  used.push(prompt.toLowerCase());
  roomPromptHistory.set(roomCode, used);
}

function isPromptUsed(roomCode: string, prompt: string): boolean {
  return (roomPromptHistory.get(roomCode) ?? []).includes(prompt.toLowerCase());
}

function recentAvoidList(roomCode: string): string[] {
  return (roomPromptHistory.get(roomCode) ?? []).slice(-AVOID_WINDOW);
}

function connectedPlayers(ctx: GameContext) {
  return ctx.getPlayers().filter((p) => p.connected);
}

function buildTally(ctx: GameContext, votes: Record<string, string>): MostLikelyTallyEntry[] {
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
      isDrinker: false,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
}

function reveal(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  ctx.clearTimer();

  const tally = buildTally(ctx, state.votes);
  const maxVotes = tally[0]?.votes ?? 0;
  const drinkerIds = maxVotes > 0 ? tally.filter((t) => t.votes === maxVotes).map((t) => t.playerId) : [];
  const drinkerSet = new Set(drinkerIds);

  for (const id of drinkerIds) {
    ctx.addPlayerScore(id, 1);
  }

  state.phase = 'REVEAL';
  state.tally = tally.map((t) => ({ ...t, isDrinker: drinkerSet.has(t.playerId) }));
  state.drinkerIds = drinkerIds;

  ctx.broadcastEvent('most_likely_reveal', {
    prompt: state.prompt,
    drinkers: state.tally.filter((t) => t.isDrinker).map((t) => t.name),
  });
  ctx.setTimer(REVEAL_MS);
  return state;
}

function allConnectedVoted(ctx: GameContext, state: MostLikelyState): boolean {
  const players = connectedPlayers(ctx);
  return players.length > 0 && players.every((p) => state.votes[p.id] !== undefined);
}

function connectedVotedCount(ctx: GameContext, state: MostLikelyState): number {
  return connectedPlayers(ctx).filter((p) => state.votes[p.id] !== undefined).length;
}

function maybeReveal(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  if (state.phase === 'VOTING' && allConnectedVoted(ctx, state)) {
    return reveal(ctx, state);
  }
  return state;
}

function takePrompt(roomCode: string, state: MostLikelyState): { prompt: string; isAi: boolean } {
  const aiPrompts = state.aiInbox.prompts;
  if (aiPrompts) {
    while (aiPrompts.length > 0) {
      const candidate = aiPrompts.shift()!;
      if (!isPromptUsed(roomCode, candidate)) {
        return { prompt: candidate, isAi: true };
      }
    }
  }

  for (let attempt = 0; attempt < FALLBACK_PROMPTS.length; attempt++) {
    if (!state.fallbackPrompts || state.fallbackPrompts.length === 0) {
      state.fallbackPrompts = shuffle(FALLBACK_PROMPTS);
    }
    const candidate = state.fallbackPrompts.pop()!;
    if (!isPromptUsed(roomCode, candidate)) {
      return { prompt: candidate, isAi: false };
    }
  }

  return {
    prompt: FALLBACK_PROMPTS[Math.floor(Math.random() * FALLBACK_PROMPTS.length)],
    isAi: false,
  };
}

function startRound(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  const { prompt, isAi } = takePrompt(ctx.roomCode, state);
  rememberPrompt(ctx.roomCode, prompt);
  state.phase = 'VOTING';
  state.round += 1;
  state.prompt = prompt;
  state.promptIsAi = isAi;
  state.votes = {};
  state.tally = [];
  state.drinkerIds = [];
  ctx.setTimer(VOTE_MS);
  return state;
}

function nextRound(ctx: GameContext, state: MostLikelyState): MostLikelyState {
  if (state.round >= state.totalRounds) {
    ctx.endGame();
    return state;
  }
  return startRound(ctx, state);
}

export function createMostLikelyGame(
  generatePrompts: PromptGenerator = generateMostLikelyPrompts
): GameDefinition<MostLikelyState, MostLikelyHostView, MostLikelyPlayerView> {
  return {
    id: 'most-likely',
    name: 'Most Likely To',
    description: 'AI-written edgy prompts. Vote who is most likely — the verdict drinks.',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx, config) {
      const requested = Number(config?.rounds);
      const totalRounds = Number.isFinite(requested)
        ? Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(requested)))
        : DEFAULT_ROUNDS;

      const state: MostLikelyState = {
        phase: 'GENERATING',
        round: 0,
        totalRounds,
        prompt: null,
        promptIsAi: false,
        votes: {},
        tally: [],
        drinkerIds: [],
        aiInbox: { prompts: null },
        aiLoaded: false,
        fallbackPrompts: null,
      };

      void generatePrompts(totalRounds, recentAvoidList(ctx.roomCode)).then((prompts) => {
        state.aiInbox.prompts = prompts;
      });

      ctx.setTimer(POLL_MS);
      return state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'GENERATING') {
        if (state.aiInbox.prompts !== null) {
          state.aiLoaded = true;
          return startRound(ctx, state);
        }
        ctx.setTimer(POLL_MS);
        return state;
      }
      if (state.phase === 'VOTING') {
        return reveal(ctx, state);
      }
      if (state.phase === 'REVEAL') {
        return nextRound(ctx, state);
      }
      return state;
    },

    onPlayerAction(ctx, state, playerId, action) {
      if (state.phase !== 'VOTING' || action.type !== 'vote') {
        return state;
      }
      const targetId = (action.payload as { targetId?: unknown } | undefined)?.targetId;
      if (typeof targetId !== 'string' || !ctx.getPlayer(targetId)) {
        return state;
      }
      state.votes = { ...state.votes, [playerId]: targetId };
      return maybeReveal(ctx, state);
    },

    onHostAction(ctx, state, action) {
      if (action.type !== 'next') {
        return state;
      }
      if (state.phase === 'VOTING') {
        return reveal(ctx, state);
      }
      if (state.phase === 'REVEAL') {
        return nextRound(ctx, state);
      }
      return state;
    },

    onPlayerDisconnect(ctx, state, _playerId) {
      return maybeReveal(ctx, state);
    },

    onPlayerReconnect(ctx, state, _playerId) {
      return maybeReveal(ctx, state);
    },

    onPlayerLeave(ctx, state, playerId) {
      const { [playerId]: _removed, ...votes } = state.votes;
      state.votes = votes;
      return maybeReveal(ctx, state);
    },

    getHostView(state, ctx): MostLikelyHostView {
      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        prompt: state.prompt,
        promptIsAi: state.promptIsAi,
        votedCount: connectedVotedCount(ctx, state),
        connectedCount: connectedPlayers(ctx).length,
        tally: state.tally,
        drinkerNames: state.drinkerIds
          .map((id) => ctx.getPlayer(id)?.name)
          .filter((name): name is string => Boolean(name)),
      };
    },

    getPlayerView(state, playerId, ctx): MostLikelyPlayerView {
      const candidates: MostLikelyCandidate[] = ctx
        .getPlayers()
        .map((p) => ({ id: p.id, name: p.name }));

      return {
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        prompt: state.prompt,
        myVote: state.votes[playerId] ?? null,
        candidates,
        myDrinks: ctx.getPlayer(playerId)?.score ?? 0,
        votedCount: connectedVotedCount(ctx, state),
        connectedCount: connectedPlayers(ctx).length,
        tally: state.tally,
        iAmDrinking: state.drinkerIds.includes(playerId),
      };
    },
  };
}

export const mostLikelyGame = createMostLikelyGame();
