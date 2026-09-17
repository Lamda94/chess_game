import type { FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { FORMATOS, rondasNecesarias } from '@gambito/tournament';
import { CATEGORIES, categoryFor, timeControlSchema } from '@gambito/shared';
import { prisma } from '../db.js';
import { HttpError } from '../plugins/authenticate.js';
import { clasificacionDe, comenzarTorneo } from '../tournament/motor.js';

const crearSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    description: z.string().trim().max(400).optional(),
    format: z.enum(FORMATOS),
    timeControl: timeControlSchema,
    rounds: z.number().int().min(3).max(13).optional(),
    durationMin: z.number().int().min(15).max(360).optional(),
    startsAt: z.coerce.date(),
    minRating: z.number().int().min(400).max(3000).optional(),
    maxRating: z.number().int().min(400).max(3000).optional(),
    maxPlayers: z.number().int().min(2).max(512).optional(),
    isPrivate: z.boolean().default(false),
    halfPointBye: z.boolean().default(true),
  })
  .refine((v) => !v.minRating || !v.maxRating || v.minRating <= v.maxRating, {
    message: 'El rating mínimo no puede ser mayor que el máximo',
    path: ['minRating'],
  })
  .refine((v) => v.format !== 'SWISS' || v.rounds !== undefined, {
    message: 'Un torneo suizo necesita saber cuántas rondas se juegan',
    path: ['rounds'],
  })
  .refine((v) => v.format !== 'ARENA' || v.durationMin !== undefined, {
    message: 'Una arena necesita una duración',
    path: ['durationMin'],
  });

