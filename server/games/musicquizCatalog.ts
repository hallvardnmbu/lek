import { mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { MUSIC_QUIZ_CATALOG, type MusicQuizSong } from '../../shared/games/musicquiz';
import { spotify, type SpotifyTrack } from '../spotify';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 2;
const CACHE_PATH = resolve(import.meta.dir, '../data/musicquiz-catalog.json');
const DEEZER_API_URL = 'https://api.deezer.com';
const DEEZER_CONCURRENCY = 3;
const DEEZER_DELAY_MS = 250;
const DEEZER_MAX_ATTEMPTS = 3;
const DEEZER_RETRY_DELAY_MS = 3_000;
const DEEZER_ABORT_FAILURES = 10;
const DEEZER_RESULT_LIMIT = 5;

interface CatalogCache {
  version: number;
  fetchedAt: number;
  songs: MusicQuizSong[];
}

export interface DeezerTrack {
  id: number;
  title: string;
  artist: { name: string };
  preview: string;
}

interface DeezerSearchResponse {
  data?: DeezerTrack[];
  error?: { type: string; message: string };
}

type DeezerTrackResponse = DeezerTrack & { error?: { type: string; message: string } };

const previewOverrides = new Map<string, string>();

export function previewUrlFor(song: MusicQuizSong): string | null {
  return previewOverrides.get(song.id) ?? song.previewUrl;
}

export function refreshPreviews(songs: MusicQuizSong[]): void {
  for (const song of songs) {
    if (!song.deezerId) continue;
    void fetchFreshPreview(song).then((url) => {
      if (url) previewOverrides.set(song.id, url);
    });
  }
}

async function fetchFreshPreview(song: MusicQuizSong): Promise<string | null> {
  if (!song.deezerId) return null;
  try {
    const res = await fetch(`${DEEZER_API_URL}/track/${song.deezerId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as DeezerTrackResponse;
    if (data.error || typeof data.preview !== 'string' || !data.preview) return null;
    return data.preview;
  } catch {
    return null;
  }
}

const ALT_VERSION_RE = /\b(remix|live|acoustic|karaoke|instrumental|tribute|sped up|slowed|reverb)\b/i;
const TRIBUTE_ACTIST_RE = /(tribute|karaoke|cover band)/i;

let catalog: MusicQuizSong[] = MUSIC_QUIZ_CATALOG;

export function getMusicQuizCatalog(): MusicQuizSong[] {
  return catalog;
}

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b\.?/g, ' ')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isAltVersion(name: string): boolean {
  const bracketed = [...name.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)]
    .map((match) => `${match[1] ?? ''} ${match[2] ?? ''}`)
    .join(' ');
  const tail = name.includes(' - ') ? name.slice(name.lastIndexOf(' - ')) : '';
  return ALT_VERSION_RE.test(bracketed) || ALT_VERSION_RE.test(tail);
}

export function findDeezerMatch(title: string, artists: string[], results: DeezerTrack[]): DeezerTrack | null {
  const normTitle = normalizeName(title);
  const firstArtist = normalizeName(artists[0] ?? '');
  if (!normTitle || !firstArtist) return null;

  let best: DeezerTrack | null = null;
  let bestScore = 0;
  for (const result of results) {
    if (!result.preview || isAltVersion(result.title) || TRIBUTE_ACTIST_RE.test(result.artist.name)) continue;
    const normResult = normalizeName(result.title);
    const nameScore = normResult === normTitle ? 2 : normResult.startsWith(normTitle) || normTitle.startsWith(normResult) ? 1 : 0;
    if (nameScore === 0) continue;
    const normArtist = normalizeName(result.artist.name);
    if (!normArtist) continue;
    if (!normArtist.includes(firstArtist) && !firstArtist.includes(normArtist)) continue;
    if (nameScore > bestScore) {
      best = result;
      bestScore = nameScore;
    }
  }
  return best;
}

async function attemptDeezerFetch(url: string): Promise<DeezerTrack[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as DeezerSearchResponse;
    if (data.error || !Array.isArray(data.data)) return null;
    return data.data;
  } catch {
    return null;
  }
}

async function fetchDeezerResults(track: SpotifyTrack): Promise<DeezerTrack[] | null> {
  const term = encodeURIComponent(`${track.title} ${track.artists[0] ?? ''}`.trim());
  const url = `${DEEZER_API_URL}/search?q=${term}&limit=${DEEZER_RESULT_LIMIT}`;
  for (let attempt = 1; attempt <= DEEZER_MAX_ATTEMPTS; attempt++) {
    const results = await attemptDeezerFetch(url);
    if (results) return results;
    if (attempt < DEEZER_MAX_ATTEMPTS) await sleep(DEEZER_RETRY_DELAY_MS);
  }
  return null;
}

async function resolvePreviews(tracks: SpotifyTrack[]): Promise<MusicQuizSong[]> {
  const songs: Array<MusicQuizSong | null> = Array.from({ length: tracks.length }, () => null);
  let cursor = 0;
  let processed = 0;
  let consecutiveFailures = 0;
  let aborted = false;

  const worker = async (): Promise<void> => {
    while (!aborted && cursor < tracks.length) {
      const index = cursor++;
      const track = tracks[index];
      const results = await fetchDeezerResults(track);
      if (results === null) {
        consecutiveFailures++;
        if (consecutiveFailures >= DEEZER_ABORT_FAILURES) {
          aborted = true;
          return;
        }
      } else {
        consecutiveFailures = 0;
        const match = findDeezerMatch(track.title, track.artists, results);
        if (match) {
          songs[index] = {
            id: track.id,
            title: track.title,
            artist: track.artists.join(', '),
            previewUrl: null,
            deezerId: match.id,
          };
        }
      }
      processed++;
      if (processed % 100 === 0) {
        console.log(`Music Quiz catalog: matched ${processed}/${tracks.length}`);
      }
      await sleep(DEEZER_DELAY_MS);
    }
  };

  await Promise.all(Array.from({ length: DEEZER_CONCURRENCY }, () => worker()));
  if (aborted) throw new Error('Deezer preview lookups kept failing');
  const resolved = songs.filter((song): song is MusicQuizSong => song !== null);
  if (resolved.length === 0) throw new Error('no matching preview clips found');
  return resolved;
}

async function readCatalogCache(): Promise<CatalogCache | null> {
  try {
    const file = Bun.file(CACHE_PATH);
    if (!(await file.exists())) return null;
    const cache = (await file.json()) as CatalogCache;
    if (cache.version !== CACHE_VERSION || typeof cache.fetchedAt !== 'number' || !Array.isArray(cache.songs)) {
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

async function writeCatalogCache(songs: MusicQuizSong[]): Promise<void> {
  try {
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    await Bun.write(
      CACHE_PATH,
      `${JSON.stringify({ version: CACHE_VERSION, fetchedAt: Date.now(), songs }, undefined, 2)}\n`
    );
  } catch {
    console.warn('Music Quiz catalog: failed to write cache file');
  }
}

export async function initMusicQuizCatalog(): Promise<void> {
  const cache = await readCatalogCache();
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    catalog = cache.songs;
    console.log(`Music Quiz catalog: ${catalog.length} songs (cached)`);
    return;
  }

  const playlistId = process.env.MUSICQUIZ_PLAYLIST_ID;
  if (!playlistId || !spotify.configured) {
    catalog = cache?.songs ?? MUSIC_QUIZ_CATALOG;
    const source = cache ? 'cached' : 'built-in';
    console.log(
      `Music Quiz catalog: ${catalog.length} songs (${source} list; set MUSICQUIZ_PLAYLIST_ID, SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to fetch from Spotify)`
    );
    return;
  }

  console.log('Music Quiz catalog: fetching from Spotify and resolving preview clips (takes about a minute)...');
  try {
    const tracks = await spotify.getPlaylistTracks(playlistId);
    const songs = await resolvePreviews(tracks);
    catalog = songs;
    await writeCatalogCache(songs);
    const skipped = tracks.length - songs.length;
    console.log(
      `Music Quiz catalog: ${songs.length} playable songs (${skipped} skipped, ${tracks.length} playlist tracks)`
    );
  } catch (error) {
    catalog = cache?.songs ?? MUSIC_QUIZ_CATALOG;
    const source = cache ? 'cached' : 'built-in';
    console.warn(
      `Music Quiz catalog: fetch failed (${error instanceof Error ? error.message : String(error)}) - using ${source} list`
    );
  }
}
