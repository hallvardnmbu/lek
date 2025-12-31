// services/auth-service.js

/**
 * Generates a random code verifier for PKCE.
 * @param {number} length
 * @returns {string}
 */
function generateCodeVerifier(length = 64) {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

/**
 * Generates a code challenge from the code verifier using SHA-256.
 * @param {string} codeVerifier
 * @returns {Promise<string>}
 */
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert the hash to a base64 string (URL safe)
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Initiates the Spotify authorization flow.
 * @param {string} clientId
 */
export async function initiateSpotifyAuth(clientId) {
  try {
    // Spotify MUST use 127.0.0.1 instead of localhost for local dev.
    // We redirect BEFORE setting verifier to ensure it stays in the correct origin's storage.
    if (window.location.hostname === 'localhost') {
        const url = new URL(window.location.href);
        url.hostname = '127.0.0.1';
        window.location.href = url.toString();
        return;
    }

    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem("verifier", codeVerifier);

    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Consistency: Always use 127.0.0.1 for local development
    const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
    const origin = isLocal ? "http://127.0.0.1:8080" : window.location.origin;
    const redirectUri = `${origin}/callback`;

    const scope =
      "user-read-playback-state user-modify-playback-state user-read-private user-read-email";
    const authorizeUrl = new URL("https://accounts.spotify.com/authorize");

    const params = {
      response_type: "code",
      client_id: clientId,
      scope,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      redirect_uri: redirectUri,
    };

    authorizeUrl.search = new URLSearchParams(params).toString();
    window.location.href = authorizeUrl.toString();
  } catch (error) {
    console.error("Authorization initiation failed:", error);
    throw error;
  }
}

/**
 * Exchanges the authorization code for an access token via our server.
 * @param {string} code
 * @param {string} clientId
 * @returns {Promise<Object>}
 */
export async function exchangeCodeForToken(code, clientId) {
  try {
    const codeVerifier = sessionStorage.getItem("verifier");

    if (!codeVerifier) {
      throw new Error("Code verifier not found in session storage. Host: " + window.location.hostname);
    }

    // Consistency: Match initiation redirect URI exactly
    const isLocal = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
    const origin = isLocal ? "http://127.0.0.1:8080" : window.location.origin;
    const redirectUri = `${origin}/callback`;

    // Call our server to perform the exchange and set secure cookies
    const response = await fetch("/auth/exchange", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Token exchange failed: ${response.status} - ${JSON.stringify(errorData)}`,
      );
    }

    const result = await response.json();

    // Clean up code verifier
    sessionStorage.removeItem("verifier");

    return result;
  } catch (error) {
    console.error("Token exchange failed:", error);
    throw error;
  }
}

// Refresh an expired token
async function refreshAccessToken(id) {
  try {
    // Get current authentication status from server
    const statusResponse = await fetch("/auth/status", {
      credentials: "include",
    });

    if (!statusResponse.ok) {
      throw new Error("Failed to get authentication status");
    }

    const statusData = await statusResponse.json();

    if (!statusData.hasTokens) {
      throw new Error("No refresh token available");
    }

    // Get refresh token from server-side cookies (server will handle the refresh)
    const refreshResponse = await fetch("/auth/validate", {
      credentials: "include",
    });

    if (!refreshResponse.ok) {
      throw new Error("Token validation failed");
    }

    const validationData = await refreshResponse.json();

    if (!validationData.valid && !validationData.needsRefresh) {
      throw new Error("Token is invalid and cannot be refreshed");
    }

    // If token needs refresh, perform the refresh via Spotify API
    if (validationData.needsRefresh) {
      // We need to get the refresh token from cookies via a server endpoint
      // Since we can't access HTTP-only cookies from client-side, we'll make the refresh call
      // and let the server handle updating the cookies

      const tokenUrl = "https://accounts.spotify.com/api/token";

      // First, we need to get the refresh token - this requires a server endpoint
      // For now, we'll make the refresh call and then update via server
      const refreshTokenResponse = await fetch("/auth/refresh-token", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: id,
        }),
      });

      if (!refreshTokenResponse.ok) {
        // Fallback: redirect to re-authentication
        throw new Error("Token refresh failed, re-authentication required");
      }

      const tokenData = await refreshTokenResponse.json();
      return tokenData;
    }

    // Token is still valid
    return { access_token: "valid" };
  } catch (error) {
    console.error("Token refresh failed:", error);
    throw error;
  }
}

// Get a valid access token (refreshing if necessary)
export async function getValidAccessToken(id) {
  try {
    // Check authentication status from server
    const statusResponse = await fetch("/auth/validate", {
      credentials: "include",
    });

    if (!statusResponse.ok) {
      throw new Error("Failed to validate token");
    }

    const validationData = await statusResponse.json();

    // If token is valid and doesn't need refresh, we're good
    if (validationData.valid && !validationData.needsRefresh) {
      // We can't return the actual token since it's in HTTP-only cookies
      // The server will handle token injection for API calls
      return "valid_token_in_cookies";
    }

    // If token needs refresh or is invalid, attempt refresh
    if (validationData.needsRefresh || !validationData.valid) {
      const tokenData = await refreshAccessToken(id);
      return tokenData.access_token || "refreshed_token_in_cookies";
    }

    throw new Error("Unable to get valid access token");
  } catch (error) {
    console.error("Failed to get valid access token:", error);
    throw error;
  }
}

// Helper function to check if user is authenticated
async function isAuthenticated() {
  try {
    const response = await fetch("/auth/status", {
      credentials: "include",
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.isAuthenticated && data.tokenValid;
  } catch (error) {
    console.error("Authentication check failed:", error);
    return false;
  }
}

// Helper function to logout and clear cookies
async function logout() {
  try {
    const response = await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      console.error("Logout request failed");
    }

    // Redirect to authentication page
    window.location.href = "/spotify";
  } catch (error) {
    console.error("Logout failed:", error);
    // Force redirect even if logout request failed
    window.location.href = "/spotify";
  }
}

// Helper function to make authenticated requests to Spotify API
// This replaces the need for other files to access tokens directly
async function makeAuthenticatedSpotifyRequest(url, options = {}) {
  try {
    // Ensure we have a valid token first
    await getValidAccessToken(window.spotifyClientId || "");

    // Get current token data to check if we're authenticated
    const authStatus = await fetch("/auth/status", {
      credentials: "include",
    });

    if (!authStatus.ok) {
      throw new Error("Authentication status check failed");
    }

    const authData = await authStatus.json();

    if (!authData.isAuthenticated || !authData.tokenValid) {
      throw new Error("Not authenticated or token invalid");
    }

    // Since tokens are in HTTP-only cookies, we need to make requests through our server
    // For now, we'll make direct requests and let the server middleware handle token injection
    // This is a placeholder - the actual implementation will depend on how the server is set up

    // Make the request with credentials to include cookies
    const response = await fetch(url, {
      ...options,
      credentials: "include",
      headers: {
        ...options.headers,
        "Content-Type": "application/json",
      },
    });

    // If we get a 401, try to refresh token and retry once
    if (response.status === 401) {
      await refreshAccessToken(window.spotifyClientId || "");

      // Retry the request
      return await fetch(url, {
        ...options,
        credentials: "include",
        headers: {
          ...options.headers,
          "Content-Type": "application/json",
        },
      });
    }

    return response;
  } catch (error) {
    console.error("Authenticated request failed:", error);
    throw error;
  }
}
