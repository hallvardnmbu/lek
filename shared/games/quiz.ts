export type QuizPhase = 'GENERATING' | 'QUESTION' | 'REVEAL';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizAnswer {
  optionIndex: number;
}

export interface QuizRevealEntry {
  playerId: string;
  playerName: string;
  correct: boolean;
  eliminated: boolean;
}

export interface QuizHostView {
  phase: QuizPhase;
  questionNumber: number;
  question: string | null;
  options: string[];
  correctIndex: number | null;
  answeredCount: number;
  connectedAliveCount: number;
  aliveCount: number;
  results: QuizRevealEntry[];
  allWrong: boolean;
  winnerName: string | null;
}

export interface QuizPlayerView {
  phase: QuizPhase;
  questionNumber: number;
  question: string | null;
  options: string[];
  correctIndex: number | null;
  myAnswerIndex: number | null;
  iAmAlive: boolean;
  myCorrect: boolean | null;
  iWasEliminated: boolean;
  answeredCount: number;
  connectedAliveCount: number;
  aliveCount: number;
  results: QuizRevealEntry[];
  allWrong: boolean;
  winnerName: string | null;
}
