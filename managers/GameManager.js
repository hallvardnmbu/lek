// managers/GameManager.js
class GameManager {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.currentGame = null;
    this.gameState = "idle";
    this.modes = {
      classic: this.classicMode.bind(this),
      hardcore: this.hardcoreMode.bind(this),
      rigged: this.riggedMode.bind(this),
    };
  }

  addPlayer(socketId, name) {
    this.players.set(socketId, { name, score: 0 });
    this.broadcastPlayers();
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.broadcastPlayers();
  }

  startGame(mode = "classic") {
    if (this.gameState !== "idle") return;

    this.gameState = "playing";
    this.currentGame = this.modes[mode]();
    this.broadcastGameState();
  }

  classicMode() {
    return {
      type: "classic",
      difficulty: 1,
      rounds: 5,
    };
  }

  hardcoreMode() {
    return {
      type: "hardcore",
      difficulty: 2,
      rounds: 3,
    };
  }

  riggedMode() {
    const players = Array.from(this.players.values());
    const riggedPlayer = players[Math.floor(Math.random() * players.length)];
    return {
      type: "rigged",
      difficulty: 1,
      rounds: 5,
      riggedPlayer: riggedPlayer.name,
    };
  }

  broadcastPlayers() {
    this.io.emit("players_update", Array.from(this.players.values()));
  }

  broadcastGameState() {
    this.io.emit("game_state", {
      state: this.gameState,
      currentGame: this.currentGame,
    });
  }
}

module.exports = { GameManager };
