export type MostLikelyPhase = 'GENERATING' | 'VOTING' | 'REVEAL';

export interface MostLikelyTallyEntry {
  playerId: string;
  name: string;
  votes: number;
  isDrinker: boolean;
}

export interface MostLikelyCandidate {
  id: string;
  name: string;
}

export interface MostLikelyHostView {
  phase: MostLikelyPhase;
  round: number;
  totalRounds: number;
  prompt: string | null;
  promptIsAi: boolean;
  votedCount: number;
  connectedCount: number;
  tally: MostLikelyTallyEntry[];
}

export interface MostLikelyPlayerView {
  phase: MostLikelyPhase;
  round: number;
  totalRounds: number;
  prompt: string | null;
  myVote: string | null;
  candidates: MostLikelyCandidate[];
  myDrinks: number;
  votedCount: number;
  connectedCount: number;
  tally: MostLikelyTallyEntry[];
  iAmDrinking: boolean;
}
