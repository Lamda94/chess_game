import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { AccessTokenClaims } from '@gambito/shared';
import { ACCESS_COOKIE } from '../auth/session.js';
import { verifyAccessToken } from '../auth/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Claims del token de acceso, o `null` si la petición es anónima. */
    auth: AccessTokenClaims | null;
  }
  interface FastifyInstance {
    /** Pre-handler que corta con 401 si no hay sesión. */
    requireAuth: (request: FastifyRequest) => Promise<void>;
    /** Igual que `requireAuth`, pero además exige haber elegido nombre de jugador. */
    requirePlayer: (request: FastifyRequest) => Promise<void>;
  }
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[ACCESS_COOKIE];
    request.auth = token ? await verifyAccessToken(token) : null;
  });

  app.decorate('requireAuth', async (request: FastifyRequest) => {
    if (!request.auth) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Necesitás iniciar sesión.');
    }
  });

  app.decorate('requirePlayer', async (request: FastifyRequest) => {
    if (!request.auth) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Necesitás iniciar sesión.');
    }
    if (!request.auth.username) {
      throw new HttpError(409, 'USERNAME_REQUIRED', 'Todavía no elegiste tu nombre de jugador.');
    }
  });
};

export const authenticatePlugin = fp(plugin, { name: 'authenticate' });
export { HttpError };
