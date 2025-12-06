// services/spotify-service.js
import { getValidAccessToken } from './auth-service.js';
import { SPOTIFY_CLIENT_ID } from '../../config.js';

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
        const response = await fetch("https://api.spotify.com/v1/me/player", {
            method: "GET",
            headers: await getAuthHeaders(),
        });

        if (!response.ok) {
            // We throw here instead of redirecting so the caller can decide what to do
            if (response.status === 401) {
                throw new Error("Unauthorized");
            }
            return false; // Could assume false if error, or throw
        } else if (response.status === 204) {
            // No active playback
            if (cachedDeviceId) {
                await playSong(cachedDeviceId);
                return false;
            }

            // Try to find a device
            const devicesResponse = await fetch("https://api.spotify.com/v1/me/player/devices", {
                method: "GET",
                headers: await getAuthHeaders(),
            });

            const devices = await devicesResponse.json();

            if (!devices.devices || devices.devices.length === 0) {
                console.warn("No devices found");
                return false;
            }

            // Prefer "Computer" device
            const computerDevice = devices.devices.find((device) => device.type === "Computer");
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
        // Propagate 401s so we can redirect login
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
        // Check if already playing if no deviceId is forced
        if (!deviceId) {
            try {
                if (await isPlaying()) return;
            } catch (e) {
                if (e.message === "Unauthorized") throw e;
            }
        }

        const url = `https://api.spotify.com/v1/me/player/play${deviceId ? `?device_id=${deviceId}` : ""}`;
        const response = await fetch(url, {
            method: "PUT",
            headers: await getAuthHeaders(),
        });

        if (!response.ok && response.status !== 204) {
            if (response.status === 401) throw new Error("Unauthorized");
            console.warn("Failed to play song", response.status);
        }
    } catch (error) {
        if (error.message === "Unauthorized") throw error;
        // Otherwise ignore or log
    }
}

/**
 * Pauses playback.
 */
export async function pauseSong() {
    try {
        const playing = await isPlaying().catch(e => {
            if (e.message === "Unauthorized") throw e;
            return false;
        });
        if (!playing) return;

        const response = await fetch("https://api.spotify.com/v1/me/player/pause", {
            method: "PUT",
            headers: await getAuthHeaders(),
        });

        if (!response.ok && response.status !== 204) {
            if (response.status === 401) throw new Error("Unauthorized");
        }
    } catch (error) {
        if (error.message === "Unauthorized") throw error;
    }
}

/**
 * Skips to the next song.
 */
export async function skipSong() {
    try {
        const playing = await isPlaying().catch(e => {
            if (e.message === "Unauthorized") throw e;
            return false;
        });
        if (!playing) return;

        const response = await fetch("https://api.spotify.com/v1/me/player/next", {
            method: "POST",
            headers: await getAuthHeaders(),
        });

        if (!response.ok && response.status !== 204) {
            if (response.status === 401) throw new Error("Unauthorized");
        }
    } catch (error) {
        if (error.message === "Unauthorized") throw error;
    }
}

/**
 * Gets information about the currently playing song.
 * @returns {Promise<Object|null>}
 */
export async function getCurrentSong() {
    try {
        const playing = await isPlaying().catch(e => {
            if (e.message === "Unauthorized") throw e;
            return false;
        });
        if (!playing) return null;

        const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
            method: "GET",
            headers: await getAuthHeaders(),
        });

        if (!response.ok && response.status !== 204) {
            if (response.status === 401) throw new Error("Unauthorized");
            return null;
        }

        // 204 = No content
        if (response.status === 204) return null;

        const data = await response.json();

        return {
            playing: data.is_playing,
            data: {
                playlist: data.context?.uri.split(":")[2] || null,
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
        if (error.message === "Unauthorized") throw error;
        return null;
    }
}

/**
 * Fetches a random track from an Album.
 */
async function getRandomTrackFromAlbum(albumId) {
    try {
        const offset = Math.floor(Math.random() * 15);

        const url = `https://api.spotify.com/v1/albums/${albumId}/tracks?offset=${offset}&limit=1`;

        const response = await fetch(url, {
            method: "GET",
            headers: await getAuthHeaders(),
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error("Unauthorized");
            return { success: false };
        }

        const data = await response.json();

        return {
            tracks: data.items,
            success: true
        };
    } catch (e) {
        if (e.message === "Unauthorized") throw e;
        console.error("getRandomTrackFromAlbum error", e);
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
        await playSong();

        const result = await getRandomTrackFromAlbum(albumId);

        if (!result.success || !result.tracks || result.tracks.length === 0) {
            return;
        }

        const randomTrack = result.tracks[0];

        const response = await fetch(
            `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(randomTrack.uri)}`,
            {
                method: "POST",
                headers: await getAuthHeaders(),
            }
        );

        if (!response.ok && response.status !== 200) {
            if (response.status === 401) throw new Error("Unauthorized");
            return;
        }

        // Fetched track object from Album does not always have full details (like Album Art).
        // But the original code constructs a result object.
        return {
            queuedSong: {
                name: randomTrack.name,
                artist: randomTrack.artists.map(a => a.name).join(", "),
                // Album name might not be in the simple track object from album tracks endpoint.
                // It usually is just track info. 
                // However, preserving original return shape.
                album: "Hidden", // Simplified
                duration: randomTrack.duration_ms,
                uri: randomTrack.uri,
                id: randomTrack.id,
                albumArt: null
            }
        };

    } catch (e) {
        if (e.message === "Unauthorized") throw e;
    }
}

export async function updateVolume(volume) {
    try {
        const response = await fetch(
            `https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}`,
            {
                method: "PUT",
                headers: await getAuthHeaders(),
            }
        );

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
        // Ensure we have an active device or try to wake one up
        await isPlaying();

        const deviceId = cachedDeviceId;
        const query = deviceId ? `?device_id=${deviceId}` : "";

        // Enable shuffle
        let shuffleResponse = await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=true${query.replace('?', '&')}`, {
            method: "PUT",
            headers: await getAuthHeaders(),
        });

        // Start playing the playlist
        const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play${query}`, {
            method: "PUT",
            headers: await getAuthHeaders(),
            body: JSON.stringify({
                context_uri: `spotify:playlist:${playlistId}`,
            }),
        });

        if (!playResponse.ok && playResponse.status !== 204) {
            // If 404, it often means no device found even after isPlaying check?
            if (playResponse.status === 404) {
                console.warn("Spotify Device not found (404).");
            } else if (playResponse.status === 401) {
                throw new Error("Unauthorized");
            }
            console.error("Failed to start playing the playlist", playResponse.status);
        }

        // Retry shuffle if needed (sometimes fails if context wasn't active yet)
        if (!shuffleResponse.ok && shuffleResponse.status !== 204) {
            await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=true${query.replace('?', '&')}`, {
                method: "PUT",
                headers: await getAuthHeaders(),
            });
        }

    } catch (error) {
        if (error.message === "Unauthorized") throw error;
        console.error("startShufflePlaylist error", error);
    }
}
