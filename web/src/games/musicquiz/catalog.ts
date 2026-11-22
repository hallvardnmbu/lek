import { createSignal } from 'solid-js';
import { MUSIC_QUIZ_CATALOG, type MusicQuizSong } from '../../../../shared/games/musicquiz';

const [quizCatalog, setQuizCatalog] = createSignal<MusicQuizSong[]>(MUSIC_QUIZ_CATALOG);

let loaded = false;

export async function loadQuizCatalog(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch('/api/musicquiz/songs');
    if (!res.ok) return;
    const body = (await res.json()) as { songs?: unknown };
    if (Array.isArray(body.songs) && body.songs.length > 0) {
      setQuizCatalog(body.songs as MusicQuizSong[]);
    }
  } catch {}
}

export { quizCatalog };

export function songById(id: string | null | undefined): MusicQuizSong | null {
  if (!id) return null;
  return quizCatalog().find((song) => song.id === id) ?? null;
}
