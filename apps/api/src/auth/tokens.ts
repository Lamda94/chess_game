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

/**
 * Token opaco: un valor aleatorio del que sólo guardamos el hash, para que un
 * volcado de la tabla no sirva para robar sesiones ni para restablecer
 * contraseñas ajenas. Lo usan el refresh y los enlaces que van por correo.
 */
export function createOpaqueToken(bytes = 48): { token: string; hash: string } {
  const token = randomBytes(bytes).toString('base64url');
  return { token, hash: hashOpaqueToken(token) };
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken(): { token: string; hash: string } {
  return createOpaqueToken(48);
}

export const hashRefreshToken = hashOpaqueToken;
