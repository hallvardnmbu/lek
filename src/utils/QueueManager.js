/**
 * QueueManager - Handles adding tracks to the Spotify queue
 * Supports single track additions and batch operations with rate limiting
 */
class QueueManager {
  constructor(spotifyClient) {
    if (!spotifyClient) {
      throw new Error("SpotifyAPIClient instance is required");
    }
    this.spotifyClient = spotifyClient;
    this.batchDelayMs = 500; // Delay between sequential adds
  }

  /**
   * Add a single track to the queue
   * @param {Object} cookie - Elysia cookie object
   * @param {string} uri - Spotify URI of the track
   * @param {string} deviceId - Optional device ID
   * @returns {Promise<boolean>} True if successful
   */
  async queueTrack(cookie, uri, deviceId = null) {
    try {
      await this.spotifyClient.addToQueue(cookie, uri, deviceId);
      return true;
    } catch (error) {
      console.error(`Failed to queue track ${uri}:`, error.message);
      return false;
    }
  }

  /**
   * Add multiple tracks to the queue sequentially
   * @param {Object} cookie - Elysia cookie object
   * @param {string[]} uris - Array of Spotify URIs
   * @param {string} deviceId - Optional device ID
   * @returns {Promise<Object>} Result summary { successful: number, failed: number }
   */
  async queueTracks(cookie, uris, deviceId = null) {
    const result = {
      successful: 0,
      failed: 0,
    };

    if (!Array.isArray(uris) || uris.length === 0) {
      return result;
    }

    for (let i = 0; i < uris.length; i++) {
        const uri = uris[i];
        
        // Add delay between requests (except the first one)
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
        }

        const success = await this.queueTrack(cookie, uri, deviceId);
        if (success) {
            result.successful++;
        } else {
            result.failed++;
        }
    }

    return result;
  }
}

export default QueueManager;
