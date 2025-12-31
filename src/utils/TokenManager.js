import CookieManager from "./CookieManager.js";

/**
 * TokenManager - Handles automatic token refresh and validation
 * Implements automatic refresh logic with retry mechanisms and background processing
 */
class TokenManager {
  constructor(clientId) {
    this.cookieManager = new CookieManager();
    this.clientId = clientId;
    this.refreshPromises = new Map(); // Track ongoing refresh operations
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 10000, // 10 seconds
      backoffMultiplier: 2,
    };
  }

  /**
   * Get a valid access token, automatically refreshing if needed
   * @param {Object} cookie - Elysia cookie object
   * @returns {Promise<string|null>} Valid access token or null if refresh failed
   */
  async getValidToken(cookie) {
    try {
      // Check if token is valid with 5-minute buffer
      if (this.cookieManager.isTokenValid(cookie, 5)) {
        return this.cookieManager.getAccessToken(cookie);
      }

      // Token needs refresh - attempt automatic refresh
      const refreshedToken = await this.refreshTokenIfNeeded(cookie);
      return refreshedToken;
    } catch (error) {
      console.error("Failed to get valid token:", error.message);
      return null;
    }
  }

  /**
   * Check if token is expiring soon and refresh if needed
   * @param {Object} cookie - Elysia cookie object
   * @returns {Promise<string|null>} Refreshed access token or null if failed
   */
  async refreshTokenIfNeeded(cookie) {
    try {
      // Check if token is valid with buffer
      if (this.cookieManager.isTokenValid(cookie, 5)) {
        return this.cookieManager.getAccessToken(cookie);
      }

      // Get refresh token
      const refreshToken = this.cookieManager.getRefreshToken(cookie);
      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      // Check if refresh is already in progress for this token
      const refreshKey = this.generateRefreshKey(refreshToken);
      if (this.refreshPromises.has(refreshKey)) {
        // Wait for existing refresh operation
        return await this.refreshPromises.get(refreshKey);
      }

      // Start new refresh operation
      const refreshPromise = this.performTokenRefresh(refreshToken, cookie);
      this.refreshPromises.set(refreshKey, refreshPromise);

      try {
        const result = await refreshPromise;
        return result;
      } finally {
        // Clean up the promise from the map
        this.refreshPromises.delete(refreshKey);
      }
    } catch (error) {
      console.error("Token refresh check failed:", error.message);
      return null;
    }
  }

  /**
   * Perform the actual token refresh with retry logic
   * @param {string} refreshToken - Refresh token to use
   * @param {Object} cookie - Elysia cookie object
   * @returns {Promise<string|null>} New access token or null if failed
   */
  async performTokenRefresh(refreshToken, cookie) {
    let lastError = null;

    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Wait before retry with exponential backoff
          const delay = Math.min(
            this.retryConfig.baseDelay *
              Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
            this.retryConfig.maxDelay,
          );
          await this.sleep(delay);
          console.log(
            `Token refresh retry attempt ${attempt + 1}/${this.retryConfig.maxRetries} after ${delay}ms delay`,
          );
        }

        const tokenData = await this.refreshToken(refreshToken);

        if (tokenData && tokenData.access_token) {
          // Update cookies with new token data
          if (tokenData.refresh_token) {
            // Spotify provided a new refresh token
            this.cookieManager.setTokens(
              cookie,
              tokenData.access_token,
              tokenData.refresh_token,
              tokenData.expires_in,
            );
          } else {
            // Only update access token
            this.cookieManager.updateAccessToken(
              cookie,
              tokenData.access_token,
              tokenData.expires_in,
            );
          }

          console.log("Token refresh successful");
          return tokenData.access_token;
        } else {
          throw new Error("Invalid token response from Spotify");
        }
      } catch (error) {
        lastError = error;
        console.error(
          `Token refresh attempt ${attempt + 1} failed:`,
          error.message,
        );

        // Don't retry on certain error types
        if (this.isNonRetryableError(error)) {
          console.log(
            "Non-retryable error encountered, stopping retry attempts",
          );
          break;
        }
      }
    }

    console.error(
      `Token refresh failed after ${this.retryConfig.maxRetries} attempts:`,
      lastError?.message,
    );
    return null;
  }

  /**
   * Make the actual refresh request to Spotify
   * @param {string} refreshToken - Refresh token to use
   * @returns {Promise<Object>} Token response from Spotify
   */
  async refreshToken(refreshToken) {
    const tokenUrl = "https://accounts.spotify.com/api/token";
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
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
      const error = new Error(
        `Spotify API error: ${response.status} ${response.statusText}`,
      );
      error.status = response.status;
      error.spotifyError = errorData;
      throw error;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        return { error: 'invalid_json', message: text };
    }
  }

  /**
   * Check if token is expiring soon (within buffer time)
   * @param {Object} cookie - Elysia cookie object
   * @param {number} bufferMinutes - Buffer time in minutes (default: 5)
   * @returns {boolean} True if token is expiring soon
   */
  isTokenExpiringSoon(cookie, bufferMinutes = 5) {
    return !this.cookieManager.isTokenValid(cookie, bufferMinutes);
  }

  /**
   * Handle token-related errors and determine appropriate action
   * @param {Error} error - Error object from API call
   * @param {Object} cookie - Elysia cookie object
   * @returns {Promise<Object>} Error handling result
   */
  async handleTokenError(error, cookie) {
    const result = {
      handled: false,
      action: null,
      newToken: null,
      shouldRetry: false,
    };

    try {
      // Handle 401 Unauthorized errors
      if (error.status === 401 || error.message?.includes("401")) {
        console.log("Handling 401 error - attempting token refresh");

        const newToken = await this.refreshTokenIfNeeded(cookie);
        if (newToken) {
          result.handled = true;
          result.action = "token_refreshed";
          result.newToken = newToken;
          result.shouldRetry = true;
        } else {
          result.handled = true;
          result.action = "reauthenticate";
          result.shouldRetry = false;
        }
      }
      // Handle rate limiting (429)
      else if (error.status === 429) {
        const retryAfter = error.retryAfter || 1;
        console.log(
          `Rate limited - waiting ${retryAfter} seconds before retry`,
        );

        await this.sleep(retryAfter * 1000);
        result.handled = true;
        result.action = "rate_limited";
        result.shouldRetry = true;
      }
      // Handle network errors
      else if (
        error.code === "ENOTFOUND" ||
        error.code === "ECONNRESET" ||
        error.message?.includes("fetch")
      ) {
        console.log("Network error detected - will retry");
        result.handled = true;
        result.action = "network_error";
        result.shouldRetry = true;
      }

      return result;
    } catch (handlingError) {
      console.error("Error while handling token error:", handlingError.message);
      return {
        handled: false,
        action: "error_handling_failed",
        newToken: null,
        shouldRetry: false,
      };
    }
  }

  /**
   * Check if an error should not be retried
   * @param {Error} error - Error to check
   * @returns {boolean} True if error should not be retried
   */
  isNonRetryableError(error) {
    // Don't retry on authentication errors that indicate invalid refresh token
    if (error.status === 400 && error.spotifyError?.error === "invalid_grant") {
      return true;
    }

    // Don't retry on client errors (except 401 and 429)
    if (
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 401 &&
      error.status !== 429
    ) {
      return true;
    }

    return false;
  }

  /**
   * Generate a unique key for tracking refresh operations
   * @param {string} refreshToken - Refresh token
   * @returns {string} Unique key for the refresh operation
   */
  generateRefreshKey(refreshToken) {
    // Use a hash of the refresh token to create a unique key
    // This prevents multiple simultaneous refreshes for the same token
    return Buffer.from(refreshToken.slice(-10)).toString("base64");
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get token status information
   * @param {Object} cookie - Elysia cookie object
   * @returns {Object} Token status information
   */
  getTokenStatus(cookie) {
    const tokenData = this.cookieManager.getAllTokenData(cookie);

    if (!tokenData) {
      return {
        hasToken: false,
        isValid: false,
        needsRefresh: false,
        expiresAt: null,
        timeUntilExpiry: null,
      };
    }

    const now = Date.now();
    const timeUntilExpiry = tokenData.expiresAt - now;
    const needsRefresh = timeUntilExpiry < 5 * 60 * 1000; // 5 minutes

    return {
      hasToken: true,
      isValid: tokenData.isValid,
      needsRefresh: needsRefresh,
      expiresAt: tokenData.expiresAt,
      timeUntilExpiry: timeUntilExpiry,
      expiresInMinutes: Math.floor(timeUntilExpiry / (60 * 1000)),
    };
  }

  /**
   * Clear all refresh operations (useful for cleanup)
   */
  clearRefreshOperations() {
    this.refreshPromises.clear();
  }

  /**
   * Get the number of ongoing refresh operations
   * @returns {number} Number of ongoing refresh operations
   */
  getActiveRefreshCount() {
    return this.refreshPromises.size;
  }
}

export default TokenManager;
