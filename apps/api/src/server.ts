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
import { leaderboardRoutes } from './routes/leaderboard.js';
import { trainingRoutes } from './routes/training.js';
import { tournamentRoutes } from './routes/tournaments.js';
import { socialRoutes } from './routes/social.js';
import { moderationRoutes } from './routes/moderation.js';

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
      /**
       * La vuelta de Google entra por el origen del front, no por el de la API.
       * En desarrollo lo reenvía el proxy de Vite y en producción el de Caddy;
       * en los dos casos se le quita el prefijo /api. Apuntar directo al puerto
       * de la API —como estaba— funcionaba en local por casualidad y dejaba el
       * acceso con Google roto en cuanto se desplegaba detrás de un dominio.
       */
      callbackUri: `${env.WEB_ORIGIN}/api/auth/google/callback`,
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
  await app.register(leaderboardRoutes);
  await app.register(trainingRoutes);
  await app.register(tournamentRoutes);
  await app.register(socialRoutes);
  await app.register(moderationRoutes);

  return app;
}
