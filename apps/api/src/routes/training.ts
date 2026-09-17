import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  LECCIONES,
  PUZZLES,
  RUTAS,
  RUTA_INFO,
  conservaElMate,
  leccionPorSlug,
  puzzlesParaRating,
} from '@gambito/chess-core';
import { prisma } from '../db.js';
import { HttpError } from '../plugins/authenticate.js';
import { evaluarLogros } from '../training/logros.js';

/** Cuánto se mueve el rating de puzzles por acierto o por fallo. */
const K_PUZZLE = 24;

const completarSchema = z.object({ slug: z.string().min(1) });

const intentoSchema = z.object({
  puzzleId: z.string().min(1),
  /** Jugada propuesta, en UCI. */
  uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
  msTaken: z.number().int().min(0).max(600_000),
  /** Cuántas jugadas propias faltan para el mate en este punto del puzzle. */
  restantes: z.number().int().min(1).max(4),
  /** Posición en la que se jugó: puede ser posterior al FEN inicial en un mate en dos. */
  fen: z.string().min(10),
});

export const trainingRoutes: FastifyPluginAsync = async (app) => {
  /* ---------------------------------------------------------------- */
  /* Lecciones                                                         */
  /* ---------------------------------------------------------------- */

  app.get('/training/paths', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const completadas = await prisma.lessonProgress.findMany({
        where: { userId: request.auth!.sub },
        select: { lessonSlug: true, completedAt: true },
      });
      const hechas = new Set(completadas.map((c) => c.lessonSlug));

      const rutas = RUTAS.map((ruta) => {
        const lecciones = LECCIONES.filter((l) => l.ruta === ruta);
        return {
          id: ruta,
          ...RUTA_INFO[ruta],
          lecciones: lecciones.map((leccion) => ({
            slug: leccion.slug,
            titulo: leccion.titulo,
            resumen: leccion.resumen,
            pasos: leccion.pasos.length,
            completada: hechas.has(leccion.slug),
          })),
          completadas: lecciones.filter((l) => hechas.has(l.slug)).length,
          total: lecciones.length,
        };
      }).sort((a, b) => a.orden - b.orden);

      return {
        rutas,
        progreso: {
          completadas: hechas.size,
          total: LECCIONES.length,
          porcentaje: Math.round((hechas.size / LECCIONES.length) * 100),
        },
      };
    },
  });

  app.get('/training/lessons/:slug', async (request) => {
    const { slug } = request.params as { slug: string };
    const leccion = leccionPorSlug(slug);
    if (!leccion) throw new HttpError(404, 'LESSON_NOT_FOUND', 'No existe esa lección.');
    return { leccion };
  });

  app.post('/training/lessons/complete', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { slug } = completarSchema.parse(request.body);
      if (!leccionPorSlug(slug)) {
        throw new HttpError(404, 'LESSON_NOT_FOUND', 'No existe esa lección.');
      }
      await prisma.lessonProgress.upsert({
        where: { userId_lessonSlug: { userId: request.auth!.sub, lessonSlug: slug } },
        create: { userId: request.auth!.sub, lessonSlug: slug },
        update: {},
      });
      const logros = await evaluarLogros(request.auth!.sub);
      return { ok: true, logrosNuevos: logros };
    },
  });

  /* ---------------------------------------------------------------- */
  /* Puzzles                                                           */
  /* ---------------------------------------------------------------- */

  app.get('/training/puzzles/next', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const stats = await statsDe(request.auth!.sub);

      // No se repite un puzzle resuelto mientras quede alguno sin resolver.
      const resueltos = await prisma.puzzleAttempt.findMany({
        where: { userId: request.auth!.sub, solved: true },
        select: { puzzleId: true },
        distinct: ['puzzleId'],
      });
      const hechos = new Set(resueltos.map((r) => r.puzzleId));

      const candidatos = puzzlesParaRating(stats.rating, PUZZLES.length);
      const puzzle = candidatos.find((p) => !hechos.has(p.id)) ?? candidatos[0]!;

      // La solución no viaja al cliente: se valida acá.
      const { pista: _pista, ...sinPista } = puzzle;
      return { puzzle: { ...sinPista, pista: puzzle.pista }, stats };
    },
  });

  app.post('/training/puzzles/attempt', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const intento = intentoSchema.parse(request.body);
      const puzzle = PUZZLES.find((p) => p.id === intento.puzzleId);
      if (!puzzle) throw new HttpError(404, 'PUZZLE_NOT_FOUND', 'No existe ese puzzle.');

      // El servidor decide si la jugada sirve, con las mismas reglas del juego.
      // Cualquier jugada que conserve el mate forzado vale: no hay una única
      // respuesta correcta y sería injusto exigir una en particular.
      const correcta = conservaElMate(intento.fen, intento.uci, intento.restantes);
      const completa = correcta && intento.restantes === 1;

      // Sólo cuenta para el rating el intento que cierra el puzzle o lo falla.
      if (completa || !correcta) {
        await prisma.puzzleAttempt.create({
          data: {
            userId: request.auth!.sub,
            puzzleId: puzzle.id,
            solved: completa,
            msTaken: intento.msTaken,
          },
        });

        const stats = await statsDe(request.auth!.sub);
        const esperado = 1 / (1 + Math.pow(10, (puzzle.rating - stats.rating) / 400));
        const nuevoRating = Math.round(stats.rating + K_PUZZLE * ((completa ? 1 : 0) - esperado));
        const racha = completa ? stats.streak + 1 : 0;

        await prisma.puzzleStats.upsert({
          where: { userId: request.auth!.sub },
          create: {
            userId: request.auth!.sub,
            rating: nuevoRating,
            solved: completa ? 1 : 0,
            failed: completa ? 0 : 1,
            streak: racha,
            bestStreak: racha,
          },
          update: {
            rating: nuevoRating,
            solved: { increment: completa ? 1 : 0 },
            failed: { increment: completa ? 0 : 1 },
            streak: racha,
            bestStreak: Math.max(stats.bestStreak, racha),
          },
        });
      }

      const logros = completa ? await evaluarLogros(request.auth!.sub) : [];

      return {
        correcta,
        completa,
        stats: await statsDe(request.auth!.sub),
        logrosNuevos: logros,
      };
    },
  });

  /* ---------------------------------------------------------------- */
  /* Logros y rachas                                                   */
  /* ---------------------------------------------------------------- */

  app.get('/training/achievements', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { catalogoDeLogros } = await import('../training/logros.js');
      const obtenidos = await prisma.userAchievement.findMany({
        where: { userId: request.auth!.sub },
        select: { code: true, unlockedAt: true },
      });
      const mapa = new Map(obtenidos.map((o) => [o.code, o.unlockedAt]));
      return {
        logros: catalogoDeLogros().map((logro) => ({
          ...logro,
          obtenido: mapa.has(logro.code),
          unlockedAt: mapa.get(logro.code) ?? null,
        })),
      };
    },
  });
};

async function statsDe(userId: string) {
  const fila = await prisma.puzzleStats.findUnique({ where: { userId } });
  return (
    fila ?? {
      userId,
      rating: 1200,
      solved: 0,
      failed: 0,
      streak: 0,
      bestStreak: 0,
      updatedAt: new Date(),
    }
  );
}
