import type {
  PriceGuessAction,
  PriceGuessDrinkReason,
  PriceGuessHostView,
  PriceGuessPhase,
  PriceGuessPlayerView,
  PriceGuessProductInfo,
  PriceGuessResultEntry,
} from '../../shared/games/priceguess';
import type { GameContext, GameDefinition } from '../game';
import {
  actedConnectedIds,
  allConnected,
  awardCappedScore,
  countConnectedActed,
  playerName,
} from './helpers';
import {
  fetchRandomProduct,
  type PriceGuessProduct,
  type ProductFetcher,
} from './priceguess-db';

const ROUND_DURATION_MS = 30_000;
export const REVEAL_DURATION_MS = 7_500;
export const TOTAL_ROUNDS = 3;
const WIN_POINTS = 2;

interface GuessEntry {
  price: number;
  diff: number;
}

interface PriceGuessState {
  phase: PriceGuessPhase;
  round: number;
  product: PriceGuessProduct | null;
  guesses: Record<string, GuessEntry>;
  usedIds: string[];
  winnerIds: string[];
  drinkerIds: string[];
  drinkReason: PriceGuessDrinkReason;
  error: string | null;
}

function toProductInfo(product: PriceGuessProduct | null): PriceGuessProductInfo | null {
  if (!product) return null;
  return {
    name: product.name,
    category: product.category,
    subcategory: product.subcategory,
    country: product.country,
    district: product.district,
    description: product.description,
    alcohol: product.alcohol,
    year: product.year,
    imageUrl: product.imageUrl,
  };
}

function startRound(
  ctx: GameContext,
  fetcher: ProductFetcher,
  round: number,
  previousUsedIds: string[]
): PriceGuessState {
  const usedIds = previousUsedIds.length >= 100 ? [] : [...previousUsedIds];

  fetcher(usedIds)
    .then((product) => {
      ctx.dispatch<PriceGuessState>((state) => {
        if (state.phase !== 'LOADING' || state.round !== round) return;
        state.product = product;
        state.usedIds.push(product.id);
        state.phase = 'GUESSING';
        ctx.setTimer(ROUND_DURATION_MS);
      });
    })
    .catch((err) => {
      ctx.dispatch<PriceGuessState>((state) => {
        if (state.phase !== 'LOADING' || state.round !== round) return;
        state.error = err instanceof Error ? err.message : 'Failed to load product.';
        ctx.clearTimer();
      });
    });

  return {
    phase: 'LOADING',
    round,
    product: null,
    guesses: {},
    usedIds,
    winnerIds: [],
    drinkerIds: [],
    drinkReason: null,
    error: null,
  };
}

function advanceRound(
  ctx: GameContext,
  fetcher: ProductFetcher,
  state: PriceGuessState
): PriceGuessState {
  if (state.round >= TOTAL_ROUNDS) {
    ctx.endGame();
    return state;
  }
  ctx.clearTimer();
  return startRound(ctx, fetcher, state.round + 1, state.usedIds);
}

function revealRound(ctx: GameContext, state: PriceGuessState): void {
  if (state.phase !== 'GUESSING') return;

  ctx.clearTimer();
  state.phase = 'REVEAL';

  const players = ctx.getPlayers();
  const submitted = players
    .filter((p) => Boolean(state.guesses[p.id]))
    .map((p) => ({
      id: p.id,
      diff: state.guesses[p.id].diff,
    }))
    .sort((a, b) => a.diff - b.diff);

  state.winnerIds = [];
  if (submitted.length > 0) {
    const minDiff = submitted[0].diff;
    state.winnerIds = submitted.filter((s) => s.diff === minDiff).map((s) => s.id);
    for (const id of state.winnerIds) {
      awardCappedScore(ctx, id, WIN_POINTS);
    }
  }

  state.drinkerIds = [];
  state.drinkReason = null;
  const activePlayers = players.filter((p) => p.connected || Boolean(state.guesses[p.id]));
  if (activePlayers.length >= 2) {
    const nonSubmitters = activePlayers.filter((p) => !state.guesses[p.id]);
    if (nonSubmitters.length > 0) {
      state.drinkerIds = nonSubmitters.map((p) => p.id);
      state.drinkReason = 'no_guess';
    } else if (submitted.length >= 2) {
      const maxDiff = submitted[submitted.length - 1].diff;
      const minDiff = submitted[0].diff;
      if (maxDiff > minDiff) {
        state.drinkerIds = submitted.filter((s) => s.diff === maxDiff).map((s) => s.id);
        state.drinkReason = 'furthest';
      }
    }
  }

  ctx.setTimer(REVEAL_DURATION_MS, false);
  ctx.broadcastEvent('priceguess_reveal', {
    winnerIds: state.winnerIds,
    drinkerIds: state.drinkerIds,
    drinkReason: state.drinkReason,
    actualPrice: state.product?.price ?? null,
  });
}

