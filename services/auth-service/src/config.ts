function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requireInt(name: string): number {
  const raw = requireEnv(name);
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  return n;
}

export const config = {
  port: parseInt(process.env['AUTH_SERVICE_PORT'] ?? '4001', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  jwtSecret: requireEnv('JWT_SECRET'),
  bcryptRounds: requireInt('BCRYPT_ROUNDS'),
  databaseUrl: requireEnv('DATABASE_URL'),
  databaseUrlService: requireEnv('DATABASE_URL_SERVICE'),
  activitiesServiceUrl: process.env['ACTIVITIES_SERVICE_URL'] ?? 'http://localhost:4006',
} as const;
