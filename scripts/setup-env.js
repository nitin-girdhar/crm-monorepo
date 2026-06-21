#!/usr/bin/env node
/**
 * Generates per-service .env files from the root .env.
 *
 * Usage:  node scripts/setup-env.js
 *
 * Each service gets only the variables it actually needs (defined in its
 * .env.example).  Running this script is optional — during monorepo dev
 * `pnpm dev` loads the root .env directly via `tsx --env-file ../../.env`.
 *
 * Use per-service .env files when:
 *   - Debugging a single service in isolation (`pnpm dev:local`)
 *   - Building a standalone Docker image that needs baked-in defaults
 *   - Running in CI where each service is tested independently
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const rootEnvPath = path.join(ROOT, '.env');

if (!fs.existsSync(rootEnvPath)) {
  console.error('Root .env not found. Copy .env.example → .env first.');
  process.exit(1);
}

function parseEnv(filePath) {
  const vars = {};
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return vars;
}

const rootVars = parseEnv(rootEnvPath);

const services = fs.readdirSync(path.join(ROOT, 'services'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let generated = 0;

for (const svc of services) {
  const examplePath = path.join(ROOT, 'services', svc, '.env.example');
  if (!fs.existsSync(examplePath)) continue;

  const needed = parseEnv(examplePath);
  const lines = ['# Auto-generated from root .env — do not commit'];

  for (const [key, fallback] of Object.entries(needed)) {
    lines.push(`${key}=${rootVars[key] ?? fallback}`);
  }

  const outPath = path.join(ROOT, 'services', svc, '.env');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
  console.log(`  services/${svc}/.env`);
  generated++;
}

// Web app
const webExample = path.join(ROOT, 'apps', 'web', '.env.example');
if (fs.existsSync(webExample)) {
  const needed = parseEnv(webExample);
  const lines = ['# Auto-generated from root .env — do not commit'];
  for (const [key, fallback] of Object.entries(needed)) {
    lines.push(`${key}=${rootVars[key] ?? fallback}`);
  }
  fs.writeFileSync(path.join(ROOT, 'apps', 'web', '.env.local'), lines.join('\n') + '\n', 'utf-8');
  console.log('  apps/web/.env.local');
  generated++;
}

console.log(`\nGenerated ${generated} .env files from root .env`);
