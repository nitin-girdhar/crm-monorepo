#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mode = process.argv[2]; // 'build' or 'all'

const buildArtifacts = [
  'apps/web/.next',
  'apps/web/tsconfig.tsbuildinfo',
  '.turbo',
  'packages/auth-constants/dist',
  'packages/auth-constants/.turbo',
  'packages/db/dist',
  'packages/db/.turbo',
  'packages/internal-client/dist',
  'packages/internal-client/.turbo',
  'packages/permissions/dist',
  'packages/permissions/.turbo',
  'packages/types/dist',
  'packages/types/.turbo',
  'packages/validation/dist',
  'packages/validation/.turbo',
];

const nodeModules = [
  'node_modules',
  'apps/web/node_modules',
  'packages/auth-constants/node_modules',
  'packages/db/node_modules',
  'packages/internal-client/node_modules',
  'packages/permissions/node_modules',
  'packages/types/node_modules',
  'packages/validation/node_modules',
  'services/activities-service/node_modules',
  'services/analytics-service/node_modules',
  'services/api-gateway/node_modules',
  'services/assignments-service/node_modules',
  'services/auth-service/node_modules',
  'services/leads-service/node_modules',
  'services/users-service/node_modules',
];

const targets = mode === 'all'
  ? [...buildArtifacts, ...nodeModules]
  : buildArtifacts;

let removed = 0;
for (const rel of targets) {
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    fs.rmSync(abs, { recursive: true, force: true });
    console.log('removed', rel);
    removed++;
  }
}

console.log(`\nDone. ${removed} item(s) removed.`);
if (mode === 'all') {
  console.log('Run: pnpm install  (then pnpm turbo build for packages)');
}
