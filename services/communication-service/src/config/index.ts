function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[communication-service] Missing required env var: ${name}`);
  return value;
}

const smtpHost = process.env['SMTP_HOST'];
const smtpUser = process.env['SMTP_USER'];
const smtpPass = process.env['SMTP_PASS'];
const smtpFromEmail = process.env['SMTP_FROM_EMAIL'];

const interaktApiKey = process.env['INTERAKT_API_KEY'];

export const config = {
  port: parseInt(process.env['COMMUNICATION_SERVICE_PORT'] ?? '4009', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  logLevel: process.env['LOG_LEVEL'] ?? 'info',

  smtp: {
    host: smtpHost ?? '',
    port: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
    secure: process.env['SMTP_SECURE'] === 'true',
    user: smtpUser ?? '',
    pass: smtpPass ?? '',
    fromEmail: smtpFromEmail ?? '',
    fromName: process.env['SMTP_FROM_NAME'] ?? '',
  },

  interakt: {
    apiKey: interaktApiKey ?? '',
    baseUrl: process.env['INTERAKT_API_BASE_URL'] ?? 'https://api.interakt.ai/v1/public/',
  },

  isEmailConfigured: Boolean(smtpHost && smtpUser && smtpPass && smtpFromEmail),
  isWhatsAppConfigured: Boolean(interaktApiKey),
} as const;
