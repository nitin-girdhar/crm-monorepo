import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { AUTH_COOKIE_NAME } from '@crm/auth-constants';
import { config } from './config.js';
import { proxyTo } from './lib/proxy.js';
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
  return proxyTo(config.authServiceUrl, '/auth/login', req, reply);
});

app.post('/auth/logout', async (req, reply) => {
  // Revoke the JTI locally before proxying so protected routes reject immediately
  const token = req.cookies[AUTH_COOKIE_NAME];
  if (token) {
    const result = await verifyJwtEdge(token);
    if (result.ok && result.payload.jti && result.payload.exp) {
      revokeJti(result.payload.jti, result.payload.exp);
    }
  }
  return proxyTo(config.authServiceUrl, '/auth/logout', req, reply);
});

app.get('/auth/me', async (req, reply) => {
  return proxyTo(config.authServiceUrl, '/auth/me', req, reply);
});

// ── Intake webhook (no JWT — called by ad platforms) ───────────────────────
app.post('/intake/webhook', async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/intake/webhook', req, reply);
});

// ── Protected routes ────────────────────────────────────────────────────────
const withAuth = { preHandler: [authPreHandler] };

// Auth
app.post('/auth/change-password', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.authServiceUrl, '/auth/change-password', req, reply, req.userCtx);
});

// Leads
app.get('/leads', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/leads', req, reply, req.userCtx);
});
app.post('/leads', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/leads', req, reply, req.userCtx);
});
app.get('/leads/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}`, req, reply, req.userCtx);
});
app.patch('/leads/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}`, req, reply, req.userCtx);
});
app.delete('/leads/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}`, req, reply, req.userCtx);
});
app.get('/leads/:id/timeline', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/timeline`, req, reply, req.userCtx);
});
app.get('/leads/:id/interactions', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/interactions`, req, reply, req.userCtx);
});
app.post('/leads/:id/interactions', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/interactions`, req, reply, req.userCtx);
});
app.get('/leads/:id/assignment-history', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/assignment-history`, req, reply, req.userCtx);
});
app.get('/leads/:id/follow-ups', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/follow-ups`, req, reply, req.userCtx);
});
app.post('/leads/:id/follow-ups', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/follow-ups`, req, reply, req.userCtx);
});
app.patch('/leads/:id/follow-ups/:followUpId', { ...withAuth }, async (req, reply) => {
  const { id, followUpId } = req.params as { id: string; followUpId: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/follow-ups/${followUpId}`, req, reply, req.userCtx);
});
app.delete('/leads/:id/follow-ups/:followUpId', { ...withAuth }, async (req, reply) => {
  const { id, followUpId } = req.params as { id: string; followUpId: string };
  return proxyTo(config.leadsServiceUrl, `/leads/${id}/follow-ups/${followUpId}`, req, reply, req.userCtx);
});

// Leads — assignments within lead context
app.get('/leads/:id/assignments', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/assignments/${id}`, req, reply, req.userCtx);
});

// Cross-lead follow-ups pipeline
app.get('/follow-ups', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/follow-ups', req, reply, req.userCtx);
});

// Campaigns
app.get('/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/campaigns', req, reply, req.userCtx);
});
app.post('/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/campaigns', req, reply, req.userCtx);
});
app.get('/campaigns/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/campaigns/${id}`, req, reply, req.userCtx);
});
app.patch('/campaigns/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/campaigns/${id}`, req, reply, req.userCtx);
});
app.delete('/campaigns/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.leadsServiceUrl, `/campaigns/${id}`, req, reply, req.userCtx);
});

// Lookups
app.get('/lookups', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/lookups', req, reply, req.userCtx);
});
app.get('/lookups/cities', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/lookups/cities', req, reply, req.userCtx);
});
app.get('/lookups/lead-stages', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/lookups/lead-stages', req, reply, req.userCtx);
});
app.get('/lookups/lead-stage-outcomes', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/lookups/lead-stage-outcomes', req, reply, req.userCtx);
});

// Users
app.get('/users', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/users', req, reply, req.userCtx);
});
app.post('/users', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/users', req, reply, req.userCtx);
});
app.get('/users/assignable', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/users/assignable', req, reply, req.userCtx);
});
app.get('/users/team', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/users/team', req, reply, req.userCtx);
});
app.get('/users/org-chart', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/users/org-chart', req, reply, req.userCtx);
});
app.get('/users/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/users/${id}`, req, reply, req.userCtx);
});
app.patch('/users/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/users/${id}`, req, reply, req.userCtx);
});
app.delete('/users/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/users/${id}`, req, reply, req.userCtx);
});
app.post('/users/:id/reset-password', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.usersServiceUrl, `/users/${id}/reset-password`, req, reply, req.userCtx);
});

// Assignments
app.get('/assignments', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.assignmentsServiceUrl, '/assignments', req, reply, req.userCtx);
});
app.post('/assignments', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.assignmentsServiceUrl, '/assignments', req, reply, req.userCtx);
});
app.get('/assignments/mine', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.assignmentsServiceUrl, '/assignments/mine', req, reply, req.userCtx);
});
app.get('/assignments/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/assignments/${id}`, req, reply, req.userCtx);
});
app.patch('/assignments/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/assignments/${id}`, req, reply, req.userCtx);
});
app.delete('/assignments/:id', { ...withAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  return proxyTo(config.assignmentsServiceUrl, `/assignments/${id}`, req, reply, req.userCtx);
});

// Branches & locations (users-service)
app.get('/branches', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/branches', req, reply, req.userCtx);
});
app.get('/branches/all', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/branches/all', req, reply, req.userCtx);
});
app.get('/locations', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.leadsServiceUrl, '/locations', req, reply, req.userCtx);
});
app.get('/lead-sources', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.usersServiceUrl, '/lead-sources', req, reply, req.userCtx);
});

// Activities (admin only — gateway enforces, service double-checks)
app.get('/activities', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.activitiesServiceUrl, '/activities', req, reply, req.userCtx);
});

// Analytics
app.get('/analytics/dashboard', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/analytics/dashboard', req, reply, req.userCtx);
});
app.get('/analytics/dashboard/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/analytics/dashboard/campaigns', req, reply, req.userCtx);
});
app.get('/analytics/performance', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/analytics/performance', req, reply, req.userCtx);
});
app.get('/analytics/pipeline', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/analytics/pipeline', req, reply, req.userCtx);
});

// Legacy URL aliases (monolith used /api/dashboard and /api/org/performance)
app.get('/dashboard', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/analytics/dashboard', req, reply, req.userCtx);
});
app.get('/dashboard/campaigns', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/analytics/dashboard/campaigns', req, reply, req.userCtx);
});
app.get('/org/performance', { ...withAuth }, async (req, reply) => {
  return proxyTo(config.analyticsServiceUrl, '/analytics/performance', req, reply, req.userCtx);
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
