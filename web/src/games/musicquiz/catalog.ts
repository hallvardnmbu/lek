import { createSignal } from 'solid-js';
import { MUSIC_QUIZ_CATALOG, type MusicQuizSong } from '../../../../shared/games/musicquiz';

const [quizCatalog, setQuizCatalog] = createSignal<MusicQuizSong[]>(MUSIC_QUIZ_CATALOG);

let loaded = false;

export function loadQuizCatalog(): void {
  if (loaded) return;
  loaded = true;
  fetch('/api/musicquiz/songs')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`catalog request failed (${res.status})`))))
    .then((body: { songs?: unknown }) => {
      if (Array.isArray(body.songs) && body.songs.length > 0) {
        setQuizCatalog(body.songs as MusicQuizSong[]);
      }
    })
    .catch(() => {});
}

export { quizCatalog };
