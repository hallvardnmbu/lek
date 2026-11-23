import songsJson from './musicquiz-songs.json';

export type MusicQuizPhase = 'INTRO' | 'GUESSING' | 'REVEAL';

export interface MusicQuizSong {
  id: string;
  title: string;
  artist: string;
  previewUrl: string | null;
  deezerId?: number;
}

export interface MusicQuizGuess {
  songId: string;
  at: number;
}

export interface MusicQuizRoundResult {
  playerId: string;
  playerName: string;
  guessSongId: string | null;
  correct: boolean;
  points: number;
}

export interface MusicQuizHostView {
  phase: MusicQuizPhase;
  round: number;
  totalRounds: number;
  audioUrl: string | null;
  song: { title: string; artist: string } | null;
  guessedCount: number;
  connectedCount: number;
  results: MusicQuizRoundResult[];
}

export interface MusicQuizPlayerView {
  phase: MusicQuizPhase;
  round: number;
  totalRounds: number;
  myGuessSongId: string | null;
  guessedCount: number;
  connectedCount: number;
  song: { title: string; artist: string } | null;
  myResult: MusicQuizRoundResult | null;
  results: MusicQuizRoundResult[];
}

export const MUSIC_QUIZ_CATALOG: MusicQuizSong[] = songsJson;
