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
  votedPlayerIds: string[];
  continuePlayerIds: string[];
  tally: MostLikelyTallyEntry[];
}

export interface MostLikelyPlayerView {
  phase: MostLikelyPhase;
  round: number;
  totalRounds: number;
  prompt: string | null;
  myVote: string | null;
  myContinueVote: boolean;
  candidates: MostLikelyCandidate[];
  myDrinks: number;
  votedCount: number;
  continueCount: number;
  connectedCount: number;
  tally: MostLikelyTallyEntry[];
  iAmDrinking: boolean;
}
