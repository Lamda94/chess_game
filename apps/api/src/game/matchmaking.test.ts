import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redis, closeRedis } from '../redis.js';
import { matchmaker } from './matchmaking.js';

/**
 * El barrido buscaba las colas con `keys('mm:*:*:*')`. En Redis el `*` del
 * patrón cruza los dos puntos, así que ese patrón también devolvía el candado
 * —`mm:BLITZ:5+0:rated:lock`—, que es un string. Hacerle `ZRANGE` contesta
 * WRONGTYPE, y como el barrido corre en segundo plano la excepción no la
 * capturaba nadie: se caía el proceso entero de la API.
 */

const COLA = 'mm:BLITZ:5+0:rated';

beforeEach(async () => {
  await redis.del(COLA, `${COLA}:joined`, `${COLA}:lock`, `mmlock:${COLA}`);
});

afterAll(async () => {
  await redis.del(COLA, `${COLA}:joined`, `${COLA}:lock`, `mmlock:${COLA}`);
  await closeRedis();
});

describe('emparejamiento', () => {
  it('el patrón de colas alcanza al candado con el nombre viejo', async () => {
    // Deja constancia de por qué el candado tuvo que mudarse de prefijo.
    await redis.set(`${COLA}:lock`, '1');
    const encontradas = await redis.keys('mm:*:*:*');
    expect(encontradas).toContain(`${COLA}:lock`);
  });

  it('el candado vive fuera del espacio de nombres de las colas', async () => {
    await redis.set(`mmlock:${COLA}`, '1');
    const encontradas = await redis.keys('mm:*:*:*');
    expect(encontradas).not.toContain(`mmlock:${COLA}`);
  });

  it('un barrido con el candado tomado no revienta', async () => {
    // Reproduce la carrera: la clave del candado existe mientras se barre.
    await redis.zadd(COLA, 1500, 'usuario-fantasma');
    await redis.set(`mmlock:${COLA}`, '1', 'PX', 5_000);

    await expect(
      (matchmaker as unknown as { sweepAll(): Promise<void> }).sweepAll(),
    ).resolves.toBeUndefined();
  });

  it('una clave de tipo equivocado no se lleva puesto el resto del barrido', async () => {
    // Un string donde debería haber un sorted set: antes era una excepción sin
    // capturar; ahora se registra y el barrido sigue.
    await redis.set('mm:BLITZ:9+9:rated', 'basura');
    try {
      await expect(
        (matchmaker as unknown as { sweepAll(): Promise<void> }).sweepAll(),
      ).resolves.toBeUndefined();
    } finally {
      await redis.del('mm:BLITZ:9+9:rated');
    }
  });
});
