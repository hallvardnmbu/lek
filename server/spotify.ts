const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';
const PLAYLIST_PAGE_LIMIT = 100;
const TOKEN_REFRESH_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_TTL_MS = 3_600_000;

export interface SpotifyTrack {
  id: string;
  title: string;
  artists: string[];
}

interface SpotifyApiTrack {
  id: string;
  type: string;
  name: string;
  artists: Array<{ name: string }>;
}

interface SpotifyPlaylistPage {
  total: number;
  items: Array<{ track: SpotifyApiTrack | null } | null>;
}

export class SpotifyClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly clientId: string | undefined = process.env.SPOTIFY_CLIENT_ID,
    private readonly clientSecret: string | undefined = process.env.SPOTIFY_CLIENT_SECRET
  ) {}

  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    if (!this.configured) {
      throw new Error('Spotify client credentials missing (set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET)');
    }
    const tracks: SpotifyTrack[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    do {
      const res = await this.authedFetch(
        `${API_URL}/playlists/${playlistId}/tracks?limit=${PLAYLIST_PAGE_LIMIT}&offset=${offset}`
      );
      if (!res.ok) throw new Error(`Spotify playlist request failed (${res.status})`);
      const page = (await res.json()) as SpotifyPlaylistPage;
      total = page.total;
      for (const item of page.items) {
        const track = item?.track;
        if (!track?.id || track.type !== 'track' || seen.has(track.id)) continue;
        seen.add(track.id);
        tracks.push({ id: track.id, title: track.name, artists: track.artists.map((artist) => artist.name) });
      }
      offset += PLAYLIST_PAGE_LIMIT;
    } while (offset < total);
    return tracks;
  }

  private async authedFetch(url: string): Promise<Response> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await this.ensureToken()}` } });
    if (res.status === 401) {
      return fetch(url, { headers: { Authorization: `Bearer ${await this.fetchToken()}` } });
    }
    return res;
  }

  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    return this.fetchToken();
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('Spotify token response missing access_token');
    this.token = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 1) * 1000 - TOKEN_REFRESH_MARGIN_MS;
    if (this.tokenExpiresAt <= Date.now()) this.tokenExpiresAt = Date.now() + DEFAULT_TOKEN_TTL_MS;
    return this.token;
  }
}

export const spotify = new SpotifyClient();
