function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['ACTIVITIES_SERVICE_PORT'] ?? '4005', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
} as const;
