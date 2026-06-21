function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[leads-service] Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['LEADS_SERVICE_PORT'] ?? '4003', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  activitiesServiceUrl: process.env['ACTIVITIES_SERVICE_URL'] ?? 'http://localhost:4006',
  metaServiceUrl: process.env['META_SERVICE_URL'] ?? 'http://localhost:4007',
  cronSecret: process.env['CRON_SECRET'] ?? '',
} as const;
