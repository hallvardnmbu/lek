export type PriceGuessPhase = 'LOADING' | 'GUESSING' | 'REVEAL';

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
  product: PriceGuessProductInfo | null;
  actualPrice: number | null;
  lockedCount: number;
  totalCount: number;
  players: PriceGuessResultEntry[];
  winnerName: string | null;
  drinkerName: string | null;
  error: string | null;
}

export interface PriceGuessPlayerView {
  phase: PriceGuessPhase;
  round: number;
  productName: string | null;
  lockedIn: boolean;
  guess: number | null;
  actualPrice: number | null;
  diff: number | null;
  isWinner: boolean;
  drinks: boolean;
}

export type PriceGuessAction =
  | { type: 'submit_guess'; payload: { price: number } }
  | { type: 'next_round' }
  | { type: 'skip_product' };
