import { redis } from '../redis.js';
import { ACCESS_TOKEN_TTL_SEC } from './tokens.js';

/**
 * Lista de cuentas suspendidas, en Redis.
 *
 * Suspender revoca los refresh y bloquea el socket, pero el token de acceso ya
 * emitido sigue siendo válido hasta quince minutos: sin esto, una cuenta recién
 * suspendida seguiría navegando ese rato. La marca sólo necesita durar lo que
 * dura el token más largo — pasado eso, la cuenta tiene que volver a entrar y
 * ahí la frena la consulta a la base.
 */

const clave = (userId: string): string => `suspended:${userId}`;

export async function marcarSuspendido(userId: string): Promise<void> {
  await redis.set(clave(userId), '1', 'EX', ACCESS_TOKEN_TTL_SEC);
}

export async function levantarSuspension(userId: string): Promise<void> {
  await redis.del(clave(userId));
}

export async function estaSuspendido(userId: string): Promise<boolean> {
  return (await redis.exists(clave(userId))) === 1;
}
