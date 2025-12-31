// services/spotify-service.js
import { getValidAccessToken } from "./auth-service.js";
import { SPOTIFY_CLIENT_ID } from "../../config.js";

let cachedDeviceId = null;

// Helper to get client ID
function getClientId() {
  return SPOTIFY_CLIENT_ID;
}

/**
 * Constructs Authorization and Content-Type headers.
 */
async function getAuthHeaders() {
  const token = await getValidAccessToken(getClientId());
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Checks if music is currently playing on Spotify.
 * Updates cached device ID if possible.
 * @returns {Promise<boolean>}
 */
export async function isPlaying() {
  try {
    const response = await fetch("/api/spotify/player", {
      method: "GET",
    });

    if (!response.ok) {
        if (response.status === 401) throw new Error("Unauthorized");
        return false;
    } else if (response.status === 204) {
      if (cachedDeviceId) {
          await playSong(cachedDeviceId);
          return false;
      }
      
      const devicesResponse = await fetch("/api/spotify/devices");
      const devices = await devicesResponse.json();

      if (!devices.devices || devices.devices.length === 0) {
        console.warn("No devices found");
        return false;
      }

      const computerDevice = devices.devices.find(d => d.type === "Computer");
      const deviceId = computerDevice ? computerDevice.id : devices.devices[0].id;

      cachedDeviceId = deviceId;
      await playSong(deviceId);
      return false;
    }

    const data = await response.json();
    if (data.device && data.device.id) {
      cachedDeviceId = data.device.id;
    }
    return data.is_playing;
  } catch (error) {
    console.error("isPlaying error:", error);
    if (error.message === "Unauthorized") throw error;
    return false;
  }
}

/**
 * Resumes playback.
 * @param {string} [deviceId]
 */
export async function playSong(deviceId = null) {
  try {
    const body = {};
    if (deviceId) body.device_id = deviceId;

    const response = await fetch("/api/spotify/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 401) window.location.href = "/spotify";
      return;
    }
  } catch (error) {
    window.location.href = "/spotify";
  }
}

/**
 * Pauses playback.
 */
export async function pauseSong() {
  try {
    const response = await fetch("/api/spotify/player/pause", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
       if (response.status === 401) window.location.href = "/spotify";
       return;
    }
  } catch (error) {
    window.location.href = "/spotify";
  }
}

/**
 * Skips to the next song.
 */
export async function skipSong() {
  try {
    const response = await fetch("/api/spotify/player/next", {
      method: "POST",
    });

    if (!response.ok) {
        if (response.status === 401) window.location.href = "/spotify";
        return;
    }
  } catch (error) {
    window.location.href = "/spotify";
  }
}

/**
 * Gets information about the currently playing song.
 * @returns {Promise<Object|null>}
 */
export async function getCurrentSong() {
  try {
    const response = await fetch("/api/spotify/player/currently-playing", {
      method: "GET",
    });

    if (!response.ok) {
       if (response.status === 401) window.location.href = "/spotify";
       return null;
    }

    const data = await response.json();
    if (!data || !data.item) return null;

    return {
      playing: data.is_playing,
      data: {
        playlist: data.context?.uri?.split(":")[2] || null,
        name: data.item.name,
        artist: data.item.artists.map((artist) => artist.name).join(", "),
        album: data.item.album.name,
        duration: data.item.duration_ms,
        release: data.item.album.release_date,
        progress: data.progress_ms,
        uri: data.item.uri,
        id: data.item.id,
      },
    };
  } catch (error) {
    window.location.href = "/spotify";
    return null;
  }
}

/**
 * Fetches tracks from an album.
 */
async function getAlbumTracks(albumId) {
  try {
      const response = await fetch(`/api/spotify/albums/${albumId}/tracks`); // Using the specific albums proxy
      if (!response.ok) {
          if (response.status === 401) throw new Error("Unauthorized");
          return { success: false };
      }
      const data = await response.json();
      return { tracks: data.items, success: true };
  } catch (e) {
      if (e.message === "Unauthorized") throw e;
      return { success: false };
  }
}

/**
 * Queues a random song from a specific Album ID.
 * @param {string} albumId
 * @returns {Promise<Object|undefined>}
 */
export async function queueRandomSongFromAlbum(albumId) {
  try {
    // Note: The specific implementation for album random tracks might need a server-side endpoint 
    // but we can use the existing proxy for now if it supports it.
    // Assuming the proxy works for general requests.
    const result = await getAlbumTracks(albumId);

    if (!result.success || !result.tracks || result.tracks.length === 0) return;

    const randomTrack = result.tracks[Math.floor(Math.random() * result.tracks.length)];

    const response = await fetch("/api/spotify/player/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri: randomTrack.track?.uri || randomTrack.uri }),
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("Unauthorized");
      return;
    }

    const t = randomTrack.track || randomTrack;
    return {
      queuedSong: {
        name: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album: "Queued",
        duration: t.duration_ms,
        uri: t.uri,
        id: t.id,
      },
    };
  } catch (e) {
    if (e.message === "Unauthorized") throw e;
  }
}

export async function updateVolume(volume) {
  try {
    const response = await fetch("/api/spotify/player/volume", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volume_percent: volume }),
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("Unauthorized");
    }
  } catch (e) {
    if (e.message === "Unauthorized") throw e;
  }
}

/**
 * Starts a playlist in shuffle mode.
 * @param {string} playlistId
 */
export async function startShufflePlaylist(playlistId) {
  try {
    await isPlaying();

    await fetch("/api/spotify/player/shuffle", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: true }),
    });

    const playResponse = await fetch("/api/spotify/player/play", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        context_uri: `spotify:playlist:${playlistId}`,
      }),
    });

    if (!playResponse.ok) {
      window.location.href = "/spotify";
    }
  } catch (error) {
    window.location.href = "/spotify";
  }
}
