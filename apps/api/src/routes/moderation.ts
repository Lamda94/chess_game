import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError } from '../plugins/authenticate.js';
import { levantarSuspension, marcarSuspendido } from '../auth/suspension.js';

/**
 * Moderación mínima.
 *
 * No hay cola de denuncias todavía, así que el panel no inventa una: hace lo
 * único que se puede hacer sin ella, que es buscar una cuenta y suspenderla. La
 * suspensión se aplica de verdad —al entrar y al conectar el socket— y no es
 * sólo una marca en la base.
 */

const suspenderSchema = z.object({ motivo: z.string().trim().min(3).max(200) });

/**
 * El rol viaja dentro del JWT, pero acá no alcanza con creerle: un token se
 * emite una vez y vive hasta que vence, así que quien pierde el rol conservaría
 * el panel hasta entonces. Estas rutas son pocas y de poco tráfico; se paga la
 * consulta y se pregunta por el rol vigente.
 */
async function exigirModerador(request: FastifyRequest): Promise<void> {
  if (!request.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Necesitás iniciar sesión.');

  const cuenta = await prisma.user.findUnique({
    where: { id: request.auth.sub },
    select: { role: true, suspendedAt: true },
  });
  if (!cuenta || cuenta.suspendedAt || (cuenta.role !== 'MODERATOR' && cuenta.role !== 'ADMIN')) {
    throw new HttpError(403, 'NOT_MODERATOR', 'No tenés permisos de moderación.');
  }
}

export const moderationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/admin/users', {
    onRequest: [exigirModerador],
    handler: async (request) => {
      const { q } = request.query as { q?: string };
      const termino = (q ?? '').trim().toLowerCase();

      const usuarios = await prisma.user.findMany({
        where: termino ? { usernameLower: { contains: termino } } : {},
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          country: true,
          createdAt: true,
          lastSeenAt: true,
          suspendedAt: true,
          suspendedFor: true,
          _count: { select: { gamesAsWhite: true, gamesAsBlack: true } },
        },
      });

      return {
        usuarios: usuarios.map((u) => ({
          ...u,
          partidas: u._count.gamesAsWhite + u._count.gamesAsBlack,
          _count: undefined,
        })),
      };
    },
  });

  app.post('/admin/users/:username/suspend', {
    onRequest: [exigirModerador],
    handler: async (request) => {
      const { username } = request.params as { username: string };
      const { motivo } = suspenderSchema.parse(request.body);

      const objetivo = await prisma.user.findUnique({
        where: { usernameLower: username.toLowerCase() },
        select: { id: true, role: true },
      });
      if (!objetivo) throw new HttpError(404, 'USER_NOT_FOUND', 'No existe ese jugador.');
      if (objetivo.role === 'ADMIN') {
        throw new HttpError(403, 'CANNOT_SUSPEND_ADMIN', 'No se puede suspender a un administrador.');
      }

      await prisma.user.update({
        where: { id: objetivo.id },
        data: { suspendedAt: new Date(), suspendedFor: motivo },
      });
      // Cortarle las sesiones abiertas: si no, seguiría jugando hasta que venza
      // su token de acceso.
      await prisma.refreshToken.updateMany({
        where: { userId: objetivo.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await marcarSuspendido(objetivo.id);

      request.log.warn({ moderador: request.auth!.sub, objetivo: objetivo.id, motivo }, 'cuenta suspendida');
      return { ok: true };
    },
  });

  app.post('/admin/users/:username/unsuspend', {
    onRequest: [exigirModerador],
    handler: async (request) => {
      const { username } = request.params as { username: string };
      const objetivo = await prisma.user.findUnique({
        where: { usernameLower: username.toLowerCase() },
        select: { id: true },
      });
      if (!objetivo) throw new HttpError(404, 'USER_NOT_FOUND', 'No existe ese jugador.');

      await prisma.user.update({
        where: { id: objetivo.id },
        data: { suspendedAt: null, suspendedFor: null },
      });
      await levantarSuspension(objetivo.id);
      return { ok: true };
    },
  });
};
