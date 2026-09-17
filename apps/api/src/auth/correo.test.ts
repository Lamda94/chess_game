import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { prisma } from '../db.js';
import { closeRedis } from '../redis.js';
import { env } from '../env.js';
import { hashPassword } from './password.js';
import { hashOpaqueToken } from './tokens.js';

const SUFIJO = Math.random().toString(36).slice(2, 8);
const CLAVE = 'contrasenaoriginal';
let app: FastifyInstance;
const creados: string[] = [];

/**
 * Sin `SMTP_URL` el mailer escribe cada mensaje como una línea JSON. Las pruebas
 * leen ese archivo, que es exactamente lo que recibiría la persona: así se
 * verifica el enlace de verdad y no una versión de laboratorio.
 */
function ultimoCorreo(para: string): { asunto: string; texto: string } | null {
  let crudo: string;
  try {
    crudo = readFileSync(env.MAIL_OUTBOX, 'utf8');
  } catch {
    return null;
  }
  const mensajes = crudo
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { para: string; asunto: string; texto: string })
    .filter((m) => m.para === para);
  return mensajes.at(-1) ?? null;
}

function enlaceDe(texto: string): string {
  const url = /https?:\/\/\S+/.exec(texto)?.[0];
  if (!url) throw new Error('El correo no trae enlace');
  return new URL(url).searchParams.get('token')!;
}

async function registrar(nombre: string): Promise<{ username: string; email: string }> {
  const username = `${nombre}_${SUFIJO}`;
  const email = `${username}@correo.test`;
  const respuesta = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, email, password: CLAVE, acceptedTerms: true },
  });
  expect(respuesta.statusCode).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  creados.push(user.id);
  return { username, email };
}

beforeAll(async () => {
  rmSync(env.MAIL_OUTBOX, { force: true });
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: creados } } });
  await app.close();
  await closeRedis();
});

describe('verificación de correo', () => {
  it('el alta manda el correo y el enlace verifica la cuenta', async () => {
    const { email } = await registrar('ver');

    const correo = ultimoCorreo(email);
    expect(correo?.asunto).toContain('Confirmá tu correo');

    const antes = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(antes.emailVerified).toBe(false);

    const respuesta = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: enlaceDe(correo!.texto) },
    });
    expect(respuesta.statusCode).toBe(200);

    const despues = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(despues.emailVerified).toBe(true);
  });

  it('el mismo enlace no sirve dos veces', async () => {
    const { email } = await registrar('ver2');
    const token = enlaceDe(ultimoCorreo(email)!.texto);

    const primera = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } });
    expect(primera.statusCode).toBe(200);

    const segunda = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } });
    expect(segunda.statusCode).toBe(400);
    expect(segunda.json().error.code).toBe('BAD_TOKEN');
  });

  it('un enlace vencido se rechaza', async () => {
    const { email } = await registrar('ver3');
    const token = enlaceDe(ultimoCorreo(email)!.texto);

    await prisma.authToken.update({
      where: { tokenHash: hashOpaqueToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const respuesta = await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } });
    expect(respuesta.statusCode).toBe(400);
  });

  it('pedir uno nuevo anula el anterior', async () => {
    const { email } = await registrar('ver4');
    const viejo = enlaceDe(ultimoCorreo(email)!.texto);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: email, password: CLAVE },
    });
    const cookies = Object.fromEntries(
      login.cookies.map((c) => [c.name, c.value] as const),
    ) as Record<string, string>;

    await app.inject({ method: 'POST', url: '/auth/verify-email/send', cookies });
    const nuevo = enlaceDe(ultimoCorreo(email)!.texto);
    expect(nuevo).not.toBe(viejo);

    const conViejo = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: viejo },
    });
    expect(conViejo.statusCode).toBe(400);

    const conNuevo = await app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      payload: { token: nuevo },
    });
    expect(conNuevo.statusCode).toBe(200);
  });
});

