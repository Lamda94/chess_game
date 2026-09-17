import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { AccessTokenClaims, Role } from '@gambito/shared';
import { env } from '../env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'gambito';

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ username: claims.username, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      username: (payload.username as string | null) ?? null,
      role: (payload.role as Role) ?? 'PLAYER',
    };
  } catch {
    return null;
  }
}

/** El refresh es opaco: un valor aleatorio del que sólo guardamos el hash. */
export function createRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
