import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { prisma } from '../db.js';
import { closeRedis } from '../redis.js';
import { signAccessToken } from '../auth/tokens.js';
import { ACCESS_COOKIE } from '../auth/session.js';
import type { Role } from '@gambito/shared';

const SUFIJO = Math.random().toString(36).slice(2, 8);
let app: FastifyInstance;
const creados: string[] = [];

async function crearCuenta(nombre: string, role: Role = 'PLAYER'): Promise<string> {
  const username = `${nombre}_${SUFIJO}`;
  const user = await prisma.user.create({
    data: {
      username,
      usernameLower: username.toLowerCase(),
      email: `${username}@moderacion.test`,
      role,
    },
    select: { id: true },
  });
  creados.push(user.id);
  return username;
}

/** Cookie de sesión lista para `inject`, sin pasar por el login. */
async function comoUsuario(username: string): Promise<Record<string, string>> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { usernameLower: username.toLowerCase() },
    select: { id: true, username: true, role: true },
  });
  const token = await signAccessToken({ sub: user.id, username: user.username, role: user.role });
  return { [ACCESS_COOKIE]: token };
}

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: creados } } });
  await app.close();
  await closeRedis();
});

describe('moderación', () => {
  it('un jugador común no puede ver el panel', async () => {
    const jugador = await crearCuenta('raso');
    const respuesta = await app.inject({
      method: 'GET',
      url: '/admin/users',
      cookies: await comoUsuario(jugador),
    });
    expect(respuesta.statusCode).toBe(403);
    expect(respuesta.json().error.code).toBe('NOT_MODERATOR');
  });

  it('sin sesión tampoco', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(respuesta.statusCode).toBe(401);
  });

  it('un moderador suspende una cuenta y le corta las sesiones abiertas', async () => {
    const moderador = await crearCuenta('mod', 'MODERATOR');
    const tramposo = await crearCuenta('tramposo');

    // Una sesión viva antes de la suspensión: tiene que quedar revocada.
    const objetivo = await prisma.user.findUniqueOrThrow({
      where: { usernameLower: tramposo.toLowerCase() },
      select: { id: true },
    });
    await prisma.refreshToken.create({
      data: {
        userId: objetivo.id,
        tokenHash: `hash_${SUFIJO}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const suspension = await app.inject({
      method: 'POST',
      url: `/admin/users/${tramposo}/suspend`,
      cookies: await comoUsuario(moderador),
      payload: { motivo: 'Uso de motor en partidas clasificatorias' },
    });
    expect(suspension.statusCode).toBe(200);

    const cuenta = await prisma.user.findUniqueOrThrow({
      where: { id: objetivo.id },
      select: { suspendedAt: true, suspendedFor: true },
    });
    expect(cuenta.suspendedAt).not.toBeNull();
    expect(cuenta.suspendedFor).toContain('motor');

    const vivos = await prisma.refreshToken.count({
      where: { userId: objetivo.id, revokedAt: null },
    });
    expect(vivos).toBe(0);
  });

  it('una cuenta suspendida no puede volver a entrar', async () => {
    const moderador = await crearCuenta('mod2', 'MODERATOR');
    const username = `caido_${SUFIJO}`;
    const { hashPassword } = await import('../auth/password.js');
    const user = await prisma.user.create({
      data: {
        username,
        usernameLower: username.toLowerCase(),
        email: `${username}@moderacion.test`,
        passwordHash: await hashPassword('Contrasena123'),
      },
      select: { id: true },
    });
    creados.push(user.id);

    // Antes de la suspensión entra sin problema.
    const antes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: username, password: 'Contrasena123' },
    });
    expect(antes.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: `/admin/users/${username}/suspend`,
      cookies: await comoUsuario(moderador),
      payload: { motivo: 'Insultos reiterados en el chat' },
    });

    const despues = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: username, password: 'Contrasena123' },
    });
    expect(despues.statusCode).toBe(403);
    expect(despues.json().error.code).toBe('ACCOUNT_SUSPENDED');
    expect(despues.json().error.message).toContain('Insultos');

    // Y al levantarla vuelve a entrar.
    await app.inject({
      method: 'POST',
      url: `/admin/users/${username}/unsuspend`,
      cookies: await comoUsuario(moderador),
      payload: {},
    });
    const reintegrado = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: username, password: 'Contrasena123' },
    });
    expect(reintegrado.statusCode).toBe(200);
  });

  it('a un administrador no se lo puede suspender', async () => {
    const moderador = await crearCuenta('mod3', 'MODERATOR');
    const jefe = await crearCuenta('jefe', 'ADMIN');

    const respuesta = await app.inject({
      method: 'POST',
      url: `/admin/users/${jefe}/suspend`,
      cookies: await comoUsuario(moderador),
      payload: { motivo: 'Prueba de límite' },
    });
    expect(respuesta.statusCode).toBe(403);
    expect(respuesta.json().error.code).toBe('CANNOT_SUSPEND_ADMIN');
  });

  it('el buscador filtra por nombre', async () => {
    const moderador = await crearCuenta('mod4', 'MODERATOR');
    await crearCuenta('buscable');

    const respuesta = await app.inject({
      method: 'GET',
      url: `/admin/users?q=buscable_${SUFIJO}`,
      cookies: await comoUsuario(moderador),
    });
    expect(respuesta.statusCode).toBe(200);
    const usuarios = respuesta.json().usuarios as Array<{ username: string; partidas: number }>;
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0]!.username).toBe(`buscable_${SUFIJO}`);
    expect(usuarios[0]!.partidas).toBe(0);
  });
});
