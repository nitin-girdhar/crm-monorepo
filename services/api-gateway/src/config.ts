function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: parseInt(process.env['GATEWAY_PORT'] ?? '4000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  jwtSecret: requireEnv('JWT_SECRET'),
  // Shared secret injected into every upstream request so services can
  // reject calls that bypass the gateway
  serviceSecret: requireEnv('INTERNAL_SERVICE_SECRET'),
  // API key required by external callers of the intake webhook endpoint
  webhookApiKey: requireEnv('WEBHOOK_API_KEY'),
  authServiceUrl: process.env['AUTH_SERVICE_URL'] ?? 'http://localhost:4001',
  usersServiceUrl: process.env['USERS_SERVICE_URL'] ?? 'http://localhost:4002',
  leadsServiceUrl: process.env['LEADS_SERVICE_URL'] ?? 'http://localhost:4003',
  assignmentsServiceUrl: process.env['ASSIGNMENTS_SERVICE_URL'] ?? 'http://localhost:4004',
  analyticsServiceUrl: process.env['ANALYTICS_SERVICE_URL'] ?? 'http://localhost:4005',
  activitiesServiceUrl: process.env['ACTIVITIES_SERVICE_URL'] ?? 'http://localhost:4006',
  metaServiceUrl: process.env['META_SERVICE_URL'] ?? 'http://localhost:4007',
  communicationServiceUrl: process.env['COMMUNICATION_SERVICE_URL'] ?? 'http://localhost:4009',
  notificationsServiceUrl: process.env['NOTIFICATIONS_SERVICE_URL'] ?? 'http://localhost:4008',
  webUrl: process.env['WEB_URL'] ?? 'http://localhost:3000',
} as const;