describe('recuperación de contraseña', () => {
  it('el enlace deja poner una contraseña nueva, y la vieja deja de servir', async () => {
    const { email } = await registrar('rec');

    const pedido = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email },
    });
    expect(pedido.statusCode).toBe(200);

    const correo = ultimoCorreo(email);
    expect(correo?.asunto).toContain('Restablecer');

    const nueva = 'contrasenanueva123';
    const cambio = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: enlaceDe(correo!.texto), password: nueva },
    });
    expect(cambio.statusCode).toBe(200);
    expect(cambio.json().user.email).toBe(email);

    const conVieja = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: email, password: CLAVE },
    });
    expect(conVieja.statusCode).toBe(401);

    const conNueva = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: email, password: nueva },
    });
    expect(conNueva.statusCode).toBe(200);
  });

  it('restablecer echa las sesiones que estaban abiertas', async () => {
    const { email } = await registrar('rec2');
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });

    await app.inject({ method: 'POST', url: '/auth/login', payload: { identifier: email, password: CLAVE } });
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBeGreaterThan(0);

    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });
    await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: enlaceDe(ultimoCorreo(email)!.texto), password: 'otracontrasena123' },
    });

    // Queda sólo la sesión que abrió el propio restablecimiento.
    const vivas = await prisma.refreshToken.findMany({
      where: { userId: user.id, revokedAt: null },
      select: { createdAt: true },
    });
    expect(vivas).toHaveLength(1);
  });

  it('restablecer también da por verificado el correo', async () => {
    const { email } = await registrar('rec3');
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });
    await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: enlaceDe(ultimoCorreo(email)!.texto), password: 'otracontrasena123' },
    });
    const cuenta = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(cuenta.emailVerified).toBe(true);
  });

  it('un correo que no existe responde igual que uno que sí', async () => {
    const { email } = await registrar('rec4');

    const existe = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });
    const noExiste = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: `fantasma_${SUFIJO}@correo.test` },
    });

    expect(noExiste.statusCode).toBe(existe.statusCode);
    expect(noExiste.body).toBe(existe.body);
  });

  it('una cuenta suspendida no recibe enlace de recuperación', async () => {
    const { email } = await registrar('rec5');
    await prisma.user.update({
      where: { email },
      data: { suspendedAt: new Date(), suspendedFor: 'prueba' },
    });

    const antes = ultimoCorreo(email)?.asunto;
    const respuesta = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });

    expect(respuesta.statusCode).toBe(200);
    // No hay correo nuevo: el último sigue siendo el de la verificación del alta.
    expect(ultimoCorreo(email)?.asunto).toBe(antes);
  });

  it('una cuenta sin contraseña (sólo Google) tampoco recibe enlace', async () => {
    const username = `oauth_${SUFIJO}`;
    const email = `${username}@correo.test`;
    const user = await prisma.user.create({
      data: { username, usernameLower: username, email, emailVerified: true },
      select: { id: true },
    });
    creados.push(user.id);

    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });
    expect(ultimoCorreo(email)).toBeNull();
  });

  it('un token de verificación no sirve para restablecer la contraseña', async () => {
    const { email } = await registrar('cruce');
    const deVerificacion = enlaceDe(ultimoCorreo(email)!.texto);

    const respuesta = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: deVerificacion, password: 'contrasenaajena123' },
    });
    expect(respuesta.statusCode).toBe(400);

    // Y la contraseña original sigue siendo la buena.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identifier: email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
  });

  it('el hash guardado no permite reconstruir el token', async () => {
    const { email } = await registrar('hash');
    const token = enlaceDe(ultimoCorreo(email)!.texto);

    const fila = await prisma.authToken.findUniqueOrThrow({
      where: { tokenHash: hashOpaqueToken(token) },
      select: { tokenHash: true },
    });
    expect(fila.tokenHash).not.toContain(token);
    expect(fila.tokenHash).toHaveLength(64);
  });
});

describe('contraseña', () => {
  it('rechaza una contraseña demasiado corta al restablecer', async () => {
    const { email } = await registrar('corta');
    await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });

    const respuesta = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: enlaceDe(ultimoCorreo(email)!.texto), password: 'corta' },
    });
    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().error.code).toBe('VALIDATION');
  });

  it('hashPassword no guarda la contraseña en claro', async () => {
    const digest = await hashPassword('contrasenadeprueba');
    expect(digest).not.toContain('contrasenadeprueba');
    expect(digest.startsWith('$argon2id$')).toBe(true);
  });
});
