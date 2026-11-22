export type MostLikelyPhase = 'GENERATING' | 'VOTING' | 'REVEAL';

export interface MostLikelyTallyEntry {
  playerId: string;
  name: string;
  votes: number;
  isDrinker: boolean;
}

/**
 * Shared mutable inbox written by the async prompt generator and read by the
 * game loop. Kept as a stable reference inside the state so prompt delivery
 * survives state object copies.
 */
export interface MostLikelyAiInbox {
  prompts: string[] | null;
}

export interface MostLikelyCandidate {
  id: string;
  name: string;
}

export interface MostLikelyState {
  phase: MostLikelyPhase;
  round: number;
  totalRounds: number;
  prompt: string | null;
  promptIsAi: boolean;
  votes: Record<string, string>;
  tally: MostLikelyTallyEntry[];
  drinkerIds: string[];
  aiInbox: MostLikelyAiInbox;
  aiLoaded: boolean;
  fallbackPrompts: string[] | null;
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
  drinkerNames: string[];
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
