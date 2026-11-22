export type WikiRacePhase = 'LOADING' | 'RACING' | 'RESULTS';

export interface WikiRacePlayerProgress {
  playerId: string;
  name: string;
  hops: number;
  finishedRank: number | null;
  connected: boolean;
  currentTitle: string | null;
}

export interface WikiRaceHostView {
  phase: WikiRacePhase;
  round: number;
  startTitle: string;
  targetTitle: string;
  players: WikiRacePlayerProgress[];
  loserId: string | null;
  loserName: string | null;
  error: string | null;
}

export interface WikiRacePlayerView {
  phase: WikiRacePhase;
  round: number;
  startTitle: string;
  targetTitle: string;
  currentTitle: string | null;
  articleHtml: string | null;
  hops: number;
  canGoBack: boolean;
  loading: boolean;
  error: string | null;
  finishedRank: number | null;
  isLoser: boolean;
  loserName: string | null;
  players: WikiRacePlayerProgress[];
}

export type WikiRaceAction =
  | { type: 'navigate'; payload: { title: string } }
  | { type: 'back' }
  | { type: 'next_race' };
