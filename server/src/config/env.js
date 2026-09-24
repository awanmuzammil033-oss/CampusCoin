import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE || '.env' });

/**
 * Central place for every environment value the app reads.
 * Keeping defaults here means a fresh clone still runs in dev
 * without forcing anyone to edit files before the first try.
 */
const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campuscoin',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:5000',

  emailBackend: process.env.EMAIL_BACKEND || 'console', // 'console' | 'smtp'
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'no-reply@campuscoin.test',
  },

  sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES || 30),

  // Optional: a remote text-generation endpoint for monthly narratives.
  // The app is fully functional without it — templates are the default.
  narrativeApiKey: process.env.NARRATIVE_API_KEY || '',
  narrativeApiUrl: process.env.NARRATIVE_API_URL || '',
};

export const isProd = env.nodeEnv === 'production';

export default env;
