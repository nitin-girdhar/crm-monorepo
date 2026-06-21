function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[assignments-service] Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['ASSIGNMENTS_SERVICE_PORT'] ?? '4004', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  activitiesServiceUrl: process.env['ACTIVITIES_SERVICE_URL'] ?? 'http://localhost:4006',
} as const;
