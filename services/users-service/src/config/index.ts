function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[users-service] Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['USERS_SERVICE_PORT'] ?? '4002', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
  bcryptRounds: parseInt(process.env['BCRYPT_ROUNDS'] ?? '12', 10),
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  activitiesServiceUrl: process.env['ACTIVITIES_SERVICE_URL'] ?? 'http://localhost:4006',
} as const;
