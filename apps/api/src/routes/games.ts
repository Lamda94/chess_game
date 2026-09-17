import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { gameEngine } from '../game/engine.js';
import { HttpError } from '../plugins/authenticate.js';

export const gameRoutes: FastifyPluginAsync = async (app) => {
  /** Estado completo de una partida. Sirve para entrar directo por URL. */
  app.get('/games/:id', async (request) => {
    const { id } = request.params as { id: string };
    const state = await gameEngine.stateOf(id);
    if (!state) throw new HttpError(404, 'GAME_NOT_FOUND', 'Esa partida no existe.');
    return { game: state };
  });

  /** Historial del jugador conectado, más reciente primero. */
  app.get('/games', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { take = '20', cursor } = request.query as { take?: string; cursor?: string };
      const limit = Math.min(50, Math.max(1, Number(take) || 20));
      const userId = request.auth!.sub;

      const games = await prisma.game.findMany({
        where: { OR: [{ whiteId: userId }, { blackId: userId }], status: 'FINISHED' },
        orderBy: { startedAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          category: true,
          initialSec: true,
          incrementSec: true,
          result: true,
          termination: true,
          startedAt: true,
          endedAt: true,
          white: { select: { id: true, username: true } },
          black: { select: { id: true, username: true } },
        },
      });

      const hasMore = games.length > limit;
      const page = hasMore ? games.slice(0, limit) : games;
      return { games: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
    },
  });

  /** Partidas en curso, para el panel "en vivo" del lobby. */
  app.get('/games/live', async () => {
    const games = await prisma.game.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        category: true,
        initialSec: true,
        incrementSec: true,
        startedAt: true,
        white: { select: { username: true } },
        black: { select: { username: true } },
        _count: { select: { moves: true } },
      },
    });
    return { games };
  });
};
