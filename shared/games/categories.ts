export type CategoriesPhase = 'GENERATING' | 'PLAYING' | 'REVEAL';

export interface CategoriesAiInbox {
  categories: string[] | null;
}

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

export interface CategoriesState {
  phase: CategoriesPhase;
  round: number;
  totalRounds: number;
  category: string | null;
  categoryIsAi: boolean;
  votes: Record<string, string>;
  continueVotes: Record<string, boolean>;
  tally: CategoriesTallyEntry[];
  failedIds: string[];
  aiInbox: CategoriesAiInbox;
  fallbackCategories: string[] | null;
}

export interface CategoriesHostView {
  phase: CategoriesPhase;
  round: number;
  totalRounds: number;
  category: string | null;
  categoryIsAi: boolean;
  votedCount: number;
  continueCount: number;
  connectedCount: number;
  tally: CategoriesTallyEntry[];
  failedNames: string[];
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
