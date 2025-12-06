import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _PORT = 8080;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "src", "views"));
app.use(express.static(path.join(__dirname, "src", "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

app.get("/spotify", (req, res) => {
  res.render("spotify", {
    id: SPOTIFY_CLIENT_ID,
  });
});
app.get("/callback", (req, res) => {
  const { code, error } = req.query;

  if (!code || error) {
    return res.render("callback", {
      message: "Hmm, noe gikk visst galt... :-( Prøv igjen, kanskje?",
      id: SPOTIFY_CLIENT_ID,
    });
  }

  // Keeping track of authentication state in the session.
  req.session.authenticated = true;

  return res.render("callback", {
    message: "Topp! Du videresendes.",
    code: code,
    id: SPOTIFY_CLIENT_ID,
  });
});

app.get("/settings", (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect("/spotify");
  }

  res.render("settings", {
    id: SPOTIFY_CLIENT_ID,
  });
});

app.get("/", (req, res) => {
  res.render("game", {
    isAuthenticated: req.session.authenticated || false,
    id: SPOTIFY_CLIENT_ID,
  });
});

app.listen(_PORT, () => {
  console.log(`Server is running on port http://localhost:${_PORT}`);
});
