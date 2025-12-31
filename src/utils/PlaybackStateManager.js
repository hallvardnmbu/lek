/**
 * PlaybackStateManager - Manages device selection and playback state
 * Handles intelligent device discovery and prioritization
 */
class PlaybackStateManager {
  constructor(spotifyClient) {
    if (!spotifyClient) {
      throw new Error("SpotifyAPIClient instance is required");
    }
    this.spotifyClient = spotifyClient;
  }

  /**
   * Get the best available device for playback
   * Priority:
   * 1. Currently active device
   * 2. Device named "Computer" (case insensitive)
   * 3. First available device
   *
   * @param {Object} cookie - Elysia cookie object
   * @returns {Promise<Object|null>} The best device object or null if none found
   */
  async getBestDevice(cookie) {
    try {
      const devicesResponse = await this.spotifyClient.getDevices(cookie);
      
      if (!devicesResponse || !devicesResponse.devices || devicesResponse.devices.length === 0) {
        return null;
      }

      const devices = devicesResponse.devices;

      // 1. Check for active device
      const activeDevice = devices.find((d) => d.is_active);
      if (activeDevice) {
        return activeDevice;
      }

      // 2. Check for "Computer" device
      const computerDevice = devices.find(
        (d) => d.type.toLowerCase() === "computer" || d.name.toLowerCase().includes("computer")
      );
      if (computerDevice) {
        return computerDevice;
      }

      // 3. Fallback to first available device
      return devices[0];
    } catch (error) {
      console.error("Error getting best device:", error.message);
      return null;
    }
  }

  /**
   * Ensure there is an active device for playback
   * Tries to find and activate a device if none is active
   *
   * @param {Object} cookie - Elysia cookie object
   * @returns {Promise<string|null>} The ID of the active device or null if failed
   */
  async ensureActiveDevice(cookie) {
    try {
      const bestDevice = await this.getBestDevice(cookie);

      if (!bestDevice) {
        return null;
      }

      if (!bestDevice.is_active) {
        // Transfer playback to this device
        await this.spotifyClient.transferPlayback(cookie, bestDevice.id, false);
        // Small delay to allow transfer to propagate
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return bestDevice.id;
    } catch (error) {
      console.error("Error ensuring active device:", error.message);
      return null;
    }
  }
}

export default PlaybackStateManager;
