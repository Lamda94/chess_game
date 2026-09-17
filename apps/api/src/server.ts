import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { fastifyOauth2 } from '@fastify/oauth2';
import { ZodError } from 'zod';
import { env, isProd } from './env.js';
import { authenticatePlugin, HttpError } from './plugins/authenticate.js';
import { authRoutes } from './auth/routes.js';
import { gameRoutes } from './routes/games.js';
import { profileRoutes } from './routes/profile.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd
      ? { level: 'info' }
      : { level: 'debug', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } },
    trustProxy: isProd,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(rateLimit, { max: env.RATE_LIMIT_GLOBAL_MAX, timeWindow: '1 minute' });
  await app.register(authenticatePlugin);

  if (env.googleEnabled) {
    await app.register(fastifyOauth2, {
      name: 'oauth2Google',
      scope: ['openid', 'email', 'profile'],
      credentials: {
        client: { id: env.GOOGLE_CLIENT_ID!, secret: env.GOOGLE_CLIENT_SECRET! },
        auth: fastifyOauth2.GOOGLE_CONFIGURATION,
      },
      startRedirectPath: '/auth/google',
      callbackUri: `http://${env.HOST === '0.0.0.0' ? 'localhost' : env.HOST}:${env.PORT}/auth/google/callback`,
      // PKCE protege el intercambio del código aunque alguien logre interceptarlo.
      pkce: 'S256',
    });
  } else {
    app.log.warn('GOOGLE_CLIENT_ID/SECRET sin definir: el acceso con Google queda deshabilitado.');
  }

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION',
          message: 'Revisá los datos enviados.',
          fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code ?? 'REQUEST', message: error.message } });
    }
    request.log.error({ err: error }, 'error no manejado');
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Error interno.' } });
  });

  app.get('/health', async () => ({ ok: true, at: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(gameRoutes);
  await app.register(profileRoutes);

  return app;
}
