import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env.js';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Valida el `id_token` que devuelve Google contra sus claves públicas. No alcanza
 * con decodificarlo: sin verificar firma, emisor y audiencia cualquiera podría
 * presentar un token propio y hacerse pasar por otra cuenta.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });

  const sub = payload.sub;
  const email = payload.email as string | undefined;
  if (!sub || !email) {
    throw new Error('El id_token de Google no trae sub o email.');
  }

  return {
    sub,
    email: email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: (payload.name as string | undefined) ?? null,
    picture: (payload.picture as string | undefined) ?? null,
  };
}
