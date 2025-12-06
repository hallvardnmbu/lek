// services/auth-service.js

/**
 * Generates a random code verifier for PKCE.
 * @param {number} length 
 * @returns {string}
 */
function generateCodeVerifier(length = 64) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
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
        const codeVerifier = generateCodeVerifier();
        sessionStorage.setItem("verifier", codeVerifier);

        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Determine redirect URI
        const origin = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://127.0.0.1:8080'
            : window.location.origin;
        const redirectUri = `${origin}/callback`;

        const scope = "user-read-playback-state user-modify-playback-state user-read-private user-read-email";
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
 * Exchanges the authorization code for an access token.
 * @param {string} code 
 * @param {string} clientId 
 * @returns {Promise<Object>}
 */
export async function exchangeCodeForToken(code, clientId) {
    try {
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
            client_id: clientId,
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

        // Clean up code verifier - Optional, keeping implies we might re-use or just don't care to delete yet
        // sessionStorage.removeItem("verifier");

        return tokenData;
    } catch (error) {
        console.error("Token exchange failed:", error);
        throw error;
    }
}

/**
 * Refreshes the access token using the stored refresh token.
 * @param {string} clientId 
 * @returns {Promise<Object>}
 */
export async function refreshAccessToken(clientId) {
    try {
        const refreshToken = sessionStorage.getItem("refresh");

        if (!refreshToken) {
            throw new Error("No refresh token available");
        }

        const tokenUrl = "https://accounts.spotify.com/api/token";

        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: clientId,
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

/**
 * Gets a valid access token, refreshing if necessary.
 * @param {string} clientId 
 * @returns {Promise<string>}
 */
export async function getValidAccessToken(clientId) {
    const expiryTime = sessionStorage.getItem("expiry");
    const accessToken = sessionStorage.getItem("token");

    // If token exists and isn't expired (with 5 minute buffer), return it
    if (accessToken && expiryTime && Date.now() < parseInt(expiryTime) - 300000) {
        return accessToken;
    }

    // Otherwise, refresh the token
    const tokenData = await refreshAccessToken(clientId);
    return tokenData.access_token;
}
