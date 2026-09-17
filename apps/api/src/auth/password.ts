import { hash, verify } from '@node-rs/argon2';

/**
 * Parámetros de argon2id recomendados por OWASP: 19 MiB de memoria y dos pasadas.
 * Usamos @node-rs/argon2 porque trae binarios precompilados y no necesita node-gyp.
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain, OPTIONS);
  } catch {
    // Un hash corrupto o de otro algoritmo es un fallo de verificación, no una excepción.
    return false;
  }
}
