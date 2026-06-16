import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { closeAllPools } from '@crm/db';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    ...(config.nodeEnv !== 'production' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  },
});

app.register(cookie);

app.register(authRoutes);

app.get('/health', async () => ({ status: 'ok', service: 'auth-service' }));

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
  await closeAllPools();
  process.exit(0);
};

process.on('SIGTERM', stop);
process.on('SIGINT', stop);

start();
