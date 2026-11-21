export interface SandboxActionRecord {
  actorId: string;
  type: string;
  payload?: unknown;
  at: number;
}

export interface SandboxGameState {
  startedAt: number;
  lastAction: SandboxActionRecord | null;
  actionCount: number;
}

export interface SandboxPlayerView {
  myScore: number;
  actionCount: number;
  lastActionType: string | null;
}
