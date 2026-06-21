import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { AUTH_COOKIE_NAME } from '@crm/auth-constants';
import { config } from './config.js';
import { proxyTo, proxyToRaw } from './lib/proxy.js';
import { authPreHandler } from './middleware/auth.js';
import { verifyJwtEdge, revokeJti } from './lib/jwt-verify.js';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    ...(config.nodeEnv !== 'production' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  },
});

app.register(cookie);
app.register(cors, {
  origin: config.webUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});

app.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));

// ── Public routes (no JWT required) ────────────────────────────────────────
app.post('/auth/login', async (req, reply) => {
  return proxyTo(config.authServiceUrl, '/api/v1/auth/login', req, reply);
});

app.post('/auth/logout', async (req, reply) => {
  // Revoke the JTI in the DB before proxying so protected routes reject immediately
  const token = req.cookies[AUTH_COOKIE_NAME];
  if (token) {
    const result = await verifyJwtEdge(token);
    if (result.ok && result.payload.jti && result.payload.exp) {
      await revokeJti(result.payload.jti, result.payload.exp, {
        user_id: result.payload.sub,
        org_id: result.payload.org_id,
        tenant_id: result.payload.tenant_id,
      });
    }
  }
  return proxyTo(config.authServiceUrl, '/api/v1/auth/logout', req, reply, undefined, { forwardCookies: true });
});

app.get('/auth/me', async (req, reply) => {
  return proxyTo(config.authServiceUrl, '/api/v1/auth/me', req, reply, undefined, { forwardCookies: true });
});

// ── Intake webhook (no JWT — called by ad platforms) ───────────────────────
// Rate-limited to 60 requests/minute per IP. Requires a pre-shared API key
// in the X-Api-Key header so only registered ad platform integrations can post.
app.post('/intake/webhook', async (req, reply) => {
  const apiKey = (req.headers['x-api-key'] as string | undefined) ?? '';
  if (!apiKey || apiKey !== config.webhookApiKey) {
    return reply.status(401).send({ error: 'Invalid or missing API key' });
  }
  return proxyTo(config.leadsServiceUrl, '/api/v1/intake/webhook', req, reply);
});

// ── Meta webhook (public — called by Meta, no JWT) ──────────────────────────
// HMAC verification happens inside meta-conversion-api itself (per-org secrets)
app.get('/meta/webhook/:integrationId', async (req, reply) => {
  const { integrationId } = req.params as { integrationId: string };
  return proxyTo(config.metaServiceUrl, `/api/v1/webhook/${integrationId}`, req, reply);
});
app.post('/meta/webhook/:integrationId', async (req, reply) => {
  const { integrationId } = req.params as { integrationId: string };
  return proxyToRaw(config.metaServiceUrl, `/api/v1/webhook/${integrationId}`, req, reply);
});

// ── Protected routes ────────────────────────────────────────────────────────
const withAuth = { preHandler: [authPreHandler] };

// Auth
app.post('/auth/change-password', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.authServiceUrl, '/api/v1/auth/change-password', req, reply, req.userCtx);
});

// Leads
app.get('/leads', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/leads', req, reply, req.userCtx);
});
app.post('/leads', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/leads', req, reply, req.userCtx);
});
app.get('/leads/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}`, req, reply, req.userCtx);
});
app.patch('/leads/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}`, req, reply, req.userCtx);
});
app.delete('/leads/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}`, req, reply, req.userCtx);
});
app.get('/leads/:id/timeline', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/timeline`, req, reply, req.userCtx);
});
app.get('/leads/:id/interactions', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/interactions`, req, reply, req.userCtx);
});
app.post('/leads/:id/interactions', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/interactions`, req, reply, req.userCtx);
});
app.get('/leads/:id/assignment-history', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/assignment-history`, req, reply, req.userCtx);
});
app.get('/leads/:id/follow-ups', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/follow-ups`, req, reply, req.userCtx);
});
app.post('/leads/:id/follow-ups', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/follow-ups`, req, reply, req.userCtx);
});
app.patch('/leads/:id/follow-ups/:followUpId', { ...withAuth }, async (req, reply) => {
  const { id, followUpId } = req.params as { id: string; followUpId: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/follow-ups/${followUpId}`, req, reply, req.userCtx);
});
app.delete('/leads/:id/follow-ups/:followUpId', { ...withAuth }, async (req, reply) => {
  const { id, followUpId } = req.params as { id: string; followUpId: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/leads/${id}/follow-ups/${followUpId}`, req, reply, req.userCtx);
});

