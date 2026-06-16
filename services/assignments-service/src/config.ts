function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['ASSIGNMENTS_SERVICE_PORT'] ?? '4004', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
  activitiesServiceUrl: process.env['ACTIVITIES_SERVICE_URL'] ?? 'http://localhost:4006',
} as const;
