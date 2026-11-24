export interface GeoPoint {
  lat: number;
  lng: number;
}

export type GeoGuessPhase = 'LOADING' | 'GUESSING' | 'REVEAL';

export interface GeoGuessResultEntry {
  playerId: string;
  name: string;
  color: string;
  guess: GeoPoint | null;
  distanceKm: number | null;
  roundPoints: number | null;
  isWinner: boolean;
  drinks: boolean;
  connected: boolean;
  score: number;
}

export interface GeoGuessHostView {
  phase: GeoGuessPhase;
  round: number;
  totalRounds: number;
  imageUrl: string | null;
  spotLabel: string | null;
  target: GeoPoint | null;
  lockedCount: number;
  totalCount: number;
  lockedPlayerIds: string[];
  players: GeoGuessResultEntry[];
  winnerName: string | null;
  drinkerNames: string[];
  error: string | null;
}

export interface GeoGuessPlayerView {
  phase: GeoGuessPhase;
  round: number;
  totalRounds: number;
  lockedIn: boolean;
  guess: GeoPoint | null;
  target: GeoPoint | null;
  spotLabel: string | null;
  distanceKm: number | null;
  roundPoints: number | null;
  isWinner: boolean;
  drinks: boolean;
}

export type GeoGuessAction = {
  type: 'submit_guess';
  payload: { lat: number; lng: number };
};