export const tournamentRoutes: FastifyPluginAsync = async (app) => {
  /* ---------------------------------------------------------------- */
  /* Listado y detalle                                                 */
  /* ---------------------------------------------------------------- */

  app.get('/tournaments', async (request) => {
    const { estado } = request.query as { estado?: string };
    const filtro =
      estado === 'finalizados'
        ? { status: { in: ['FINISHED' as const, 'CANCELLED' as const] } }
        : { status: { in: ['SCHEDULED' as const, 'RUNNING' as const] } };

    const torneos = await prisma.tournament.findMany({
      where: { ...filtro, isPrivate: false },
      orderBy: estado === 'finalizados' ? { endedAt: 'desc' } : { startsAt: 'asc' },
      take: 40,
      include: {
        createdBy: { select: { username: true } },
        _count: { select: { entries: true } },
      },
    });
    return { torneos };
  });

  app.get('/tournaments/:id', async (request) => {
    const { id } = request.params as { id: string };
    const torneo = await prisma.tournament.findUnique({
      where: { id },
      include: {
        createdBy: { select: { username: true } },
        _count: { select: { entries: true } },
      },
    });
    if (!torneo) throw new HttpError(404, 'TOURNAMENT_NOT_FOUND', 'No existe ese torneo.');

    const [clasificacion, cruces] = await Promise.all([
      clasificacionDe(id),
      prisma.tournamentPairing.findMany({
        where: { tournamentId: id },
        orderBy: [{ round: 'desc' }, { board: 'asc' }],
        include: {
          game: { select: { id: true, status: true } },
        },
      }),
    ]);

    const nombres = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: [...new Set(cruces.flatMap((c) => [c.whiteId, c.blackId, c.byeUserId].filter(Boolean) as string[]))] } },
          select: { id: true, username: true },
        })
      ).map((u) => [u.id, u.username]),
    );

    const inscripto = request.auth
      ? await prisma.tournamentEntry.findUnique({
          where: { tournamentId_userId: { tournamentId: id, userId: request.auth.sub } },
          select: { withdrawn: true, eliminated: true },
        })
      : null;

    return {
      torneo: { ...torneo, joinCode: undefined },
      clasificacion,
      rondas: agruparPorRonda(cruces, nombres),
      yo: {
        inscripto: Boolean(inscripto) && !inscripto?.withdrawn,
        eliminado: inscripto?.eliminated ?? false,
      },
    };
  });

  /* ---------------------------------------------------------------- */
  /* Creación e inscripción                                            */
  /* ---------------------------------------------------------------- */

  app.post('/tournaments', {
    onRequest: [app.requirePlayer],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (request, reply) => {
      const datos = crearSchema.parse(request.body);
      const category = categoryFor(datos.timeControl);
      if (!CATEGORIES.includes(category)) {
        throw new HttpError(400, 'BAD_TIME_CONTROL', 'Ese control de tiempo no es válido.');
      }

      const torneo = await prisma.tournament.create({
        data: {
          name: datos.name,
          description: datos.description ?? null,
          format: datos.format,
          category,
          initialSec: datos.timeControl.initialSec,
          incrementSec: datos.timeControl.incrementSec,
          // En eliminación las rondas las decide el cuadro al arrancar.
          rounds: datos.format === 'SWISS' ? (datos.rounds ?? 5) : null,
          durationMin: datos.format === 'ARENA' ? (datos.durationMin ?? 60) : null,
          startsAt: datos.startsAt,
          minRating: datos.minRating ?? null,
          maxRating: datos.maxRating ?? null,
          maxPlayers: datos.maxPlayers ?? null,
          isPrivate: datos.isPrivate,
          joinCode: datos.isPrivate ? randomBytes(4).toString('hex') : null,
          halfPointBye: datos.halfPointBye,
          createdById: request.auth!.sub,
        },
      });

      return reply.code(201).send({ torneo });
    },
  });

  app.post('/tournaments/:id/join', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const { code } = (request.body ?? {}) as { code?: string };
      const userId = request.auth!.sub;

      const torneo = await prisma.tournament.findUnique({
        where: { id },
        include: { _count: { select: { entries: true } } },
      });
      if (!torneo) throw new HttpError(404, 'TOURNAMENT_NOT_FOUND', 'No existe ese torneo.');
      if (torneo.status === 'FINISHED' || torneo.status === 'CANCELLED') {
        throw new HttpError(409, 'TOURNAMENT_OVER', 'Ese torneo ya terminó.');
      }
      // Un suizo o una eliminación no admiten entradas una vez armado el cuadro;
      // una arena sí, porque empareja por demanda.
      if (torneo.status === 'RUNNING' && torneo.format !== 'ARENA') {
        throw new HttpError(409, 'TOURNAMENT_STARTED', 'El torneo ya empezó.');
      }
      if (torneo.isPrivate && torneo.joinCode !== code) {
        throw new HttpError(403, 'BAD_CODE', 'El código de acceso no es correcto.');
      }
      if (torneo.maxPlayers && torneo._count.entries >= torneo.maxPlayers) {
        throw new HttpError(409, 'TOURNAMENT_FULL', 'No quedan lugares.');
      }

      const rating = await prisma.rating.findUnique({
        where: { userId_category: { userId, category: torneo.category } },
        select: { rating: true },
      });
      const seedRating = rating?.rating ?? 1500;

      if (torneo.minRating !== null && seedRating < torneo.minRating) {
        throw new HttpError(403, 'RATING_TOO_LOW', `Este torneo pide ${torneo.minRating} o más.`);
      }
      if (torneo.maxRating !== null && seedRating > torneo.maxRating) {
        throw new HttpError(403, 'RATING_TOO_HIGH', `Este torneo es hasta ${torneo.maxRating}.`);
      }

      await prisma.tournamentEntry.upsert({
        where: { tournamentId_userId: { tournamentId: id, userId } },
        create: { tournamentId: id, userId, seedRating },
        update: { withdrawn: false },
      });

      return { ok: true };
    },
  });

  app.post('/tournaments/:id/leave', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      // Retirarse no borra la inscripción: los resultados ya jugados siguen
      // contando para los desempates de los demás.
      await prisma.tournamentEntry.updateMany({
        where: { tournamentId: id, userId: request.auth!.sub },
        data: { withdrawn: true },
      });
      return { ok: true };
    },
  });

  /** Lo arranca quien lo creó, sin esperar a la hora prevista. */
  app.post('/tournaments/:id/start', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const torneo = await prisma.tournament.findUnique({ where: { id } });
      if (!torneo) throw new HttpError(404, 'TOURNAMENT_NOT_FOUND', 'No existe ese torneo.');
      if (torneo.createdById !== request.auth!.sub) {
        throw new HttpError(403, 'NOT_ORGANIZER', 'Sólo quien organiza puede empezarlo.');
      }
      await comenzarTorneo(id);
      return { ok: true };
    },
  });
};

interface CruceConPartida {
  round: number;
  board: number;
  whiteId: string | null;
  blackId: string | null;
  byeUserId: string | null;
  isBye: boolean;
  result: string | null;
  game: { id: string; status: string } | null;
}

function agruparPorRonda(cruces: CruceConPartida[], nombres: Map<string, string | null>) {
  const rondas = new Map<number, Array<Record<string, unknown>>>();
  for (const cruce of cruces) {
    const lista = rondas.get(cruce.round) ?? [];
    lista.push({
      board: cruce.board,
      isBye: cruce.isBye,
      white: cruce.whiteId ? { id: cruce.whiteId, username: nombres.get(cruce.whiteId) } : null,
      black: cruce.blackId ? { id: cruce.blackId, username: nombres.get(cruce.blackId) } : null,
      bye: cruce.byeUserId ? { id: cruce.byeUserId, username: nombres.get(cruce.byeUserId) } : null,
      result: cruce.result,
      gameId: cruce.game?.id ?? null,
      enJuego: cruce.game?.status === 'ACTIVE',
    });
    rondas.set(cruce.round, lista);
  }
  return [...rondas.entries()]
    .sort(([a], [b]) => b - a)
    .map(([ronda, cruces]) => ({ ronda, cruces }));
}

export { rondasNecesarias };
