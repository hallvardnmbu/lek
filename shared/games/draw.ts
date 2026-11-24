export type DrawPhase = 'PROMPTING' | 'DRAWING' | 'VOTING' | 'RESULTS';

export type DrawVoteMode = 'best' | 'worst';

export interface DrawEntry {
  playerId: string;
  playerName: string;
  imageData: string;
  submitted: boolean;
}

export interface DrawVoteResult {
  playerId: string;
  playerName: string;
  imageData: string;
  votes: number;
  isWinner: boolean;
}

export interface DrawHostView {
  round: number;
  phase: DrawPhase;
  prompterId: string;
  prompterName: string;
  prompt: string | null;
  voteMode: DrawVoteMode | null;
  entries: DrawEntry[];
  votedPlayerIds: string[];
  results: DrawVoteResult[];
}

export interface DrawPlayerView {
  round: number;
  phase: DrawPhase;
  isPrompter: boolean;
  prompterName: string;
  prompt: string | null;
  hasSubmitted: boolean;
  myDrawingData: string;
  voteMode: DrawVoteMode | null;
  hasVoted: boolean;
  votedForId: string | null;
  votableEntries: DrawEntry[];
  results: DrawVoteResult[];
}

export type DrawAction =
  | { type: 'submit_prompt'; payload: { text: string } }
  | { type: 'sync_drawing'; payload: { imageData: string } }
  | { type: 'submit_drawing'; payload: { imageData?: string } }
  | { type: 'cast_vote'; payload: { targetPlayerId: string } };