function maybeRevealOnAllGuessed(ctx: GameContext, state: PriceGuessState): void {
  if (state.phase === 'GUESSING' && allConnected(ctx, (id) => Boolean(state.guesses[id]))) {
    revealRound(ctx, state);
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildResultEntries(ctx: GameContext, state: PriceGuessState): PriceGuessResultEntry[] {
  const isReveal = state.phase === 'REVEAL';
  return ctx
    .getPlayers()
    .map((p) => {
      const guess = state.guesses[p.id];
      return {
        playerId: p.id,
        name: p.name,
        guess: isReveal && guess ? roundMoney(guess.price) : null,
        diff: isReveal && guess ? roundMoney(guess.diff) : null,
        isWinner: isReveal && state.winnerIds.includes(p.id),
        drinks: isReveal && state.drinkerIds.includes(p.id),
        connected: p.connected,
        score: p.score,
      };
    })
    .sort((a, b) => {
      if (isReveal) {
        if (a.diff !== null && b.diff !== null) {
          return a.diff - b.diff;
        }
        if (a.diff !== null) return -1;
        if (b.diff !== null) return 1;
      }
      return b.score - a.score || a.name.localeCompare(b.name);
    });
}

export function createPriceGuessGame(
  fetcher: ProductFetcher = fetchRandomProduct
): GameDefinition<PriceGuessState, PriceGuessHostView, PriceGuessPlayerView, PriceGuessAction> {
  return {
    id: 'priceguess',
    name: 'Price',
    description: 'Guess the price of a random bottle. Closest wins, furthest drinks!',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx) {
      return startRound(ctx, fetcher, 1, []);
    },

    onPlayerAction(ctx, state, playerId, action) {
      const a = action as PriceGuessAction;
      if (a.type !== 'submit_guess') return state;
      if (state.phase !== 'GUESSING' || !state.product) return state;

      const price = Number(a.payload?.price);
      if (!Number.isFinite(price) || price < 0) return state;

      state.guesses[playerId] = {
        price,
        diff: Math.abs(price - state.product.price),
      };

      maybeRevealOnAllGuessed(ctx, state);
      return state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'GUESSING') {
        revealRound(ctx, state);
        return state;
      }
      if (state.phase === 'REVEAL') {
        return advanceRound(ctx, fetcher, state);
      }
      return state;
    },

    onPlayerDisconnect(ctx, state) {
      maybeRevealOnAllGuessed(ctx, state);
      return state;
    },

    onPlayerLeave(ctx, state, playerId) {
      delete state.guesses[playerId];
      maybeRevealOnAllGuessed(ctx, state);
      return state;
    },

    getHostView(state, ctx): PriceGuessHostView {
      const { acted: lockedCount, total: totalCount } = countConnectedActed(ctx, (id) =>
        Boolean(state.guesses[id])
      );
      const isReveal = state.phase === 'REVEAL';

      return {
        phase: state.phase,
        round: state.round,
        totalRounds: TOTAL_ROUNDS,
        product: toProductInfo(state.product),
        actualPrice: isReveal && state.product ? roundMoney(state.product.price) : null,
        lockedCount,
        totalCount,
        lockedPlayerIds: actedConnectedIds(ctx, (id) => Boolean(state.guesses[id])),
        players: buildResultEntries(ctx, state),
        winnerNames: state.winnerIds
          .map((id) => playerName(ctx, id))
          .filter((name): name is string => Boolean(name)),
        drinkerNames: state.drinkerIds
          .map((id) => playerName(ctx, id))
          .filter((name): name is string => Boolean(name)),
        drinkReason: state.drinkReason,
        error: state.error,
      };
    },

    getPlayerView(state, playerId): PriceGuessPlayerView {
      const guess = state.guesses[playerId];
      const isReveal = state.phase === 'REVEAL';

      return {
        phase: state.phase,
        round: state.round,
        totalRounds: TOTAL_ROUNDS,
        productName: state.product?.name ?? null,
        lockedIn: Boolean(guess),
        guess: guess ? roundMoney(guess.price) : null,
        actualPrice: isReveal && state.product ? roundMoney(state.product.price) : null,
        diff: isReveal && guess ? roundMoney(guess.diff) : null,
        isWinner: isReveal && state.winnerIds.includes(playerId),
        drinks: isReveal && state.drinkerIds.includes(playerId),
      };
    },
  };
}

export const priceGuessGame = createPriceGuessGame();
