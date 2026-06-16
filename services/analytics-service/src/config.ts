function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['ANALYTICS_SERVICE_PORT'] ?? '4006', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlTenant: requireEnv('DATABASE_URL_TENANT'),
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
} as const;
