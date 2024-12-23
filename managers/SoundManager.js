// managers/SoundManager.js
class SoundManager {
  constructor(spotifyApi) {
    this.spotifyApi = spotifyApi;
    this.volume = 0.5;
    this.currentPlaylist = null;
  }

  async pauseMusic() {
    try {
      await this.spotifyApi.pause();
    } catch (error) {
      console.error("Failed to pause music:", error);
    }
  }

  async resumeMusic() {
    try {
      await this.spotifyApi.play();
    } catch (error) {
      console.error("Failed to resume music:", error);
    }
  }

  async skipMusic() {
    try {
      await this.spotifyApi.skipToNext();
    } catch (error) {
      console.error("Failed to skip track:", error);
    }
  }

  async setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    try {
      await this.spotifyApi.setVolume(Math.round(this.volume * 100));
    } catch (error) {
      console.error("Failed to set volume:", error);
    }
  }

  async setPlaylist(playlistUri) {
    try {
      this.currentPlaylist = playlistUri;
      await this.spotifyApi.play({
        context_uri: playlistUri,
      });
    } catch (error) {
      console.error("Failed to set playlist:", error);
    }
  }

  async getCurrentTrack() {
    try {
      const response = await this.spotifyApi.getMyCurrentPlayingTrack();
      return response.body;
    } catch (error) {
      console.error("Failed to get current track:", error);
      return null;
    }
  }
}

module.exports = { SoundManager };
