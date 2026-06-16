import postgres from 'postgres';

export function makePool(url: string): ReturnType<typeof postgres> {
  const isProduction = process.env['NODE_ENV'] === 'production';
  const max = parseInt(process.env['PG_MAX'] ?? '10', 10);
  const idleTimeout = parseInt(process.env['PG_IDLE_TIMEOUT'] ?? '30', 10);

  return postgres(url, {
    max,
    idle_timeout: idleTimeout,
    ssl: isProduction ? { rejectUnauthorized: false } : false,
  });
}
