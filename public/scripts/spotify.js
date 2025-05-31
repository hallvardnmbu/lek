// Helper function to encapsulate Spotify API calls
async function fetchSpotifyAPI(url, options = {}, attempt = 1) {
  try {
    const token = await getValidAccessToken(); // Now gets CLIENT_ID from sessionStorage
    if (!token) { // Should be handled by getValidAccessToken throwing an error
        return { error: true, status: 'auth_error', message: "Failed to get valid access token.", needsReAuth: true };
    }

    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 && attempt < 2) {
      console.log("Spotify API returned 401, attempting token refresh...");
      try {
        await refreshAccessToken(); // Now gets CLIENT_ID from sessionStorage
        return await fetchSpotifyAPI(url, options, attempt + 1); // Retry the request
      } catch (refreshError) {
        console.error("Spotify token refresh failed:", refreshError);
        return { error: true, status: 401, message: "Spotify token refresh failed.", needsReAuth: true };
      }
    }

    if (!response.ok) {
      let message = `Spotify API Error: ${response.statusText}`;
      try {
        const errorData = await response.json();
        message = errorData.error?.message || message;
      } catch (e) { /* ignore if no json body */ }
      return { error: true, status: response.status, message: message, needsReAuth: response.status === 401 };
    }

    if (response.status === 204) { // No Content
      return { success: true, status: 204, data: null };
    }

    const data = await response.json();
    return { success: true, status: response.status, data: data };

  } catch (error) {
    // This catches errors from getValidAccessToken (like no CLIENT_ID) or network errors
    console.error("Error in fetchSpotifyAPI:", error);
    if (error.message.includes("CLIENT_ID not found")) {
        return { error: true, status: 'config_error', message: error.message, needsReAuth: true };
    }
    return { error: true, status: 'network_error', message: error.message, needsReAuth: false };
  }
}


async function isPlaying() {
  const result = await fetchSpotifyAPI("https://api.spotify.com/v1/me/player", { method: "GET" });

  if (result.error) {
    console.error("isPlaying API Error:", result);
    // If 204 (No Content) or 404 (No active device), it's not an error for "isPlaying" logic, but means no player.
    // Let's treat 204 specifically as "not playing" or "no active device"
    if (result.status === 204) {
        // Try to find and activate a device
        const devicesResult = await fetchSpotifyAPI("https://api.spotify.com/v1/me/player/devices", { method: "GET" });
        if (devicesResult.error || !devicesResult.data || devicesResult.data.devices.length === 0) {
            console.error("Could not retrieve devices or no devices available.", devicesResult);
            return { error: true, details: devicesResult, message: "No active player and no devices found." };
        }
        const computerDevice = devicesResult.data.devices.find((device) => device.type === "Computer");
        const deviceToActivate = computerDevice ? computerDevice.id : devicesResult.data.devices[0].id;

        if (deviceToActivate) {
            console.log("Attempting to activate device:", deviceToActivate);
            // Transfer playback to the device. This also starts playback if nothing was playing.
            const transferResult = await fetchSpotifyAPI(`https://api.spotify.com/v1/me/player`, {
                method: "PUT",
                body: JSON.stringify({ device_ids: [deviceToActivate], play: false }) // Transfer but don't force play if nothing was queued
            });
            if (transferResult.error) {
                console.error("Failed to transfer playback to device:", transferResult);
                return { error: true, details: transferResult, message: "Failed to activate a device." };
            }
            // After successful transfer, player state might still be "not playing" until something is explicitly played.
            // For isPlaying, it's probably best to return false here, as it wasn't playing initially.
            return false;
        }
        return false; // No device found or couldn't activate
    }
    return { error: true, details: result }; // For other errors
  }
  // If successful and status is 200 (not 204)
  return result.data ? result.data.is_playing : false;
}

async function playSong(deviceId = null, contextUri = null, uris = null) {
  let url = "https://api.spotify.com/v1/me/player/play";
  if (deviceId) {
    url += `?device_id=${deviceId}`;
  }

  const body = {};
  if (contextUri) {
    body.context_uri = contextUri;
  } else if (uris && uris.length > 0) {
    body.uris = uris;
  }

  const options = {
    method: "PUT",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : null,
  };

  // First, ensure a device is active if no specific device_id is passed and nothing is playing.
  // The isPlaying function now attempts to activate a device if none is active.
  // However, playSong itself should also ensure playback context.
  const currentPlayingStatus = await isPlaying();
  if (typeof currentPlayingStatus === 'object' && currentPlayingStatus.error) {
    console.error("Could not determine player status before playing song:", currentPlayingStatus);
    return { error: true, details: currentPlayingStatus, message: "Could not determine player status." };
  }

  if (!deviceId && !currentPlayingStatus) {
     // isPlaying might have activated a device but returned false as nothing was playing.
     // We might need to re-check for active device or rely on Spotify to pick one.
     // For simplicity, if no deviceId and not playing, Spotify might choose one or fail.
     // If isPlaying activated one, it should be fine.
     console.log("No device specified and not currently playing. Spotify will attempt to use the last active or any available device.");
  }


  const result = await fetchSpotifyAPI(url, options);

  if (result.error) {
    console.error("playSong API Error:", result);
    return { error: true, details: result };
  }
  return true; // Success (202 or 204)
}

async function pauseSong() {
  // Check if playing, but don't activate a device if not.
  const playerState = await fetchSpotifyAPI("https://api.spotify.com/v1/me/player", { method: "GET" });
  if (playerState.success && playerState.status === 200 && playerState.data && !playerState.data.is_playing) {
    console.log("Already paused or nothing to pause.");
    return true; // Nothing to pause
  }
  if (playerState.status === 204) { // No active device / nothing playing
    console.log("No active player to pause.");
    return true;
  }


  const result = await fetchSpotifyAPI("https://api.spotify.com/v1/me/player/pause", { method: "PUT" });

  if (result.error) {
    console.error("pauseSong API Error:", result);
    return { error: true, details: result };
  }
  return true;
}

