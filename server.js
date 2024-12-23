// server.js
const express = require("express");
const cors = require("cors");
const SpotifyWebApi = require("spotify-web-api-node");
const dotenv = require("dotenv");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { GameManager } = require("./managers/GameManager");
const { SoundManager } = require("./managers/SoundManager");

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

// Initialize managers
const gameManager = new GameManager(io);
const soundManager = new SoundManager(spotifyApi);

// Routes
app.get("/api/spotify/login", (req, res) => {
  const scopes = ["user-read-playback-state", "user-modify-playback-state"];
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get("/api/spotify/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const data = await spotifyApi.authorizationCodeGrant(code);

    spotifyApi.setAccessToken(data.body["access_token"]);
    spotifyApi.setRefreshToken(data.body["refresh_token"]);

    res.redirect("/");
  } catch (error) {
    console.error("Error in Spotify callback:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));

// WebSocket event handlers
io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("join_game", (data) => {
    gameManager.addPlayer(socket.id, data.name);
  });

  socket.on("start_game", () => {
    gameManager.startGame();
  });

  socket.on("pause_music", () => {
    soundManager.pauseMusic();
  });

  socket.on("resume_music", () => {
    soundManager.resumeMusic();
  });

  socket.on("skip_music", () => {
    soundManager.skipMusic();
  });

  socket.on("disconnect", () => {
    gameManager.removePlayer(socket.id);
    console.log("Client disconnected");
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
