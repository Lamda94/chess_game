import type { AuthTokenPurpose } from '@prisma/client';
import { prisma } from '../db.js';
import { createOpaqueToken, hashOpaqueToken } from './tokens.js';

/**
 * Enlaces de un solo uso que viajan por correo.
 *
 * Reglas que valen para los dos usos:
 *  - se guarda el hash, nunca el token;
 *  - al emitir uno nuevo se anulan los anteriores del mismo tipo, para que un
 *    correo viejo en la bandeja no siga sirviendo;
 *  - consumir es atómico: `updateMany` sobre `usedAt: null` sella el token y
 *    devuelve cuántas filas tocó, así dos clics simultáneos no lo usan dos veces.
 */

export const VIGENCIA_VERIFICACION_MS = 24 * 60 * 60 * 1000;
export const VIGENCIA_RECUPERACION_MS = 60 * 60 * 1000;

export async function emitirEnlace(
  userId: string,
  purpose: AuthTokenPurpose,
  vigenciaMs: number,
): Promise<string> {
  const { token, hash } = createOpaqueToken(32);

  await prisma.$transaction([
    prisma.authToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.authToken.create({
      data: {
        userId,
        purpose,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + vigenciaMs),
      },
    }),
  ]);

  return token;
}

/**
 * Sella el token y devuelve a quién pertenece, o `null` si no existe, ya se usó
 * o venció. No distingue entre esos casos a propósito: quien prueba tokens al
 * azar no aprende nada de la respuesta.
 */
export async function consumirEnlace(
  token: string,
  purpose: AuthTokenPurpose,
): Promise<string | null> {
  const hash = hashOpaqueToken(token);

  const fila = await prisma.authToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, userId: true, purpose: true, usedAt: true, expiresAt: true },
  });
  if (!fila || fila.purpose !== purpose || fila.usedAt || fila.expiresAt < new Date()) {
    return null;
  }

  const sellado = await prisma.authToken.updateMany({
    where: { id: fila.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  // Otro pedido llegó primero y se lo llevó.
  if (sellado.count === 0) return null;

  return fila.userId;
}
