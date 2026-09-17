import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * Tres conexiones: una para comandos normales y dos que el adaptador de Socket.IO
 * necesita en exclusiva (una publica, la otra queda bloqueada suscrita).
 */
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const pubClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const subClient = pubClient.duplicate();

export async function closeRedis(): Promise<void> {
  await Promise.allSettled([redis.quit(), pubClient.quit(), subClient.quit()]);
}
