export type CategoriesPhase = 'GENERATING' | 'PLAYING' | 'REVEAL';

export interface CategoriesCandidate {
  id: string;
  name: string;
}

export interface CategoriesTallyEntry {
  playerId: string;
  name: string;
  votes: number;
  isFailed: boolean;
}

export interface CategoriesHostView {
  phase: CategoriesPhase;
  round: number;
  totalRounds: number;
  category: string | null;
  votedPlayerIds: string[];
  continuePlayerIds: string[];
  tally: CategoriesTallyEntry[];
}

export interface CategoriesPlayerView {
  phase: CategoriesPhase;
  round: number;
  totalRounds: number;
  category: string | null;
  myVote: string | null;
  myContinueVote: boolean;
  candidates: CategoriesCandidate[];
  myScore: number;
  votedCount: number;
  continueCount: number;
  connectedCount: number;
  tally: CategoriesTallyEntry[];
  iFailed: boolean;
}
