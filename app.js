import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { dirname, join } from "path";

let __dirname = dirname(new URL(import.meta.url).pathname);
__dirname =
  __dirname.startsWith("/") && __dirname.includes(":")
    ? __dirname.replace(/^\/([A-Z]):/, "$1:\\").replace(/\//g, "\\")
    : __dirname;

const _PRODUCTION = process.env.NODE_ENV === "production";

const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' https://accounts.spotify.com",
  "connect-src 'self' https://api.spotify.com https://accounts.spotify.com",
  "img-src 'self' data: https://i.scdn.co",
  "style-src 'self' 'unsafe-inline'",
].join("; ");

const lekApp = new Elysia()
  .onRequest(({ set }) => {
    if (_PRODUCTION) {
      set.headers["Content-Security-Policy"] = CSP_HEADER;
      set.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
      set.headers["X-Content-Type-Options"] = "nosniff";
      set.headers["X-Frame-Options"] = "SAMEORIGIN";
    }
  })
  .use(staticPlugin({
    assets: join(__dirname, "src"),
    prefix: "/"
  }))
  .get("/", () => Bun.file(join(__dirname, "src/index.html")))
  .get("/callback", () => Bun.file(join(__dirname, "src/callback.html")))
  .get("/spotify", ({ set }) => { set.redirect = "/" })
  .get("/settings", ({ set }) => { set.redirect = "/" });


export default lekApp;

if (import.meta.main) {
  lekApp.listen(8080);
  console.log(`Running at http://${lekApp.server?.hostname}:${lekApp.server?.port}`);
}
