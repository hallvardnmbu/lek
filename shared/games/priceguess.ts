export type PriceGuessPhase = 'LOADING' | 'GUESSING' | 'REVEAL';

export type PriceGuessDrinkReason = 'no_guess' | 'furthest' | null;

export interface PriceGuessProductInfo {
  name: string;
  category: string;
  subcategory: string | null;
  country: string;
  district: string | null;
  description: string;
  alcohol: number;
  year: number | null;
  imageUrl: string | null;
}

export interface PriceGuessResultEntry {
  playerId: string;
  name: string;
  guess: number | null;
  diff: number | null;
  isWinner: boolean;
  drinks: boolean;
  connected: boolean;
  score: number;
}

export interface PriceGuessHostView {
  phase: PriceGuessPhase;
  round: number;
  totalRounds: number;
  product: PriceGuessProductInfo | null;
  actualPrice: number | null;
  lockedCount: number;
  totalCount: number;
  lockedPlayerIds: string[];
  players: PriceGuessResultEntry[];
  winnerNames: string[];
  drinkerNames: string[];
  drinkReason: PriceGuessDrinkReason;
  error: string | null;
}

export interface PriceGuessPlayerView {
  phase: PriceGuessPhase;
  round: number;
  totalRounds: number;
  productName: string | null;
  lockedIn: boolean;
  guess: number | null;
  actualPrice: number | null;
  diff: number | null;
  isWinner: boolean;
  drinks: boolean;
}

export type PriceGuessAction = {
  type: 'submit_guess';
  payload: { price: number };
};
