import crypto from 'node:crypto';

/**
 * Secure Cookie Manager for handling Spotify authentication tokens
 * Implements HTTP-only, secure, and SameSite cookie management with encryption
 */
class CookieManager {
  constructor() {
    this.encryptionKey = this.getEncryptionKey();
    this.algorithm = 'aes-256-gcm';
    
    // Cookie configuration based on environment
    this.cookieConfig = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/'
    };
  }

  /**
   * Get or generate encryption key for token encryption
   * @returns {Buffer} Encryption key
   */
  getEncryptionKey() {
    const keyString = process.env.COOKIE_ENCRYPTION_KEY;
    
    if (!keyString) {
      throw new Error('COOKIE_ENCRYPTION_KEY environment variable is required');
    }
    
    // Ensure key is 32 bytes for AES-256
    const key = Buffer.from(keyString, 'hex');
    if (key.length !== 32) {
      throw new Error('COOKIE_ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    
    return key;
  }

  /**
   * Encrypt sensitive data before storing in cookies
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted data with IV and auth tag
   */
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      cipher.setAAD(Buffer.from('spotify-auth', 'utf8'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Combine IV, auth tag, and encrypted data
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data from cookies
   * @param {string} encryptedData - Encrypted data with IV and auth tag
   * @returns {string} Decrypted text
   */
  decrypt(encryptedData) {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAAD(Buffer.from('spotify-auth', 'utf8'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Store Spotify tokens in secure cookies
   * @param {Object} cookie - Elysia cookie object
   * @param {string} accessToken - Spotify access token
   * @param {string} refreshToken - Spotify refresh token
   * @param {number} expiresIn - Token expiry time in seconds
   */
  setTokens(cookie, accessToken, refreshToken, expiresIn) {
    try {
      const expiryTime = Date.now() + (expiresIn * 1000);
      
      // Encrypt sensitive tokens
      const encryptedAccessToken = this.encrypt(accessToken);
      const encryptedRefreshToken = this.encrypt(refreshToken);
      
      // Set cookies with security flags using Elysia's API
      cookie.spotify_access_token.set({
        ...this.cookieConfig,
        value: encryptedAccessToken,
        maxAge: expiresIn
      });
      
      cookie.spotify_refresh_token.set({
        ...this.cookieConfig,
        value: encryptedRefreshToken,
        maxAge: 30 * 24 * 60 * 60
      });
      
      cookie.spotify_token_expiry.set({
        ...this.cookieConfig,
        value: expiryTime.toString(),
        maxAge: expiresIn
      });
      
      // Store token type and scope (less sensitive)
      cookie.spotify_token_type.set({
        ...this.cookieConfig,
        value: 'Bearer',
        maxAge: expiresIn
      });
      
    } catch (error) {
      throw new Error(`Failed to set tokens: ${error.message}`);
    }
  }

  /**
   * Retrieve and decrypt access token from cookies
   * @param {Object} cookie - Elysia cookie object
   * @returns {string|null} Decrypted access token or null if not found
   */
  getAccessToken(cookie) {
    try {
      const encryptedToken = cookie.spotify_access_token?.value;
      if (!encryptedToken) {
        return null;
      }
      
      return this.decrypt(encryptedToken);
    } catch (error) {
      console.error('Failed to decrypt access token:', error.message);
      return null;
    }
  }

  /**
   * Retrieve and decrypt refresh token from cookies
   * @param {Object} cookie - Elysia cookie object
   * @returns {string|null} Decrypted refresh token or null if not found
   */
  getRefreshToken(cookie) {
    try {
      const encryptedToken = cookie.spotify_refresh_token?.value;
      if (!encryptedToken) {
        return null;
      }
      
      return this.decrypt(encryptedToken);
    } catch (error) {
      console.error('Failed to decrypt refresh token:', error.message);
      return null;
    }
  }

  /**
   * Get token expiry time from cookies
   * @param {Object} cookie - Elysia cookie object
   * @returns {number|null} Token expiry timestamp or null if not found
   */
  getTokenExpiry(cookie) {
    const expiryString = cookie.spotify_token_expiry?.value;
    if (!expiryString) {
      return null;
    }
    
    const expiry = parseInt(expiryString, 10);
    return isNaN(expiry) ? null : expiry;
  }

  /**
   * Get token type from cookies
   * @param {Object} cookie - Elysia cookie object
   * @returns {string} Token type (default: 'Bearer')
   */
  getTokenType(cookie) {
    return cookie.spotify_token_type?.value || 'Bearer';
  }

  /**
   * Check if the current token is valid (not expired)
   * @param {Object} cookie - Elysia cookie object
   * @param {number} bufferMinutes - Buffer time in minutes before considering token expired
   * @returns {boolean} True if token is valid
   */
  isTokenValid(cookie, bufferMinutes = 5) {
    const accessToken = this.getAccessToken(cookie);
    const expiry = this.getTokenExpiry(cookie);
    
    if (!accessToken || !expiry) {
      return false;
    }
    
    const bufferMs = bufferMinutes * 60 * 1000;
    return Date.now() < (expiry - bufferMs);
  }

  /**
   * Clear all Spotify-related cookies
   * @param {Object} cookie - Elysia cookie object
   */
  clearTokens(cookie) {
    const cookieNames = [
      'spotify_access_token',
      'spotify_refresh_token',
      'spotify_token_expiry',
      'spotify_token_type'
    ];
    
    cookieNames.forEach(name => {
      if (cookie[name]) {
        cookie[name].remove();
      }
    });
  }

  /**
   * Get all token data from cookies
   * @param {Object} cookie - Elysia cookie object
   * @returns {Object|null} Token data object or null if incomplete
   */
  getAllTokenData(cookie) {
    const accessToken = this.getAccessToken(cookie);
    const refreshToken = this.getRefreshToken(cookie);
    const expiry = this.getTokenExpiry(cookie);
    const tokenType = this.getTokenType(cookie);
    
    if (!accessToken || !refreshToken || !expiry) {
      return null;
    }
    
    return {
      accessToken,
      refreshToken,
      expiresAt: expiry,
      tokenType,
      isValid: this.isTokenValid(cookie)
    };
  }

  /**
   * Update only the access token (used during token refresh)
   * @param {Object} cookie - Elysia cookie object
   * @param {string} accessToken - New access token
   * @param {number} expiresIn - Token expiry time in seconds
   */
  updateAccessToken(cookie, accessToken, expiresIn) {
    try {
      const expiryTime = Date.now() + (expiresIn * 1000);
      const encryptedAccessToken = this.encrypt(accessToken);
      
      cookie.spotify_access_token.set({
        ...this.cookieConfig,
        value: encryptedAccessToken,
        maxAge: expiresIn
      });
      
      cookie.spotify_token_expiry.set({
        ...this.cookieConfig,
        value: expiryTime.toString(),
        maxAge: expiresIn
      });
      
    } catch (error) {
      throw new Error(`Failed to update access token: ${error.message}`);
    }
  }
}

export default CookieManager;