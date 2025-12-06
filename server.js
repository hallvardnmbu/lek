import express from "express";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _PORT = 8080;

const lek = express();

// Security headers
// lek.use(
//   helmet({
//     contentSecurityPolicy: {
//       directives: {
//         defaultSrc: ["'self'"],
//         scriptSrc: ["'self'", "https://accounts.spotify.com"],
//         connectSrc: ["'self'", "https://api.spotify.com", "https://accounts.spotify.com"],
//         imgSrc: ["'self'", "data:", "https://i.scdn.co"],
//         styleSrc: ["'self'", "'unsafe-inline'"], // Re-enabled for style attributes/JS style usage
//       },
//     },
//     hsts: false,
//   })
// );

// Serve static files
lek.use(express.static(path.join(__dirname, "src")));

// Fallback to index.html for unknown routes (optional if we want SPA behavior, 
// but currently we just rely on / for everything)
lek.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

// Explicit callback route to ensure it serves the HTML file
lek.get("/callback", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "callback.html"));
});

// Redirect /spotify or /settings to / since it's an SPA now
lek.get("/spotify", (req, res) => res.redirect("/"));
lek.get("/settings", (req, res) => res.redirect("/"));

lek.listen(_PORT, () => {
  console.log(`Server is running on port http://127.0.0.1:${_PORT}`);
});
