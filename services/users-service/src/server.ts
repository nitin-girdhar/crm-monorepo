import Fastify from 'fastify';
import { config } from './config.js';
import { usersRoutes } from './routes/users.js';
import { branchesRoutes } from './routes/branches.js';
import { closeAllPools } from '@crm/db';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    ...(config.nodeEnv !== 'production' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  },
});

app.register(usersRoutes);
app.register(branchesRoutes);

app.get('/health', async () => ({ status: 'ok', service: 'users-service' }));

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
