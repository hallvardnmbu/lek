import TokenManager from "./TokenManager.js";

/**
 * SpotifyAPIClient - Centralized client for Spotify Web API interactions
 * Handles authentication, error recovery, and rate limiting automatically
 */
class SpotifyAPIClient {
  /**
   * @param {TokenManager} tokenManager - Instance of TokenManager
   */
  constructor(tokenManager) {
    if (!tokenManager) {
      throw new Error("TokenManager instance is required");
    }
    this.tokenManager = tokenManager;
    this.baseUrl = "https://api.spotify.com/v1";
  }

  /**
   * Make a request to the Spotify API
   * @param {string} endpoint - API endpoint (e.g., '/me/player')
   * @param {Object} options - Fetch options (method, body, etc.)
   * @param {Object} cookie - Elysia cookie object
   * @param {boolean} isRetry - Whether this is a retry attempt
   * @returns {Promise<any>} API response data
   */
  async request(endpoint, options = {}, cookie, isRetry = false) {
    if (!cookie) {
      throw new Error("Cookie object is required for API calls");
    }

    try {
      // 1. Get a valid token
      const token = await this.tokenManager.getValidToken(cookie);
      if (!token) {
        throw new Error("Unable to obtain valid access token");
      }

      // 2. Prepare headers
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };

      // 3. Make the request
      const url = endpoint.startsWith("http")
        ? endpoint
        : `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers,
      });

      // 4. Handle success
      if (response.ok) {
        // Some endpoints return 204 No Content
        if (response.status === 204) {
          return null;
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
           return await response.json();
        }
        return await response.text();
      }

      // 5. Handle errors
      let errorData = {};
      const errorContentType = response.headers.get("content-type");
      if (errorContentType && errorContentType.includes("application/json")) {
          errorData = await response.json().catch(() => ({}));
      } else {
          errorData = { message: await response.text().catch(() => "") };
      }

      const error = new Error(
        `Spotify API Error: ${response.status} ${response.statusText}`
      );
      error.status = response.status;
      error.spotifyError = errorData;
      error.retryAfter = response.headers.get("Retry-After");

      throw error;
    } catch (error) {
      // 6. Error Recovery
      if (!isRetry) {
        const resolution = await this.tokenManager.handleTokenError(
          error,
          cookie
        );

        if (resolution.shouldRetry) {
          return this.request(endpoint, options, cookie, true);
        }
      }

      throw error;
    }
  }

  // ============================================================================
  // Player Endpoints
  // ============================================================================

  /**
   * Get information about the user's current playback state
   * @param {Object} cookie - Elysia cookie object
   */
  async getPlaybackState(cookie) {
    return this.request("/me/player", { method: "GET" }, cookie);
  }

  /**
   * Start or resume playback
   * @param {Object} cookie - Elysia cookie object
   * @param {Object} context - Optional context (context_uri, uris, offset, position_ms)
   * @param {string} deviceId - Optional device ID to target
   */
  async play(cookie, context = {}, deviceId = null) {
    const query = deviceId ? `?device_id=${deviceId}` : "";
    return this.request(
      `/me/player/play${query}`,
      {
        method: "PUT",
        body: JSON.stringify(context),
      },
      cookie
    );
  }

  /**
   * Pause playback
   * @param {Object} cookie - Elysia cookie object
   * @param {string} deviceId - Optional device ID
   */
  async pause(cookie, deviceId = null) {
    const query = deviceId ? `?device_id=${deviceId}` : "";
    return this.request(
        `/me/player/pause${query}`, 
        { method: "PUT" }, 
        cookie
    );
  }

  /**
   * Skip to next track
   * @param {Object} cookie - Elysia cookie object
   * @param {string} deviceId - Optional device ID
   */
  async next(cookie, deviceId = null) {
    const query = deviceId ? `?device_id=${deviceId}` : "";
    return this.request(
        `/me/player/next${query}`, 
        { method: "POST" }, 
        cookie
    );
  }

  /**
   * Skip to previous track
   * @param {Object} cookie - Elysia cookie object
   * @param {string} deviceId - Optional device ID
   */
  async previous(cookie, deviceId = null) {
    const query = deviceId ? `?device_id=${deviceId}` : "";
    return this.request(
        `/me/player/previous${query}`, 
        { method: "POST" }, 
        cookie
    );
  }

  /**
   * Add an item to the end of the user's current playback queue
   * @param {Object} cookie - Elysia cookie object
   * @param {string} uri - Spotify URI of the track/episode
   * @param {string} deviceId - Optional device ID
   */
  async addToQueue(cookie, uri, deviceId = null) {
    const query = new URLSearchParams({ uri });
    if (deviceId) query.append("device_id", deviceId);
    
    return this.request(
      `/me/player/queue?${query.toString()}`,
      { method: "POST" },
      cookie
    );
  }

  /**
   * Get a user's available devices
   * @param {Object} cookie - Elysia cookie object
   */
  async getDevices(cookie) {
    return this.request("/me/player/devices", { method: "GET" }, cookie);
  }
  
  /**
   * Transfer playback to a new device
   * @param {Object} cookie - Elysia cookie object
   * @param {string} deviceId - Device ID to transfer to
   * @param {boolean} play - Whether to ensure playback happens
   */
  async transferPlayback(cookie, deviceId, play = false) {
      return this.request('/me/player', {
          method: 'PUT',
          body: JSON.stringify({
              device_ids: [deviceId],
              play: play
          })
      }, cookie);
  }
  
  /**
   * Set volume
   * @param {Object} cookie - Elysia cookie object
   * @param {number} volumePercent - Volume percentage (0-100)
   * @param {string} deviceId - Optional device ID
   */
  async setVolume(cookie, volumePercent, deviceId = null) {
      const query = new URLSearchParams({ volume_percent: volumePercent.toString() });
      if (deviceId) query.append('device_id', deviceId);
      
      return this.request(`/me/player/volume?${query.toString()}`, { method: 'PUT' }, cookie);
  }

  /**
   * Set repeat mode
   * @param {Object} cookie - Elysia cookie object
   * @param {string} state - 'track', 'context', or 'off'
   * @param {string} deviceId - Optional device ID
   */
  async setRepeat(cookie, state, deviceId = null) {
      const query = new URLSearchParams({ state });
      if (deviceId) query.append('device_id', deviceId);
      
      return this.request(`/me/player/repeat?${query.toString()}`, { method: 'PUT' }, cookie);
  }

  /**
   * Set shuffle mode
   * @param {Object} cookie - Elysia cookie object
   * @param {boolean} state - true or false
   * @param {string} deviceId - Optional device ID
   */
  async setShuffle(cookie, state, deviceId = null) {
      const query = new URLSearchParams({ state: state.toString() });
      if (deviceId) query.append('device_id', deviceId);
      
      return this.request(`/me/player/shuffle?${query.toString()}`, { method: 'PUT' }, cookie);
  }


  // ============================================================================
  // Playlist / Track Endpoints
  // ============================================================================

  /**
   * Get a playlist
   * @param {Object} cookie - Elysia cookie object
   * @param {string} playlistId - ID of the playlist
   */
  async getPlaylist(cookie, playlistId) {
      return this.request(`/playlists/${playlistId}`, { method: 'GET' }, cookie);
  }

  /**
   * Search for items
   * @param {Object} cookie - Elysia cookie object
   * @param {string} query - Search query
   * @param {string} type - Comma-separated list of types (album,artist,playlist,track,show,episode,audiobook)
   * @param {number} limit - Max results
   */
  async search(cookie, query, type = 'track', limit = 20) {
      const q = new URLSearchParams({
          q: query,
          type: type,
          limit: limit.toString()
      });
      return this.request(`/search?${q.toString()}`, { method: 'GET' }, cookie);
  }
}

export default SpotifyAPIClient;
