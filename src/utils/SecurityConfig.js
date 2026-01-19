import crypto from "crypto";

/**
 * Security Configuration for Cookie Management
 * Handles environment-specific security settings
 */
class SecurityConfig {
  constructor() {
    this.environment = process.env.ENVIRONMENT.trim() || "development";
    console.log(this.environment);
    this.isProduction = this.environment === "production";
    this.isDevelopment = this.environment === "development";
  }

  /**
   * Get cookie security configuration based on environment
   * @returns {Object} Cookie configuration object
   */
  getCookieConfig() {
    const baseConfig = {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours default
    };

    // Production-specific security settings
    if (this.isProduction) {
      return {
        ...baseConfig,
        secure: true, // Require HTTPS in production
        sameSite: "strict", // Strict SameSite for production
        domain: process.env.COOKIE_DOMAIN || undefined, // Allow domain specification
      };
    }

    // Development settings (less restrictive for local development)
    return {
      ...baseConfig,
      secure: false, // Allow HTTP in development
      sameSite: "lax", // More permissive for development
    };
  }

  /**
   * Get session configuration based on environment
   * @returns {Object} Session configuration object
   */
  getSessionConfig() {
    const baseConfig = {
      secret: process.env.SESSION_SECRET || this.generateFallbackSecret(),
      resave: false,
      saveUninitialized: false, // Don't save empty sessions
      name: "spotify.sid", // Custom session name
      cookie: this.getCookieConfig(),
    };

    if (this.isProduction) {
      return {
        ...baseConfig,
        cookie: {
          ...baseConfig.cookie,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours in production
          secure: true,
        },
      };
    }

    return {
      ...baseConfig,
      cookie: {
        ...baseConfig.cookie,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in development for convenience
        secure: false,
      },
    };
  }

  /**
   * Validate required environment variables
   * @throws {Error} If required variables are missing
   */
  validateEnvironment() {
    const required = [
      "SPOTIFY_CLIENT_ID",
      "SESSION_SECRET",
      "COOKIE_ENCRYPTION_KEY",
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`,
      );
    }

    // Validate encryption key format
    const encryptionKey = process.env.COOKIE_ENCRYPTION_KEY;
    if (encryptionKey && Buffer.from(encryptionKey, "hex").length !== 32) {
      throw new Error(
        "COOKIE_ENCRYPTION_KEY must be 32 bytes (64 hex characters)",
      );
    }
  }

  /**
   * Generate a fallback secret for development (not for production use)
   * @returns {string} Generated secret
   */
  generateFallbackSecret() {
    if (this.isProduction) {
      throw new Error(
        "SESSION_SECRET environment variable is required in production",
      );
    }

    console.warn(
      "⚠️  Using generated session secret for development. Set SESSION_SECRET environment variable.",
    );
    return "dev-secret-" + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Generate a secure encryption key for development
   * @returns {string} Generated encryption key (hex)
   */
  static generateEncryptionKey() {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Get CORS configuration based on environment
   * @returns {Object} CORS configuration
   */
  getCorsConfig() {
    if (this.isProduction) {
      return {
        origin: process.env.ALLOWED_ORIGINS?.split(",") || false,
        credentials: true,
        optionsSuccessStatus: 200,
      };
    }

    // Development CORS (more permissive)
    return {
      origin: ["http://localhost:8080", "http://127.0.0.1:8080"],
      credentials: true,
      optionsSuccessStatus: 200,
    };
  }

  /**
   * Get security headers configuration
   * @returns {Object} Security headers
   */
  getSecurityHeaders() {
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    };

    if (this.isProduction) {
      headers["Strict-Transport-Security"] =
        "max-age=31536000; includeSubDomains";
    }

    return headers;
  }

  /**
   * Log security configuration (without sensitive data)
   */
  logConfiguration() {
    console.log("🔒 Security Configuration:");
    console.log(`   Environment: ${this.environment}`);
    console.log(`   Secure Cookies: ${this.getCookieConfig().secure}`);
    console.log(`   SameSite: ${this.getCookieConfig().sameSite}`);
    console.log(`   HTTP Only: ${this.getCookieConfig().httpOnly}`);

    if (this.isDevelopment) {
      console.log("⚠️  Development mode - some security features are relaxed");
    }
  }
}

export default SecurityConfig;
