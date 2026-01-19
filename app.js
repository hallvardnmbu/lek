import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { dirname, join } from "path";

import CookieManager from "./src/utils/CookieManager.js";
import SecurityConfig from "./src/utils/SecurityConfig.js";
import TokenManager from "./src/utils/TokenManager.js";
import SpotifyAPIClient from "./src/utils/SpotifyAPIClient.js";
import PlaybackStateManager from "./src/utils/PlaybackStateManager.js";
import QueueManager from "./src/utils/QueueManager.js";

let __dirname = dirname(new URL(import.meta.url).pathname);
__dirname =
  __dirname.startsWith("/") && __dirname.includes(":")
    ? __dirname.replace(/^\/([A-Z]):/, "$1:\\").replace(/\//g, "\\")
    : __dirname;

const _PRODUCTION = process.env.NODE_ENV === "production";
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;

// Initialize security configuration and cookie manager
const securityConfig = new SecurityConfig();
const cookieManager = new CookieManager();

// Initialize Spotify Integration components
const tokenManager = new TokenManager(SPOTIFY_CLIENT_ID);
const spotifyClient = new SpotifyAPIClient(tokenManager);
const playbackManager = new PlaybackStateManager(spotifyClient);
const queueManager = new QueueManager(spotifyClient);

// Validate environment variables
try {
  securityConfig.validateEnvironment();
} catch (error) {
  console.error("❌ Configuration Error:", error.message);
  process.exit(1);
}

// Log security configuration
securityConfig.logConfiguration();

const lek = new Elysia()
  .onRequest(({ set }) => {
    if (_PRODUCTION) {
      const headers = securityConfig.getSecurityHeaders();
      Object.assign(set.headers, headers);
    }
  })
  // Serve static assets with robust wildcard routes to avoid Bun resolution errors
  .get("/styles.css", () => Bun.file(join(__dirname, "src/styles.css")))
  .get("/scripts/*", ({ params }) =>
    Bun.file(join(__dirname, "src/scripts", params["*"])),
  )
  .get("/icons/*", ({ params }) =>
    Bun.file(join(__dirname, "src/icons", params["*"])),
  )
  // Fallback static plugin for anything else
  .use(
    staticPlugin({
      assets: join(__dirname, "src"),
      prefix: "",
    }),
  )
  .derive(({ cookie }) => {
    try {
      // Get token data from secure cookies
      const tokenData = cookieManager.getAllTokenData(cookie);

      if (!tokenData) {
        // Debugging log to see which cookie is missing
        const hasAccessToken = !!cookie.spotify_access_token?.value;
        const hasRefreshToken = !!cookie.spotify_refresh_token?.value;
        const hasExpiry = !!cookie.spotify_token_expiry?.value;
        if (hasAccessToken || hasRefreshToken || hasExpiry) {
          // console.log("Partial auth state detected:", { hasAccessToken, hasRefreshToken, hasExpiry });
        }
      }

      return {
        spotifyAuth: {
          isAuthenticated: !!tokenData && tokenData.isValid,
          tokenData: tokenData,
          needsRefresh: tokenData
            ? !cookieManager.isTokenValid(cookie, 5)
            : false,
        },
      };
    } catch (error) {
      console.error("Authentication derivation error:", error);
      // Clear potentially corrupted cookies
      cookieManager.clearTokens(cookie);
      return {
        spotifyAuth: {
          isAuthenticated: false,
          tokenData: null,
          needsRefresh: false,
          error: "Authentication validation failed: " + error.message,
        },
      };
    }
  })
  .group("/auth", (app) =>
    app
      .onRequest(({ set, request }) => {
        const corsConfig = securityConfig.getCorsConfig();
        const origin = request.headers.get("origin");

        if (corsConfig.origin) {
          if (Array.isArray(corsConfig.origin)) {
            if (corsConfig.origin.includes(origin)) {
              set.headers["Access-Control-Allow-Origin"] = origin;
            }
          } else if (corsConfig.origin === origin) {
            set.headers["Access-Control-Allow-Origin"] = origin;
          }
        }

        set.headers["Access-Control-Allow-Credentials"] = "true";
        set.headers["Access-Control-Allow-Methods"] =
          "GET, POST, PUT, DELETE, OPTIONS";
        set.headers["Access-Control-Allow-Headers"] =
          "Content-Type, Authorization";
      })
      .options("/*", () => "")
      .post("/exchange", async ({ body, cookie, set }) => {
        try {
          const { code, code_verifier, redirect_uri } = body;

          // Spotify needs the EXACT same redirect_uri that was used during authorization
          // Forced consistency for local dev (127.0.0.1)
          const redirectUri = redirect_uri || "http://127.0.0.1:8080/callback";

          if (!code || !code_verifier) {
            set.status = 400;
            return { error: "Missing code or verifier" };
          }

          const tokenUrl = "https://accounts.spotify.com/api/token";

          const tokenBody = new URLSearchParams({
            grant_type: "authorization_code",
            code: code,
            redirect_uri: redirectUri,
            client_id: SPOTIFY_CLIENT_ID,
            code_verifier: code_verifier,
          });

          const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: tokenBody,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Spotify token exchange failed:", errorData);
            set.status = response.status;
            return {
              error: "Token exchange failed",
              details: errorData,
            };
          }

          const tokenData = await response.json();

          // Store tokens securely
          cookieManager.setTokens(
            cookie,
            tokenData.access_token,
            tokenData.refresh_token,
            tokenData.expires_in,
          );

          return {
            success: true,
            message: "Tokens exchanged and stored securely",
          };
        } catch (error) {
          console.error("Auth exchange error:", error);
          set.status = 500;
          return {
            error: "Failed to exchange token",
            details: _PRODUCTION ? undefined : error.message,
          };
        }
      })
      .post("/refresh", ({ body, cookie, set }) => {
        try {
          const { access_token, expires_in } = body;

          // Validate required fields
          if (!access_token || !expires_in) {
            set.status = 400;
            return {
              error: "Missing required token data",
              required: ["access_token", "expires_in"],
            };
          }

          // Validate token format
          if (typeof access_token !== "string" || access_token.length < 10) {
            set.status = 400;
            return { error: "Invalid access token format" };
          }

          if (!Number.isInteger(expires_in) || expires_in <= 0) {
            set.status = 400;
            return { error: "Invalid expires_in value" };
          }

          // Verify refresh token exists before updating access token
          const refreshToken = cookieManager.getRefreshToken(cookie);
          if (!refreshToken) {
            set.status = 401;
            return {
              error: "No refresh token found",
              action: "reauthenticate",
            };
          }

          // Update access token
          cookieManager.updateAccessToken(cookie, access_token, expires_in);

          return {
            success: true,
            message: "Access token updated",
            expiresAt: Date.now() + expires_in * 1000,
          };
        } catch (error) {
          console.error("Token refresh error:", error);
          set.status = 500;
          return {
            error: "Failed to update token",
            details: _PRODUCTION ? undefined : error.message,
          };
        }
      })
      .post("/logout", ({ cookie, set }) => {
        try {
          // Clear authentication cookies
          cookieManager.clearTokens(cookie);

          return {
            success: true,
            message: "Logged out successfully",
          };
        } catch (error) {
          console.error("Logout error:", error);
          set.status = 500;
          return {
            error: "Failed to logout",
            details: _PRODUCTION ? undefined : error.message,
          };
        }
      })
      .get("/status", ({ spotifyAuth, cookie }) => {
        try {
          const tokenData = cookieManager.getAllTokenData(cookie);

          return {
            isAuthenticated: spotifyAuth.isAuthenticated,
            hasTokens: !!tokenData,
            tokenExpiry: tokenData?.expiresAt || null,
            needsRefresh: spotifyAuth.needsRefresh,
            tokenValid: tokenData ? cookieManager.isTokenValid(cookie) : false,
          };
        } catch (error) {
          console.error("Auth status error:", error);
          return { error: "Failed to get authentication status" };
        }
      })
      .get("/validate", ({ cookie, set }) => {
        try {
          const tokenData = cookieManager.getAllTokenData(cookie);

          if (!tokenData) {
            set.status = 401;
            return {
              valid: false,
              error: "No tokens found",
            };
          }

          const isValid = cookieManager.isTokenValid(cookie);
          const needsRefresh = !cookieManager.isTokenValid(cookie, 5);

          return {
            valid: isValid,
            needsRefresh: needsRefresh,
            expiresAt: tokenData.expiresAt,
            timeUntilExpiry: tokenData.expiresAt - Date.now(),
          };
        } catch (error) {
          console.error("Token validation error:", error);
          set.status = 500;
          return {
            valid: false,
            error: "Validation failed",
          };
        }
      })
      .post("/refresh-token", async ({ body, cookie, set }) => {
        try {
          const { client_id } = body;

          if (!client_id) {
            set.status = 400;
            return { error: "Client ID is required" };
          }

          // Get refresh token from cookies
          const refreshToken = cookieManager.getRefreshToken(cookie);

          if (!refreshToken) {
            set.status = 401;
            return {
              error: "No refresh token found",
              action: "reauthenticate",
            };
          }

          // Make refresh request to Spotify
          const tokenUrl = "https://accounts.spotify.com/api/token";
          const tokenBody = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: client_id,
          });

          const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: tokenBody,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Spotify token refresh failed:", errorData);
            set.status = response.status;
            return {
              error: "Token refresh failed",
              spotifyError: errorData,
              action: "reauthenticate",
            };
          }

          const tokenData = await response.json();

          // Update access token in cookies
          cookieManager.updateAccessToken(
            cookie,
            tokenData.access_token,
            tokenData.expires_in,
          );

          // If Spotify returned a new refresh token, update it too
          if (tokenData.refresh_token) {
            cookieManager.setTokens(
              cookie,
              tokenData.access_token,
              tokenData.refresh_token,
              tokenData.expires_in,
            );
          }

          return {
            success: true,
            access_token: tokenData.access_token,
            expires_in: tokenData.expires_in,
            expiresAt: Date.now() + tokenData.expires_in * 1000,
          };
        } catch (error) {
          console.error("Server-side token refresh error:", error);
          set.status = 500;
          return {
            error: "Internal server error during token refresh",
            action: "reauthenticate",
          };
        }
      }),
  )
  .group("/api/spotify", (app) =>
    app
      .onBeforeHandle(({ spotifyAuth, set, request }) => {
        if (!spotifyAuth.isAuthenticated) {
          set.status = 401;
          const accept = request.headers.get("accept");
          if (accept?.includes("application/json")) {
            return {
              error: "Authentication required",
              redirectTo: "/spotify",
            };
          }
          set.redirect = "/spotify";
        }
      })
      .get("/player", async ({ cookie }) => {
        try {
          const state = await spotifyClient.getPlaybackState(cookie);
          return state || { is_playing: false };
        } catch (error) {
          return { error: error.message };
        }
      })
      .get("/devices", async ({ cookie }) => {
        try {
          return await spotifyClient.getDevices(cookie);
        } catch (error) {
          return { error: error.message };
        }
      })
      .put("/player/play", async ({ body, cookie, set }) => {
        try {
          const { context_uri, uris, offset, position_ms, device_id } =
            body || {};

          let targetDeviceId = device_id;
          if (!targetDeviceId) {
            targetDeviceId = await playbackManager.ensureActiveDevice(cookie);
          }

          const context = {};
          if (context_uri) context.context_uri = context_uri;
          if (uris) context.uris = uris;
          if (offset) context.offset = offset;
          if (position_ms) context.position_ms = position_ms;

          await spotifyClient.play(cookie, context, targetDeviceId);
          set.status = 204;
        } catch (error) {
          return { error: error.message };
        }
      })
      .put("/player/pause", async ({ body, cookie, set }) => {
        try {
          const { device_id } = body || {};
          await spotifyClient.pause(cookie, device_id);
          set.status = 204;
        } catch (error) {
          return { error: error.message };
        }
      })
      .post("/player/next", async ({ body, cookie, set }) => {
        try {
          const { device_id } = body || {};
          await spotifyClient.next(cookie, device_id);
          set.status = 204;
        } catch (error) {
          return { error: error.message };
        }
      })
      .post("/player/previous", async ({ body, cookie, set }) => {
        try {
          const { device_id } = body || {};
          await spotifyClient.previous(cookie, device_id);
          set.status = 204;
        } catch (error) {
          return { error: error.message };
        }
      })
      .put("/player/volume", async ({ body, cookie, set }) => {
        try {
          const { volume_percent, device_id } = body || {};
          await spotifyClient.setVolume(cookie, volume_percent, device_id);
          set.status = 204;
        } catch (error) {
          return { error: error.message };
        }
      })
      .put("/player/shuffle", async ({ body, cookie, set }) => {
        try {
          const { state, device_id } = body || {};
          await spotifyClient.setShuffle(cookie, state, device_id);
          set.status = 204;
        } catch (error) {
          return { error: error.message };
        }
      })
      .post("/player/queue", async ({ body, cookie, set }) => {
        try {
          const { uri, uris, device_id } = body || {};

          if (uris && Array.isArray(uris)) {
            return await queueManager.queueTracks(cookie, uris, device_id);
          } else if (uri) {
            const success = await queueManager.queueTrack(
              cookie,
              uri,
              device_id,
            );
            if (success) {
              set.status = 204;
            } else {
              set.status = 500;
              return { error: "Failed to queue track" };
            }
          } else {
            set.status = 400;
            return { error: "Missing uri or uris" };
          }
        } catch (error) {
          return { error: error.message };
        }
      })
      .get("/playlists/:id/tracks", async ({ params, cookie }) => {
        try {
          const { id } = params;
          return await spotifyClient.request(
            `/playlists/${id}/tracks?limit=100`,
            { method: "GET" },
            cookie,
          );
        } catch (error) {
          return { error: error.message };
        }
      })
      .get("/albums/:id/tracks", async ({ params, cookie }) => {
        try {
          const { id } = params;
          return await spotifyClient.request(
            `/albums/${id}/tracks?limit=50`,
            { method: "GET" },
            cookie,
          );
        } catch (error) {
          return { error: error.message };
        }
      })
      .get("/player/currently-playing", async ({ cookie }) => {
        try {
          const data = await spotifyClient.request(
            "/me/player/currently-playing",
            { method: "GET" },
            cookie,
          );
          return data || {};
        } catch (error) {
          return { error: error.message };
        }
      }),
  )
  .get("/spotify", () => Bun.file(join(__dirname, "src/index.html")))
  .get("/callback", ({ query }) => {
    const { code, error } = query;

    if (!code || error) {
      return Bun.file(join(__dirname, "src/callback.html"));
    }

    return Bun.file(join(__dirname, "src/callback.html"));
  })
  .get("/settings", ({ spotifyAuth, set }) => {
    if (!spotifyAuth.isAuthenticated) {
      set.redirect = "/spotify";
      return;
    }
    return Bun.file(join(__dirname, "src/index.html"));
  })
  .get("/", () => Bun.file(join(__dirname, "src/index.html")));

export default lek;

if (import.meta.main) {
  lek.listen(8080);
  console.log(`Running at http://${lek.server?.hostname}:${lek.server?.port}`);
}
