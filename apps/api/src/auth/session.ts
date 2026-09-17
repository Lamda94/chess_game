import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionUser } from '@gambito/shared';
import { prisma } from '../db.js';
import { isProd } from '../env.js';
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from './tokens.js';

export const ACCESS_COOKIE = 'gb_at';
export const REFRESH_COOKIE = 'gb_rt';

/**
 * Ambos tokens viajan en cookies httpOnly: el navegador nunca ve el JWT, así que
 * un XSS no puede robarlo. `SameSite=Lax` bloquea los POST cross-site, que es la
 * defensa de CSRF para este esquema; el CORS además restringe el origen.
 */
function cookieBase(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

export interface DbUser {
  id: string;
  username: string | null;
  email: string;
  avatarUrl: string | null;
  country: string | null;
  role: SessionUser['role'];
}

export function toSessionUser(user: DbUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    country: user.country,
    role: user.role,
    needsUsername: user.username === null,
  };
}

/** Emite un par nuevo de tokens y los deja en las cookies de la respuesta. */
export async function issueSession(reply: FastifyReply, user: DbUser): Promise<void> {
  const access = await signAccessToken({ sub: user.id, username: user.username, role: user.role });
  const refresh = createRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refresh.hash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
    },
  });

  reply.setCookie(ACCESS_COOKIE, access, cookieBase(ACCESS_TOKEN_TTL_SEC));
  reply.setCookie(REFRESH_COOKIE, refresh.token, cookieBase(REFRESH_TOKEN_TTL_SEC));
}

/**
 * Rota el refresh: invalida el viejo y emite uno nuevo. Si llega un token ya
 * revocado asumimos que fue robado y cerramos todas las sesiones del usuario.
 */
export async function rotateSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<DbUser | null> {
  const presented = request.cookies[REFRESH_COOKIE];
  if (!presented) return null;

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(presented) },
    include: { user: true },
  });
  if (!stored) return null;

  if (stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    if (stored.revokedAt) {
      request.log.warn({ userId: stored.userId }, 'refresh token reutilizado; cierro sesiones');
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearSession(reply);
    return null;
  }

  const user = stored.user;
  const next = createRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: next.hash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
      },
    }),
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
  ]);

  const access = await signAccessToken({ sub: user.id, username: user.username, role: user.role });
  reply.setCookie(ACCESS_COOKIE, access, cookieBase(ACCESS_TOKEN_TTL_SEC));
  reply.setCookie(REFRESH_COOKIE, next.token, cookieBase(REFRESH_TOKEN_TTL_SEC));
  return user;
}

export async function revokeSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const presented = request.cookies[REFRESH_COOKIE];
  if (presented) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(presented), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  clearSession(reply);
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}
