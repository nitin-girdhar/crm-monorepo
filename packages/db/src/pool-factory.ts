import fs from 'node:fs';
import postgres from 'postgres';

function buildSslConfig(): boolean | object {
  const sslMode = process.env['PG_SSL_MODE'];
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (sslMode === 'disable') return false;

  const caPath = process.env['PG_SSL_CA_PATH'];
  const caInline = process.env['PG_SSL_CA'];

  if (caPath || caInline) {
    return {
      rejectUnauthorized: true,
      ca: caPath ? fs.readFileSync(caPath, 'utf-8') : caInline,
    };
  }

  if (isProduction) {
    return { rejectUnauthorized: true };
  }

  return false;
}

export function makePool(url: string): ReturnType<typeof postgres> {
  const max = parseInt(process.env['PG_MAX'] ?? '10', 10);
  const idleTimeout = parseInt(process.env['PG_IDLE_TIMEOUT'] ?? '30', 10);
  const ssl = buildSslConfig();

  return postgres(url, {
    max,
    idle_timeout: idleTimeout,
    ssl,
  });
}
