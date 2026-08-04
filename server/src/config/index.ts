/**
 * Application Configuration
 * Loads and validates environment variables
 */
export interface AppConfig {
  app: {
    nodeEnv: string;
    port: number;
    /**
     * IANA zone the platform's event wall-clock times are expressed in.
     * India-only product, so this is 'Asia/Kolkata' unless overridden.
     */
    timezone: string;
  };
  database: {
    url: string;
    name: string;
  };
  firebase: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  cors: {
    origins: string[];
  };
  aws: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    s3Bucket: string;
    presignedUrlExpiry: number;
  };
  logging: {
    level: string;
  };
  email: {
    /** When false (default) nothing is sent — the message is logged instead. */
    enabled: boolean;
    apiKey: string;
    from: string;
  };
  /** Empty string = Sentry disabled (init is skipped, capture calls are no-ops). */
  sentryDsn: string;
  rateLimit: {
    /**
     * `off`   — limiter does nothing.
     * `log`   — counts and logs would-be violations, never returns 429 (default).
     * `enforce` — returns 429 once a cap is exceeded.
     */
    mode: 'off' | 'log' | 'enforce';
  };
  features: {
    /** Enable activity logging (default: false for new platforms) */
    activityLogging: boolean;
    /** Gate verbose auth-plugin debug logs (default: false). Never logs secrets. */
    authDebugLogging: boolean;
  };
  /**
   * 32-byte hex string used as the AES-256-GCM key for field-level encryption
   * of PII (Aadhaar, PAN, bank account, etc). Required in production.
   */
  encryptionKey: string;
  /**
   * IPs (or CIDR-not-supported plain IPs) that the rate limiter trusts to
   * provide an X-Forwarded-For header. Direct connections from any other
   * source IP are rate-limited by their socket IP, not the XFF value.
   */
  trustedProxies: string[];
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): AppConfig {
  // Validate required environment variables
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
  ];

  const missing = requiredVars.filter((varName) => !Bun.env[varName]);

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
    console.error('Please check your .env file');
    process.exit(1);
  }

  const nodeEnv = Bun.env.NODE_ENV || 'development';

  // CORS validation: in production, an explicit origin list is mandatory and
  // wildcard ('*') is forbidden because we send credentials.
  const corsRaw = Bun.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);

  if (nodeEnv === 'production') {
    if (!corsRaw || corsRaw.length === 0) {
      console.error('CORS_ORIGIN is required in production. Set an explicit, comma-separated origin list.');
      process.exit(1);
    }
    if (corsRaw.includes('*')) {
      console.error('CORS_ORIGIN cannot include "*" in production (credentials are sent). Set explicit origins.');
      process.exit(1);
    }
  }

  // ENCRYPTION_KEY validation: required in production, dev fallback warned in crypto util
  const encryptionKey = Bun.env.ENCRYPTION_KEY || '';
  if (nodeEnv === 'production' && (!encryptionKey || encryptionKey.length < 64)) {
    console.error('ENCRYPTION_KEY is required in production (64 hex chars = 32 bytes).');
    process.exit(1);
  }

  const rateLimitModeRaw = Bun.env.RATE_LIMIT_MODE || 'log';
  if (!['off', 'log', 'enforce'].includes(rateLimitModeRaw)) {
    console.error(`Invalid RATE_LIMIT_MODE "${rateLimitModeRaw}". Use one of: off, log, enforce.`);
    process.exit(1);
  }
  const rateLimitMode = rateLimitModeRaw as 'off' | 'log' | 'enforce';

  const trustedProxies = (Bun.env.TRUSTED_PROXIES || '127.0.0.1,::1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    app: {
      nodeEnv,
      port: parseInt(Bun.env.PORT || '8080', 10),
      timezone: Bun.env.APP_TIMEZONE || 'Asia/Kolkata',
    },
    database: {
      url: Bun.env.DATABASE_URL!,
      name: Bun.env.DATABASE_NAME || 'music-server',
    },
    firebase: {
      projectId: Bun.env.FIREBASE_PROJECT_ID!,
      privateKey: Bun.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      clientEmail: Bun.env.FIREBASE_CLIENT_EMAIL!,
    },
    jwt: {
      secret: Bun.env.JWT_SECRET!,
      expiresIn: Bun.env.JWT_EXPIRATION || '1h',
      refreshSecret: Bun.env.JWT_REFRESH_SECRET!,
      refreshExpiresIn: Bun.env.JWT_REFRESH_EXPIRATION || '7d',
    },
    cors: {
      origins: corsRaw && corsRaw.length > 0 ? corsRaw : ['*'],
    },
    aws: {
      region: Bun.env.AWS_REGION || 'ap-south-1',
      accessKeyId: Bun.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY || '',
      s3Bucket: Bun.env.AWS_S3_BUCKET || '',
      presignedUrlExpiry: parseInt(Bun.env.AWS_PRESIGNED_URL_EXPIRY || '3600', 10),
    },
    logging: {
      level: Bun.env.LOG_LEVEL || 'info',
    },
    email: {
      enabled: Bun.env.EMAIL_ENABLED === 'true',
      apiKey: Bun.env.RESEND_API_KEY || '',
      from: Bun.env.EMAIL_FROM || 'ZTS Music <onboarding@resend.dev>',
    },
    sentryDsn: Bun.env.SENTRY_DSN || '',
    rateLimit: {
      // Default `log`: the caps have never seen production traffic, so run in
      // observe-only mode first and switch to `enforce` after reviewing logs.
      mode: rateLimitMode,
    },
    features: {
      // Activity logging enabled by default — admin actions touch PII and
      // must be auditable. Set ENABLE_ACTIVITY_LOGGING=false to opt out.
      activityLogging: Bun.env.ENABLE_ACTIVITY_LOGGING !== 'false',
      authDebugLogging: Bun.env.AUTH_DEBUG_LOGGING === 'true',
    },
    encryptionKey,
    trustedProxies,
  };
}

// Export singleton config instance
export const config = loadConfig();
