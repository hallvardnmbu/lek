// js/main.js
class PaGame {
  constructor() {
    this.contestants = [];
    this.volume = 0.5;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Playback controls
    document.getElementById("pauseBtn").addEventListener("click", () => this.pauseMusic());
    document.getElementById("playBtn").addEventListener("click", () => this.unpauseMusic());
    document.getElementById("skipBtn").addEventListener("click", () => this.skipMusic());

    // Volume controls
    document.getElementById("volumeDownBtn").addEventListener("click", () => this.decreaseVolume());
    document.getElementById("volumeUpBtn").addEventListener("click", () => this.increaseVolume());

    // Game controls
    document.getElementById("startBtn").addEventListener("click", () => this.startGame());
    document.getElementById("continueBtn").addEventListener("click", () => this.continueGame());
    document.getElementById("disableBtn").addEventListener("click", () => this.disableGame());

    // Add game button
    document.getElementById("addGameBtn").addEventListener("click", () => {
      const mode = document.getElementById("gameModeSelect").value;
      this.addMode(mode);
    });
  }

  // Music control methods
  pauseMusic() {
    // Implement Spotify API pause functionality
  }

  unpauseMusic() {
    // Implement Spotify API play functionality
  }

  skipMusic() {
    // Implement Spotify API skip functionality
  }

  // Volume control methods
  decreaseVolume() {
    this.volume = Math.max(0, this.volume - 0.1);
    // Implement volume change
  }

  increaseVolume() {
    this.volume = Math.min(1, this.volume + 0.1);
    // Implement volume change
  }

  // Game control methods
  startGame() {
    document.getElementById("startBtn").classList.add("hidden");
    document.getElementById("continueBtn").classList.remove("hidden");
    document.getElementById("disableBtn").classList.remove("hidden");
  }

  continueGame() {
    // Implement game continuation logic
  }

  disableGame() {
    document.getElementById("startBtn").classList.remove("hidden");
    document.getElementById("continueBtn").classList.add("hidden");
    document.getElementById("disableBtn").classList.add("hidden");
  }

  addMode(mode) {
    // Implement game mode addition logic
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  window.paGame = new PaGame();
});
