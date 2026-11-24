export const STEP_ANIM_MS = 950;
export const POST_PATH_HOLD_MS = 3_000;

export type WikiRacePhase = 'LOADING' | 'RACING' | 'RESULTS';

export interface WikiRacePlayerProgress {
  playerId: string;
  name: string;
  hops: number;
  finishedRank: number | null;
  connected: boolean;
}

export interface WikiRaceHostView {
  phase: WikiRacePhase;
  startTitle: string;
  targetTitle: string;
  players: WikiRacePlayerProgress[];
  winnerId: string | null;
  winnerName: string | null;
  winnerPath: string[];
  error: string | null;
}

export interface WikiRacePlayerView {
  phase: WikiRacePhase;
  startTitle: string;
  targetTitle: string;
  currentTitle: string | null;
  articleHtml: string | null;
  hops: number;
  canGoBack: boolean;
  loading: boolean;
  loadingTitle: string | null;
  error: string | null;
  finishedRank: number | null;
  winnerId: string | null;
  winnerName: string | null;
  winnerPath: string[];
  players: WikiRacePlayerProgress[];
}

export type WikiRaceAction =
  | { type: 'navigate'; payload: { title: string } }
  | { type: 'back' };
