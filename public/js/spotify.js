async function playSong() {
  try {
    const response = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok && response.status !== 204) {
      console.error(`Play error: ${response.status}`);
      return { success: false, status: response.status };
    }

    return { success: true };
  } catch (error) {
    console.error("Error playing song:", error);
    return { success: false, error: error.message };
  }
}

async function pauseSong() {
  try {
    const response = await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok && response.status !== 204) {
      console.error(`Pause error: ${response.status} ${response.statusText}`);
      return { success: false, status: response.status };
    }

    return { success: true };
  } catch (error) {
    console.error("Error pausing song:", error);
    return { success: false, error: error.message };
  }
}

async function skipSong() {
  try {
    const response = await fetch("https://api.spotify.com/v1/me/player/next", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
      },
    });

    if (!response.ok && response.status !== 204) {
      console.error(`Skip error: ${response.status}`);
      return { success: false, status: response.status };
    }

    return { success: true };
  } catch (error) {
    console.error("Error skipping song:", error);
    return { success: false, error: error.message };
  }
}

async function getCurrentSong() {
  try {
    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
      },
    });

    // 204 means success but no content (nothing playing)
    if (response.status === 204) {
      return { playing: false, data: null };
    }

    if (!response.ok) {
      console.error(`Get current song error: ${response.status}`);
      return { success: false, status: response.status };
    }

    const data = await response.json();

    return {
      success: true,
      playing: data.is_playing,
      data: {
        name: data.item.name,
        artist: data.item.artists.map((artist) => artist.name).join(", "),
        album: data.item.album.name,
        duration: data.item.duration_ms,
        progress: data.progress_ms,
        albumArt: data.item.album.images[0]?.url || null,
        uri: data.item.uri,
        id: data.item.id,
      },
    };
  } catch (error) {
    console.error("Error getting current song:", error);
    return { success: false, error: error.message };
  }
}

async function startShufflePlaylist(playlistId) {
  try {
    // First enable shuffle mode
    const shuffleResponse = await fetch("https://api.spotify.com/v1/me/player/shuffle?state=true", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
      },
    });

    if (!shuffleResponse.ok && shuffleResponse.status !== 204) {
      console.error(`Enable shuffle error: ${shuffleResponse.status}`);
      return { success: false, status: shuffleResponse.status, phase: "shuffle" };
    }

    // Then start playing the playlist
    const playResponse = await fetch("https://api.spotify.com/v1/me/player/play", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context_uri: `spotify:playlist:${playlistId}`,
      }),
    });

    if (!playResponse.ok && playResponse.status !== 204) {
      console.error(`Play playlist error: ${playResponse.status}`);
      return { success: false, status: playResponse.status, phase: "play" };
    }

    return { success: true };
  } catch (error) {
    console.error("Error starting shuffle playlist:", error);
    return { success: false, error: error.message };
  }
}

async function getPlaylistTracks(playlistId) {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        },
      },
    );

    if (!response.ok) {
      console.error(`Get playlist tracks error: ${response.status}`);
      return { success: false, status: response.status };
    }

    const data = await response.json();
    return {
      success: true,
      tracks: data.items.filter((item) => item.track).map((item) => item.track),
    };
  } catch (error) {
    console.error("Error getting playlist tracks:", error);
    return { success: false, error: error.message };
  }
}

async function queueRandomSongFromPlaylist(playlistId) {
  try {
    // Get tracks from the playlist
    const playlistResult = await getPlaylistTracks(playlistId);

    if (!playlistResult.success) {
      return playlistResult; // Return the error
    }

    const tracks = playlistResult.tracks;

    if (!tracks || tracks.length === 0) {
      return { success: false, error: "No tracks found in playlist" };
    }

    // Select a random track
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

    // Queue the track
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(randomTrack.uri)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        },
      },
    );

    if (!response.ok && response.status !== 204) {
      console.error(`Queue song error: ${response.status}`);
      return { success: false, status: response.status };
    }

    return {
      success: true,
      queuedSong: {
        name: randomTrack.name,
        artist: randomTrack.artists.map((artist) => artist.name).join(", "),
        album: randomTrack.album.name,
        duration: randomTrack.duration_ms,
        uri: randomTrack.uri,
        id: randomTrack.id,
        albumArt: randomTrack.album.images[0]?.url || null,
      },
    };
  } catch (error) {
    console.error("Error queueing random song:", error);
    return { success: false, error: error.message };
  }
}
