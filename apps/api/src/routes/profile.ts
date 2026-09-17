import type { FastifyPluginAsync } from 'fastify';
import { identifyOpening, sanMovesFromPgn } from '@gambito/chess-core';
import { CATEGORIES, PROVISIONAL_GAMES, type Category } from '@gambito/shared';
import { prisma } from '../db.js';
import { HttpError } from '../plugins/authenticate.js';

/** Cuántos días hacia atrás cubre el mapa de actividad. */
const ACTIVITY_DAYS = 126;
/** De cuántas partidas recientes se deducen las aperturas. */
const OPENING_SAMPLE = 200;

export interface RatingPoint {
  /** Fecha en formato YYYY-MM-DD. */
  date: string;
  rating: number;
}

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users/:username/profile', async (request) => {
    const { username } = request.params as { username: string };
    const { category } = request.query as { category?: string };
    const modalidad = (CATEGORIES as readonly string[]).includes(category ?? '')
      ? (category as Category)
      : 'BLITZ';

    const user = await prisma.user.findUnique({
      where: { usernameLower: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
        country: true,
        createdAt: true,
        lastSeenAt: true,
        ratings: {
          select: { category: true, rating: true, rd: true, peak: true, gamesPlayed: true },
        },
      },
    });
    if (!user || !user.username) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'No existe ese jugador.');
    }

    const desde = new Date(Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    // Una sola lectura de partidas alimenta la curva, las aperturas, el mapa de
    // actividad y el balance: ir a la base cuatro veces por lo mismo no tiene sentido.
    const partidas = await prisma.game.findMany({
      where: {
        status: 'FINISHED',
        OR: [{ whiteId: user.id }, { blackId: user.id }],
      },
      orderBy: { startedAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        category: true,
        result: true,
        termination: true,
        rated: true,
        pgn: true,
        startedAt: true,
        whiteId: true,
        whiteRatingAfter: true,
        blackRatingAfter: true,
        white: { select: { username: true } },
        black: { select: { username: true } },
      },
    });

    /* ---------------------------------------------------------------- */
    /* Balance                                                           */
    /* ---------------------------------------------------------------- */

    const balance = { total: 0, ganadas: 0, perdidas: 0, tablas: 0 };
    const porColor = {
      white: { total: 0, ganadas: 0, perdidas: 0, tablas: 0 },
      black: { total: 0, ganadas: 0, perdidas: 0, tablas: 0 },
    };

    for (const partida of partidas) {
      if (partida.category !== modalidad) continue;
      const lado = partida.whiteId === user.id ? 'white' : 'black';
      balance.total++;
      porColor[lado].total++;
      if (partida.result === 'DRAW') {
        balance.tablas++;
        porColor[lado].tablas++;
      } else if ((partida.result === 'WHITE') === (lado === 'white')) {
        balance.ganadas++;
        porColor[lado].ganadas++;
      } else {
        balance.perdidas++;
        porColor[lado].perdidas++;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Curva de rating                                                   */
    /* ---------------------------------------------------------------- */

    // Se reconstruye desde las partidas guardadas en vez de mantener una tabla
    // aparte: el dato ya está, y así no hay dos fuentes que puedan discrepar.
    const curva: RatingPoint[] = [];
    for (const partida of [...partidas].reverse()) {
      if (partida.category !== modalidad || !partida.rated) continue;
      const despues =
        partida.whiteId === user.id ? partida.whiteRatingAfter : partida.blackRatingAfter;
      if (despues === null) continue;
      curva.push({ date: partida.startedAt.toISOString().slice(0, 10), rating: despues });
    }

    /* ---------------------------------------------------------------- */
    /* Aperturas                                                         */
    /* ---------------------------------------------------------------- */

    const aperturas = new Map<string, { nombre: string; eco: string; jugadas: number; ganadas: number }>();
    for (const partida of partidas.slice(0, OPENING_SAMPLE)) {
      if (!partida.pgn) continue;
      const apertura = identifyOpening(sanMovesFromPgn(partida.pgn));
      if (!apertura) continue;
      const lado = partida.whiteId === user.id ? 'white' : 'black';
      const gano = partida.result !== 'DRAW' && (partida.result === 'WHITE') === (lado === 'white');
      const actual = aperturas.get(apertura.name) ?? {
        nombre: apertura.name,
        eco: apertura.eco,
        jugadas: 0,
        ganadas: 0,
      };
      actual.jugadas++;
      if (gano) actual.ganadas++;
      aperturas.set(apertura.name, actual);
    }

    /* ---------------------------------------------------------------- */
    /* Actividad                                                         */
    /* ---------------------------------------------------------------- */

    const actividad = new Map<string, number>();
    for (const partida of partidas) {
      if (partida.startedAt < desde) continue;
      const dia = partida.startedAt.toISOString().slice(0, 10);
      actividad.set(dia, (actividad.get(dia) ?? 0) + 1);
    }

    /* ---------------------------------------------------------------- */
    /* Respuesta                                                         */
    /* ---------------------------------------------------------------- */

    const ratings = CATEGORIES.map((c) => {
      const fila = user.ratings.find((r) => r.category === c);
      return {
        category: c,
        rating: fila?.rating ?? 1500,
        rd: fila?.rd ?? 350,
        peak: fila?.peak ?? 1500,
        gamesPlayed: fila?.gamesPlayed ?? 0,
        provisional: (fila?.gamesPlayed ?? 0) < PROVISIONAL_GAMES,
      };
    });

    return {
      user: {
        username: user.username,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        country: user.country,
        createdAt: user.createdAt,
        lastSeenAt: user.lastSeenAt,
      },
      category: modalidad,
      ratings,
      balance,
      porColor,
      curva,
      aperturas: [...aperturas.values()].sort((a, b) => b.jugadas - a.jugadas).slice(0, 6),
      actividad: [...actividad.entries()].map(([date, count]) => ({ date, count })),
      recientes: partidas.slice(0, 10).map((partida) => {
        const lado = partida.whiteId === user.id ? 'white' : 'black';
        return {
          id: partida.id,
          category: partida.category,
          rated: partida.rated,
          termination: partida.termination,
          startedAt: partida.startedAt,
          color: lado,
          rival: lado === 'white' ? partida.black.username : partida.white.username,
          resultado:
            partida.result === 'DRAW'
              ? 'draw'
              : (partida.result === 'WHITE') === (lado === 'white')
                ? 'win'
                : 'loss',
        };
      }),
    };
  });
};
