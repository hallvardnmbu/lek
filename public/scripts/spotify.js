async function isPlaying() {
  try {
    const response = await fetch("https://api.spotify.com/v1/me/player", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      window.location.href = "/spotify";
      return;
    } else if (response.status === 204) {
      // No active devices.
      // In this case, try to find a computer device.
      // If none, use the first available device.
      // TODO: Handle error if no devices are available.

      const devicesResponse = await fetch("https://api.spotify.com/v1/me/player/devices", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      });

      const devices = await devicesResponse.json();

      // Extract the id of the first "Computer" device. If none, use the first device.
      const computerDevice = devices.devices.find((device) => device.type === "Computer");
      const deviceId = computerDevice ? computerDevice.id : devices.devices[0].id;

      await playSong(deviceId);

      // Return false to prevent further execution in `playSong`.
      return false;
    }

    const data = await response.json();
    return data.is_playing;
  } catch (error) {
    console.error(error);
    window.location.href = "/spotify";
    return;
  }
}

async function playSong(deviceId = null) {
  try {
    if (!deviceId && (await isPlaying())) return;

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play${deviceId ? `?device_id=${deviceId}` : ""}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok && response.status !== 204) {
      window.location.href = "/spotify";
      return;
    }

    return;
  } catch (error) {
    window.location.href = "/spotify";
    return;
  }
}

async function pauseSong() {
  try {
    if (!(await isPlaying())) return;

    const response = await fetch("https://api.spotify.com/v1/me/player/pause", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok && response.status !== 204) {
      window.location.href = "/spotify";
      return;
    }

    return;
  } catch (error) {
    window.location.href = "/spotify";
    return;
  }
}

async function skipSong() {
  try {
    if (!(await isPlaying())) return;

    const response = await fetch("https://api.spotify.com/v1/me/player/next", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok && response.status !== 204) {
      window.location.href = "/spotify";
      return;
    }

    return;
  } catch (error) {
    window.location.href = "/spotify";
    return;
  }
}

async function getCurrentSong() {
  try {
    if (!(await isPlaying())) return;

    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

    // 204 means success but no content (nothing playing)
    if (!response.ok && response.status !== 204) {
      window.location.href = "/spotify";
      return;
    }

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
    window.location.href = "/spotify";
    return;
  }
}

async function startShufflePlaylist(playlistId) {
  try {
    // If not playing, start playing
    await playSong();

    // Trying to enable shuffle mode before starting playlist
    let shuffleResponse = await fetch("https://api.spotify.com/v1/me/player/shuffle?state=true", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        "Content-Type": "application/json",
      },
    });

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
      console.error("Failed to start playing the playlist");
      window.location.href = "/spotify";
      return;
    }

    // If shuffle mode is not enabled, try again
    if (!shuffleResponse.ok && shuffleResponse.status !== 204) {
      shuffleResponse = await fetch("https://api.spotify.com/v1/me/player/shuffle?state=true", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      });
    }

    if (!shuffleResponse.ok && shuffleResponse.status !== 204) {
      console.error("Failed to enable shuffle mode :-(");
    }

    return;
  } catch (error) {
    window.location.href = "/spotify";
    return;
  }
}

async function getPlaylistTracks(playlistId) {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=200`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      window.location.href = "/spotify";
      return;
    }

    const data = await response.json();
    return {
      tracks: data.items.filter((item) => item.track).map((item) => item.track),
    };
  } catch (error) {
    window.location.href = "/spotify";
    return;
  }
}

async function queueRandomSongFromPlaylist(playlistId) {
  try {
    await playSong();

    // Get tracks from the playlist
    const playlistResult = await getPlaylistTracks(playlistId);

    if (!playlistResult.success) {
      return playlistResult; // Return the error
    }

    const tracks = playlistResult.tracks;

    if (!tracks || tracks.length === 0) {
      window.location.href = "/spotify";
      return;
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
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok && response.status !== 204) {
      window.location.href = "/spotify";
      return;
    }

    return {
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
    window.location.href = "/spotify";
    return;
  }
}

async function updateVolume(volume) {
  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/volume?volume_percent=${100 - parseInt(volume)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ volume_percent: volume }),
      },
    );

    if (!response.ok) {
      window.location.href = "/spotify";
      return;
    }
  } catch (error) {
    window.location.href = "/spotify";
    return;
  }
}
