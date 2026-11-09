import formbody from '@fastify/formbody';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config.ts';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';
import { ensureGenesis } from './services/anchoring.ts';
import { registerApiRoutes } from './routes/api.ts';
import { registerPageRoutes } from './routes/pages.ts';
import { errorPage } from './ui/pages.ts';

export async function buildServer(db: Db): Promise<FastifyInstance> {
  ensureGenesis(db);
  const app = Fastify({ logger: false });
  await app.register(formbody);

  // Optional API write protection. Form posts from the demo UI are left open
  // on purpose; add session auth before exposing this beyond localhost.
  if (config.adminToken) {
    app.addHook('preHandler', async (request, reply) => {
      const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
      if (!isWrite || !request.url.startsWith('/api/')) return;
      if (request.headers['x-api-key'] === config.adminToken) return;
      await reply.code(401).send({ error: 'Missing or invalid x-api-key header' });
    });
  }

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const status =
      error instanceof HttpError
        ? error.statusCode
        : typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600
          ? error.statusCode
          : 500;
    if (request.url.startsWith('/api/')) {
      void reply.code(status).send({ error: error.message });
    } else {
      void reply.code(status).type('text/html; charset=utf-8').send(errorPage(error.message));
    }
  });

  registerApiRoutes(app, db);
  registerPageRoutes(app, db);
  return app;
}
