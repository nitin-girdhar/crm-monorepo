function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[analytics-service] Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['ANALYTICS_SERVICE_PORT'] ?? '4005', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
} as const;