// Leads — assignments within lead context
app.get('/leads/:id/assignments', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/api/v1/assignments/${id}`, req, reply, req.userCtx);
});

// Cross-lead follow-ups pipeline
app.get('/follow-ups', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/follow-ups', req, reply, req.userCtx);
});

// Campaigns
app.get('/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/campaigns', req, reply, req.userCtx);
});
app.post('/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/campaigns', req, reply, req.userCtx);
});
app.get('/campaigns/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/campaigns/${id}`, req, reply, req.userCtx);
});
app.patch('/campaigns/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/campaigns/${id}`, req, reply, req.userCtx);
});
app.delete('/campaigns/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/api/v1/campaigns/${id}`, req, reply, req.userCtx);
});

// Lookups
app.get('/lookups', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/lookups', req, reply, req.userCtx);
});
app.get('/lookups/cities', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/lookups/cities', req, reply, req.userCtx);
});
app.get('/lookups/lead-stages', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/lookups/lead-stages', req, reply, req.userCtx);
});
app.get('/lookups/lead-stage-outcomes', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/lookups/lead-stage-outcomes', req, reply, req.userCtx);
});

// Users
app.get('/users', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/users', req, reply, req.userCtx);
});
app.post('/users', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/users', req, reply, req.userCtx);
});
app.get('/users/assignable', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/users/assignable', req, reply, req.userCtx);
});
app.get('/users/team', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/users/team', req, reply, req.userCtx);
});
app.get('/users/org-chart', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/users/org-chart', req, reply, req.userCtx);
});
app.get('/users/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/api/v1/users/${id}`, req, reply, req.userCtx);
});
app.patch('/users/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/api/v1/users/${id}`, req, reply, req.userCtx);
});
app.delete('/users/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/api/v1/users/${id}`, req, reply, req.userCtx);
});
app.post('/users/:id/reset-password', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/api/v1/users/${id}/reset-password`, req, reply, req.userCtx);
});

// Assignments
app.get('/assignments', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.assignmentsServiceUrl, '/api/v1/assignments', req, reply, req.userCtx);
});
app.post('/assignments', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.assignmentsServiceUrl, '/api/v1/assignments', req, reply, req.userCtx);
});
app.get('/assignments/mine', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.assignmentsServiceUrl, '/api/v1/assignments/mine', req, reply, req.userCtx);
});
app.get('/assignments/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/api/v1/assignments/${id}`, req, reply, req.userCtx);
});
app.patch('/assignments/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/api/v1/assignments/${id}`, req, reply, req.userCtx);
});
app.delete('/assignments/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/api/v1/assignments/${id}`, req, reply, req.userCtx);
});

// Branches & locations (users-service)
app.get('/branches', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/branches', req, reply, req.userCtx);
});
app.get('/branches/all', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/branches/all', req, reply, req.userCtx);
});
app.get('/locations', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/api/v1/locations', req, reply, req.userCtx);
});
app.get('/lead-sources', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/api/v1/lead-sources', req, reply, req.userCtx);
});

// Activities (admin only — gateway enforces, service double-checks)
app.get('/activities', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.activitiesServiceUrl, '/api/v1/activities', req, reply, req.userCtx);
});

// Analytics
app.get('/analytics/dashboard', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/api/v1/analytics/dashboard', req, reply, req.userCtx);
});
app.get('/analytics/dashboard/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/api/v1/analytics/dashboard/campaigns', req, reply, req.userCtx);
});
app.get('/analytics/performance', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/api/v1/analytics/performance', req, reply, req.userCtx);
});
app.get('/analytics/pipeline', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/api/v1/analytics/pipeline', req, reply, req.userCtx);
});

// Meta CAPI (protected — manual conversion event trigger)
app.post('/meta/crm-event', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.metaServiceUrl, '/api/v1/crm-event', req, reply, req.userCtx);
});

// Meta integration management (protected — admin only)
app.get('/meta/integration', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.metaServiceUrl, '/api/v1/integration', req, reply, req.userCtx);
});
app.post('/meta/integration', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.metaServiceUrl, '/api/v1/integration', req, reply, req.userCtx);
});
app.patch('/meta/integration', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.metaServiceUrl, '/api/v1/integration', req, reply, req.userCtx);
});

// Legacy URL aliases (monolith used /api/dashboard and /api/org/performance)
app.get('/dashboard', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/api/v1/analytics/dashboard', req, reply, req.userCtx);
});
app.get('/dashboard/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/api/v1/analytics/dashboard/campaigns', req, reply, req.userCtx);
});
app.get('/org/performance', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/api/v1/analytics/performance', req, reply, req.userCtx);
});

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const stop = async () => {
  app.log.info('Graceful shutdown initiated');
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

start();
