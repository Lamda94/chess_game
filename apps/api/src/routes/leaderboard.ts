import type { FastifyPluginAsync } from 'fastify';
import { CATEGORIES, PROVISIONAL_GAMES, type Category } from '@gambito/shared';
import { prisma } from '../db.js';
import { redis } from '../redis.js';

/** Cuántos puestos entran en la tabla pública. */
const TOP = 100;
const PAGINA = 25;
/** La tabla cambia poco de un segundo al otro; medio minuto de caché alcanza. */
const CACHE_SEGUNDOS = 30;

interface Fila {
  posicion: number;
  username: string;
  avatarUrl: string | null;
  country: string | null;
  rating: number;
  peak: number;
  gamesPlayed: number;
  provisional: boolean;
}

function clave(category: Category): string {
  return `lb:${category}`;
}

/**
 * Sólo entran a la tabla las cuentas con el rating calibrado. Sin ese filtro, el
 * primer puesto lo ocuparía cualquiera que ganó su primera partida con un rating
 * que el sistema todavía no considera confiable.
 */
async function calcular(category: Category): Promise<Fila[]> {
  const filas = await prisma.rating.findMany({
    where: { category, gamesPlayed: { gte: PROVISIONAL_GAMES }, user: { username: { not: null } } },
    orderBy: [{ rating: 'desc' }, { gamesPlayed: 'desc' }],
    take: TOP,
    select: {
      rating: true,
      peak: true,
      gamesPlayed: true,
      user: { select: { username: true, avatarUrl: true, country: true } },
    },
  });

  return filas.map((fila, indice) => ({
    posicion: indice + 1,
    username: fila.user.username!,
    avatarUrl: fila.user.avatarUrl,
    country: fila.user.country,
    rating: fila.rating,
    peak: fila.peak,
    gamesPlayed: fila.gamesPlayed,
    provisional: false,
  }));
}

async function tabla(category: Category): Promise<Fila[]> {
  const guardado = await redis.get(clave(category));
  if (guardado) return JSON.parse(guardado) as Fila[];

  const filas = await calcular(category);
  await redis.set(clave(category), JSON.stringify(filas), 'EX', CACHE_SEGUNDOS);
  return filas;
}

/** Posición de un jugador concreto, aunque esté fuera del top. */
async function posicionDe(userId: string, category: Category): Promise<Fila | null> {
  const propio = await prisma.rating.findUnique({
    where: { userId_category: { userId, category } },
    select: {
      rating: true,
      peak: true,
      gamesPlayed: true,
      user: { select: { username: true, avatarUrl: true, country: true } },
    },
  });
  if (!propio || !propio.user.username) return null;

  const provisional = propio.gamesPlayed < PROVISIONAL_GAMES;
  // Contar cuántos lo superan es una sola consulta, contra traerse la tabla entera.
  const mejores = provisional
    ? 0
    : await prisma.rating.count({
        where: {
          category,
          gamesPlayed: { gte: PROVISIONAL_GAMES },
          user: { username: { not: null } },
          rating: { gt: propio.rating },
        },
      });

  return {
    posicion: provisional ? 0 : mejores + 1,
    username: propio.user.username,
    avatarUrl: propio.user.avatarUrl,
    country: propio.user.country,
    rating: propio.rating,
    peak: propio.peak,
    gamesPlayed: propio.gamesPlayed,
    provisional,
  };
}

export const leaderboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/leaderboard', async (request) => {
    const { category, page, q } = request.query as {
      category?: string;
      page?: string;
      q?: string;
    };
    const modalidad = (CATEGORIES as readonly string[]).includes(category ?? '')
      ? (category as Category)
      : 'BLITZ';

    const completa = await tabla(modalidad);

    // El buscador filtra sobre el top ya cacheado y, si no encuentra, va a la base:
    // así buscar a alguien del puesto 5.000 también funciona.
    if (q && q.trim().length > 0) {
      const termino = q.trim().toLowerCase();
      const enTop = completa.filter((fila) => fila.username.toLowerCase().includes(termino));
      if (enTop.length > 0) {
        return { category: modalidad, filas: enTop, total: enTop.length, pagina: 0, busqueda: q };
      }

      const usuario = await prisma.user.findFirst({
        where: { usernameLower: { contains: termino } },
        select: { id: true },
      });
      const fila = usuario ? await posicionDe(usuario.id, modalidad) : null;
      return {
        category: modalidad,
        filas: fila ? [fila] : [],
        total: fila ? 1 : 0,
        pagina: 0,
        busqueda: q,
      };
    }

    const numeroPagina = Math.max(0, Number(page) || 0);
    const desde = numeroPagina * PAGINA;
    return {
      category: modalidad,
      filas: completa.slice(desde, desde + PAGINA),
      total: completa.length,
      pagina: numeroPagina,
      paginas: Math.ceil(completa.length / PAGINA),
      busqueda: null,
    };
  });

  /** Dónde está el jugador conectado, para fijarlo al pie de la tabla. */
  app.get('/leaderboard/me', {
    onRequest: [app.requirePlayer],
    handler: async (request) => {
      const { category } = request.query as { category?: string };
      const modalidad = (CATEGORIES as readonly string[]).includes(category ?? '')
        ? (category as Category)
        : 'BLITZ';
      return { category: modalidad, fila: await posicionDe(request.auth!.sub, modalidad) };
    },
  });
};

/** Invalida la caché de una modalidad: se llama al cerrar una partida clasificatoria. */
export async function invalidarTabla(category: Category): Promise<void> {
  await redis.del(clave(category));
}