async function skipSong() {
  const result = await fetchSpotifyAPI("https://api.spotify.com/v1/me/player/next", { method: "POST" });

  if (result.error) {
    console.error("skipSong API Error:", result);
    return { error: true, details: result };
  }
  return true;
}

async function getCurrentSong() {
  const result = await fetchSpotifyAPI("https://api.spotify.com/v1/me/player/currently-playing", { method: "GET" });

  if (result.error) {
    // A 204 (No Content) is not an error for this function, it means nothing is playing.
    // fetchSpotifyAPI returns { success: true, status: 204, data: null } for 204.
    console.error("getCurrentSong API Error:", result);
    return { error: true, details: result };
  }

  if (result.status === 204 || !result.data || !result.data.item) {
    return { playing: false, data: null }; // Nothing currently playing or item is null
  }

  const item = result.data.item;
  return {
    playing: result.data.is_playing,
    data: {
      playlist: result.data.context?.uri.split(":")[2] || null,
      name: item.name,
      artist: item.artists.map((artist) => artist.name).join(", "),
      album: item.album.name,
      duration: item.duration_ms,
      release: item.album.release_date,
      progress: result.data.progress_ms,
      uri: item.uri,
      id: item.id,
    },
  };
}

async function startShufflePlaylist(playlistId) {
  // 1. Ensure playback is active on a device (playSong without args attempts this or uses current)
  const playResult = await playSong(null, `spotify:playlist:${playlistId}`);
  if (playResult && playResult.error) {
    console.error("Failed to start playlist for shuffle:", playResult);
    return { error: true, details: playResult, message: "Failed to start playlist." };
  }

  // 2. Enable shuffle
  const shuffleResult = await fetchSpotifyAPI("https://api.spotify.com/v1/me/player/shuffle?state=true", { method: "PUT" });
  if (shuffleResult.error) {
    console.warn("Failed to enable shuffle mode (might work anyway if player started):", shuffleResult);
    // Not returning error here, as playlist might still play.
  }

  // 3. Optionally skip to next to ensure shuffle takes effect if playlist was already playing at first track
  // This can be added if shuffle doesn't seem to immediately apply.
  // await skipSong();

  return true;
}

async function getPlaylistTracks(playlistId) {
  const result = await fetchSpotifyAPI(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(name,uri,id,duration_ms,artists(name),album(name,images,release_date)))`, { method: "GET" });

  if (result.error) {
    console.error("getPlaylistTracks API Error:", result);
    return { error: true, details: result };
  }
  if (!result.data || !result.data.items) {
    return { error: true, message: "Playlist track data is missing or malformed." };
  }
  return {
    success: true, // Keep this for compatibility if queueRandomSongFromPlaylist expects it
    tracks: result.data.items.filter((item) => item.track).map((item) => item.track),
  };
}

async function queueRandomSongFromPlaylist(playlistId) {
  // Ensure something is playing or a device is active.
  // playSong() handles some of this, but queueing needs an active player.
  const initialPlay = await playSong(); // Tries to ensure player is active without changing context yet
  if (initialPlay && initialPlay.error) {
      console.error("Could not ensure player is active before queueing:", initialPlay);
      return { error: true, details: initialPlay, message: "Player not active for queueing." };
  }

  const playlistData = await getPlaylistTracks(playlistId);
  if (playlistData.error || !playlistData.tracks) {
    console.error("Failed to get playlist tracks for queueing:", playlistData);
    return { error: true, details: playlistData.details || playlistData, message: "Failed to get playlist tracks." };
  }

  const tracks = playlistData.tracks;
  if (tracks.length === 0) {
    return { error: true, message: "Playlist has no tracks to queue." };
  }

  const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

  const queueResult = await fetchSpotifyAPI(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(randomTrack.uri)}`, { method: "POST" });

  if (queueResult.error) {
    console.error("queueRandomSongFromPlaylist API Error:", queueResult);
    return { error: true, details: queueResult };
  }

  return {
    success: true, // Keep for compatibility
    queuedSong: {
      name: randomTrack.name,
      artist: randomTrack.artists.map((artist) => artist.name).join(", "),
      album: randomTrack.album.name,
      duration: randomTrack.duration_ms,
      uri: randomTrack.uri,
      id: randomTrack.id,
      albumArt: randomTrack.album.images && randomTrack.album.images[0] ? randomTrack.album.images[0].url : null,
    },
  };
}

async function updateVolume(volume) {
  const vol = parseInt(volume);
  if (isNaN(vol) || vol < 0 || vol > 100) {
    console.error("Volume must be a number between 0 and 100.");
    return { error: true, message: "Volume must be between 0 and 100." };
  }

  // Spotify API uses volume_percent in the query param AND body. Let's be consistent.
  // The original code had `100 - parseInt(volume)` in query, but `volume` in body.
  // Standardizing to use `volume` as passed (0-100 directly for volume_percent).
  const result = await fetchSpotifyAPI(
    `https://api.spotify.com/v1/me/player/volume?volume_percent=${vol}`,
    {
      method: "PUT",
      // body: JSON.stringify({ volume_percent: vol }) // Body is not strictly needed if in query for this endpoint
    }
  );

  if (result.error) {
    console.error("updateVolume API Error:", result);
    return { error: true, details: result };
  }
  return true;
}
