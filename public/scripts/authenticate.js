// Generate a random code verifier
function generateCodeVerifier(length = 64) {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

// Generate a code challenge from the code verifier
async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert the hash to a base64 string
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// Initiate the authorization flow
async function initiateSpotifyAuth(id) {
  try {
    // If we are on localhost, we MUST switch to 127.0.0.1 to match the callback origin and preserve sessionStorage
    if (window.location.hostname === 'localhost') {
      console.log("Redirecting to 127.0.0.1 to ensure session consistency...");
      const newUrl = new URL(window.location.href);
      newUrl.hostname = '127.0.0.1';
      window.location.href = newUrl.toString();
      return;
    }
    // Generate and store the code verifier in session storage
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem("verifier", codeVerifier);

    const codeChallenge = await generateCodeChallenge(codeVerifier);
    // Force 127.0.0.1:8080 for local development as per Spotify requirements (localhost is not allowed)
    const origin = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:8080'
      : window.location.origin;
    const redirectUri = `${origin}/callback`;

    console.log("Initiating Auth with Redirect URI:", redirectUri);

    const scope =
      "user-read-playback-state user-modify-playback-state user-read-private user-read-email";
    const authorizeUrl = new URL("https://accounts.spotify.com/authorize");

    const params = {
      response_type: "code",
      client_id: id,
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

// Exchange authorization code for access token
async function exchangeCodeForToken(code, id) {
  try {
    // Retrieve the code verifier from session storage
    const codeVerifier = sessionStorage.getItem("verifier");

    if (!codeVerifier) {
      throw new Error("Code verifier not found in session storage");
    }

    const tokenUrl = "https://accounts.spotify.com/api/token";
    const origin = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:8080'
      : window.location.origin;
    const redirectUri = `${origin}/callback`;

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
      client_id: id,
      code_verifier: codeVerifier,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Token exchange failed: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const tokenData = await response.json();

    // Store tokens
    sessionStorage.setItem("token", tokenData.access_token);
    sessionStorage.setItem("refresh", tokenData.refresh_token);
    sessionStorage.setItem("expiry", Date.now() + tokenData.expires_in * 1000);

    // Clean up code verifier
    // sessionStorage.removeItem("verifier");

    return tokenData;
  } catch (error) {
    console.error("Token exchange failed:", error);
    throw error;
  }
}

// Refresh an expired token
async function refreshAccessToken(id) {
  try {
    const refreshToken = sessionStorage.getItem("refresh");

    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const tokenUrl = "https://accounts.spotify.com/api/token";

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: id,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const tokenData = await response.json();

    // Update stored tokens
    sessionStorage.setItem("token", tokenData.access_token);
    if (tokenData.refresh_token) {
      sessionStorage.setItem("refresh", tokenData.refresh_token);
    }
    sessionStorage.setItem("expiry", Date.now() + tokenData.expires_in * 1000);

    return tokenData;
  } catch (error) {
    console.error("Token refresh failed:", error);
    throw error;
  }
}

// Get a valid access token (refreshing if necessary)
async function getValidAccessToken(id) {
  const expiryTime = sessionStorage.getItem("expiry");
  const accessToken = sessionStorage.getItem("token");

  // If token exists and isn't expired (with 5 minute buffer), return it
  if (accessToken && expiryTime && Date.now() < parseInt(expiryTime) - 300000) {
    return accessToken;
  }

  // Otherwise, refresh the token
  const tokenData = await refreshAccessToken(id);
  return tokenData.access_token;
}
