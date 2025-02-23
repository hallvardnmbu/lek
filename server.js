import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = 8080;

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production" },
  }),
);

app.get("/spotify", (req, res) => {
  res.render("spotify");
});
app.get("/callback", async (req, res) => {
  req.session.spotifyCode = req.query.code;
  res.redirect("/settings");
});
app.get("/id", (req, res) => {
  res.send(process.env.SPOTIFY_CLIENT_ID);
});

app.get("/settings", (req, res) => {
  res.render("settings");
});

app.get("/", (req, res) => {
  // if (!req.session.spotifyCode) {
  //   res.redirect("/spotify");
  // }

  res.render("settings", { spotifyCode: req.session.spotifyCode });
});

app.listen(port, () => {
  console.log(`Server is running on port http://localhost:${port}`);
});
