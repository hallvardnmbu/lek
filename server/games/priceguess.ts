import type {
  PriceGuessAction,
  PriceGuessHostView,
  PriceGuessPhase,
  PriceGuessPlayerView,
  PriceGuessProductInfo,
  PriceGuessResultEntry,
} from '../../shared/games/priceguess';
import type { GameContext, GameDefinition } from '../game';
import { allConnected, awardCappedScore, countConnectedActed, playerName } from './helpers';
import {
  fetchRandomProduct,
  type PriceGuessProduct,
  type ProductFetcher,
} from './priceguess-db';

const ROUND_DURATION_MS = 30_000;
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
  winnerId: string | null;
  drinkerId: string | null;
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
    winnerId: null,
    drinkerId: null,
    error: null,
  };
}

function handleRoundAdvance(
  ctx: GameContext,
  fetcher: ProductFetcher,
  state: PriceGuessState,
  action: PriceGuessAction
): PriceGuessState | null {
  if (action.type !== 'next_round' && action.type !== 'skip_product') return null;
  if (state.phase === 'REVEAL' || (action.type === 'skip_product' && state.phase !== 'LOADING')) {
    ctx.clearTimer();
    return startRound(ctx, fetcher, state.round + 1, state.usedIds);
  }
  return state;
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

  const winner = submitted[0] ?? null;
  state.winnerId = winner ? winner.id : null;
  if (winner) {
    awardCappedScore(ctx, winner.id, WIN_POINTS);
  }

  state.drinkerId = null;
  const activePlayers = players.filter((p) => p.connected || state.guesses[p.id]);
  if (activePlayers.length >= 2) {
    const nonSubmitters = activePlayers.filter((p) => !state.guesses[p.id]);
    if (nonSubmitters.length > 0) {
      state.drinkerId = nonSubmitters[Math.floor(Math.random() * nonSubmitters.length)].id;
    } else if (submitted.length >= 2) {
      state.drinkerId = submitted[submitted.length - 1].id;
    }
  }

  ctx.broadcastEvent('priceguess_reveal', {
    winnerId: state.winnerId,
    drinkerId: state.drinkerId,
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
        isWinner: isReveal && state.winnerId === p.id,
        drinks: isReveal && state.drinkerId === p.id,
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
      const advanced = handleRoundAdvance(ctx, fetcher, state, a);
      if (advanced) return advanced;

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

    onHostAction(ctx, state, action) {
      return handleRoundAdvance(ctx, fetcher, state, action) ?? state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'GUESSING') {
        revealRound(ctx, state);
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
        product: toProductInfo(state.product),
        actualPrice: isReveal && state.product ? roundMoney(state.product.price) : null,
        lockedCount,
        totalCount,
        players: buildResultEntries(ctx, state),
        winnerName: playerName(ctx, state.winnerId),
        drinkerName: playerName(ctx, state.drinkerId),
        error: state.error,
      };
    },

    getPlayerView(state, playerId): PriceGuessPlayerView {
      const guess = state.guesses[playerId];
      const isReveal = state.phase === 'REVEAL';

      return {
        phase: state.phase,
        round: state.round,
        productName: state.product?.name ?? null,
        lockedIn: Boolean(guess),
        guess: guess ? roundMoney(guess.price) : null,
        actualPrice: isReveal && state.product ? roundMoney(state.product.price) : null,
        diff: isReveal && guess ? roundMoney(guess.diff) : null,
        isWinner: isReveal && state.winnerId === playerId,
        drinks: isReveal && state.drinkerId === playerId,
      };
    },
  };
}

export const priceGuessGame = createPriceGuessGame();
