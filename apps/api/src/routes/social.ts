import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { categoryFor, timeControlSchema, usernameSchema, type Color } from '@gambito/shared';
import { prisma } from '../db.js';
import { HttpError } from '../plugins/authenticate.js';
import { gameEngine } from '../game/engine.js';

/** Cuánto vive un desafío sin responder. */
const VIDA_DESAFIO_MIN = 30;

const desafiarSchema = z.object({
  /** Nulo o ausente en un desafío abierto por enlace. */
  username: usernameSchema.optional(),
  timeControl: timeControlSchema,
  rated: z.boolean().default(true),
  color: z.enum(['white', 'black', 'random']).default('random'),
});

export const socialRoutes: FastifyPluginAsync = async (app) => {
  /* ---------------------------------------------------------------- */
  /* Amigos                                                            */
  /* ---------------------------------------------------------------- */

  app.get('/friends', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const userId = request.auth!.sub;
      const relaciones = await prisma.friendship.findMany({
        where: {
          OR: [{ requesterId: userId }, { addresseeId: userId }],
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        include: {
          requester: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } },
          addressee: { select: { id: true, username: true, avatarUrl: true, lastSeenAt: true } },
        },
      });

      // En línea es un dato derivado: se considera conectado a quien dio señales
      // de vida en los últimos dos minutos.
      const umbral = Date.now() - 2 * 60 * 1000;
      const mapear = (relacion: (typeof relaciones)[number]) => {
        const otro = relacion.requesterId === userId ? relacion.addressee : relacion.requester;
        return {
          id: otro.id,
          username: otro.username,
          avatarUrl: otro.avatarUrl,
          enLinea: otro.lastSeenAt.getTime() > umbral,
          desde: relacion.createdAt,
        };
      };

      return {
        amigos: relaciones.filter((r) => r.status === 'ACCEPTED').map(mapear),
        // Pedidos que me hicieron y todavía no contesté.
        pendientes: relaciones
          .filter((r) => r.status === 'PENDING' && r.addresseeId === userId)
          .map(mapear),
        // Pedidos que mandé yo.
        enviados: relaciones
          .filter((r) => r.status === 'PENDING' && r.requesterId === userId)
          .map(mapear),
      };
    },
  });

  app.post('/friends/:username', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { username } = request.params as { username: string };
      const userId = request.auth!.sub;

      const otro = await prisma.user.findUnique({
        where: { usernameLower: username.toLowerCase() },
        select: { id: true },
      });
      if (!otro) throw new HttpError(404, 'USER_NOT_FOUND', 'No existe ese jugador.');
      if (otro.id === userId) {
        throw new HttpError(400, 'SELF_FRIEND', 'No te podés agregar a vos mismo.');
      }

      // Si el otro ya me había pedido amistad, esto la acepta en vez de crear un
      // segundo pedido en sentido contrario.
      const inverso = await prisma.friendship.findUnique({
        where: { requesterId_addresseeId: { requesterId: otro.id, addresseeId: userId } },
      });
      if (inverso) {
        await prisma.friendship.update({
          where: { id: inverso.id },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
        });
        return { estado: 'ACCEPTED' };
      }

      const relacion = await prisma.friendship.upsert({
        where: { requesterId_addresseeId: { requesterId: userId, addresseeId: otro.id } },
        create: { requesterId: userId, addresseeId: otro.id },
        update: {},
      });
      return { estado: relacion.status };
    },
  });

  app.post('/friends/:username/accept', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { username } = request.params as { username: string };
      const otro = await prisma.user.findUnique({
        where: { usernameLower: username.toLowerCase() },
        select: { id: true },
      });
      if (!otro) throw new HttpError(404, 'USER_NOT_FOUND', 'No existe ese jugador.');

      const actualizadas = await prisma.friendship.updateMany({
        where: { requesterId: otro.id, addresseeId: request.auth!.sub, status: 'PENDING' },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
      if (actualizadas.count === 0) {
        throw new HttpError(404, 'NO_REQUEST', 'No hay ningún pedido de esa persona.');
      }
      return { ok: true };
    },
  });

  app.delete('/friends/:username', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { username } = request.params as { username: string };
      const userId = request.auth!.sub;
      const otro = await prisma.user.findUnique({
        where: { usernameLower: username.toLowerCase() },
        select: { id: true },
      });
      if (!otro) throw new HttpError(404, 'USER_NOT_FOUND', 'No existe ese jugador.');

      await prisma.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: userId, addresseeId: otro.id },
            { requesterId: otro.id, addresseeId: userId },
          ],
        },
      });
      return { ok: true };
    },
  });

  /* ---------------------------------------------------------------- */
  /* Desafíos                                                          */
  /* ---------------------------------------------------------------- */

  app.post('/challenges', {
    onRequest: [app.requirePlayer],
    handler: async (request, reply) => {
      const datos = desafiarSchema.parse(request.body);
      const userId = request.auth!.sub;

      let toId: string | null = null;
      if (datos.username) {
        const otro = await prisma.user.findUnique({
          where: { usernameLower: datos.username.toLowerCase() },
          select: { id: true },
        });
        if (!otro) throw new HttpError(404, 'USER_NOT_FOUND', 'No existe ese jugador.');
        if (otro.id === userId) {
          throw new HttpError(400, 'SELF_CHALLENGE', 'No podés desafiarte a vos mismo.');
        }
        toId = otro.id;
      }

      const desafio = await prisma.challenge.create({
        data: {
          fromId: userId,
          toId,
          initialSec: datos.timeControl.initialSec,
          incrementSec: datos.timeControl.incrementSec,
          rated: datos.rated,
          color: datos.color === 'random' ? null : datos.color,
          expiresAt: new Date(Date.now() + VIDA_DESAFIO_MIN * 60 * 1000),
        },
      });
      return reply.code(201).send({ desafio });
    },
  });

  app.get('/challenges', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const userId = request.auth!.sub;
      const ahora = new Date();
      const desafios = await prisma.challenge.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { gt: ahora },
          OR: [{ toId: userId }, { fromId: userId }],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          from: { select: { username: true, avatarUrl: true } },
          to: { select: { username: true } },
        },
      });
      return {
        recibidos: desafios.filter((d) => d.toId === userId),
        enviados: desafios.filter((d) => d.fromId === userId),
      };
    },
  });

  app.get('/challenges/:id', async (request) => {
    const { id } = request.params as { id: string };
    const desafio = await prisma.challenge.findUnique({
      where: { id },
      include: { from: { select: { username: true, avatarUrl: true } } },
    });
    if (!desafio) throw new HttpError(404, 'CHALLENGE_NOT_FOUND', 'Ese desafío no existe.');
    return { desafio };
  });

  app.post('/challenges/:id/accept', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const userId = request.auth!.sub;

      const desafio = await prisma.challenge.findUnique({ where: { id } });
      if (!desafio) throw new HttpError(404, 'CHALLENGE_NOT_FOUND', 'Ese desafío no existe.');
      if (desafio.status !== 'PENDING') {
        throw new HttpError(409, 'CHALLENGE_CLOSED', 'Ese desafío ya no está disponible.');
      }
      if (desafio.expiresAt.getTime() < Date.now()) {
        await prisma.challenge.update({ where: { id }, data: { status: 'EXPIRED' } });
        throw new HttpError(409, 'CHALLENGE_EXPIRED', 'Ese desafío venció.');
      }
      if (desafio.fromId === userId) {
        throw new HttpError(400, 'OWN_CHALLENGE', 'Es tu propio desafío.');
      }
      if (desafio.toId !== null && desafio.toId !== userId) {
        throw new HttpError(403, 'NOT_INVITED', 'Ese desafío es para otra persona.');
      }

      const timeControl = { initialSec: desafio.initialSec, incrementSec: desafio.incrementSec };
      const category = categoryFor(timeControl);

      const jugadores = await prisma.user.findMany({
        where: { id: { in: [desafio.fromId, userId] } },
        select: {
          id: true,
          username: true,
          avatarUrl: true,
          country: true,
          ratings: { where: { category }, select: { rating: true, gamesPlayed: true } },
        },
      });
      const vista = (id: string) => {
        const usuario = jugadores.find((j) => j.id === id)!;
        return {
          id: usuario.id,
          username: usuario.username ?? 'anónimo',
          rating: usuario.ratings[0]?.rating ?? 1500,
          provisional: (usuario.ratings[0]?.gamesPlayed ?? 0) < 10,
          avatarUrl: usuario.avatarUrl,
          country: usuario.country,
        };
      };

      // El color lo pide quien desafía; si no pidió nada, se sortea.
      const colorDelRetador: Color =
        desafio.color === 'white' || desafio.color === 'black'
          ? (desafio.color as Color)
          : Math.random() < 0.5
            ? 'white'
            : 'black';

      const gameId = await gameEngine.create({
        white: vista(colorDelRetador === 'white' ? desafio.fromId : userId),
        black: vista(colorDelRetador === 'white' ? userId : desafio.fromId),
        category,
        timeControl,
        rated: desafio.rated,
      });

      await prisma.challenge.update({
        where: { id },
        data: { status: 'ACCEPTED', gameId, toId: desafio.toId ?? userId },
      });

      return { gameId };
    },
  });

  app.post('/challenges/:id/decline', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const userId = request.auth!.sub;
      // Quien lo mandó lo cancela; quien lo recibió lo rechaza.
      const actualizados = await prisma.challenge.updateMany({
        where: { id, status: 'PENDING', OR: [{ toId: userId }, { fromId: userId }] },
        data: { status: 'DECLINED' },
      });
      if (actualizados.count === 0) {
        throw new HttpError(404, 'CHALLENGE_NOT_FOUND', 'Ese desafío no existe.');
      }
      return { ok: true };
    },
  });
};
