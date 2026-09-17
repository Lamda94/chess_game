import { LECCIONES, RUTAS } from '@gambito/chess-core';
import { PROVISIONAL_GAMES } from '@gambito/shared';
import { prisma } from '../db.js';

/**
 * Logros.
 *
 * Se evalúan cuando pasa algo que podría desbloquear uno (terminar una lección,
 * resolver un puzzle, abrir el perfil) en vez de mantener contadores en vivo por
 * cada evento: son pocas consultas, corren fuera del camino crítico de una partida
 * y el estado siempre se deduce de los datos reales, así que no puede desincronizarse.
 */
export interface Logro {
  code: string;
  nombre: string;
  descripcion: string;
}

const CATALOGO: Logro[] = [
  { code: 'primera-partida', nombre: 'Primera partida', descripcion: 'Terminar una partida contra otra persona.' },
  { code: 'primera-victoria', nombre: 'Primera victoria', descripcion: 'Ganar una partida.' },
  { code: 'diez-partidas', nombre: 'Diez partidas', descripcion: 'Jugar diez partidas terminadas.' },
  { code: 'rating-calibrado', nombre: 'Rating calibrado', descripcion: 'Completar las diez partidas que calibran una modalidad.' },
  { code: 'racha-de-tres', nombre: 'Racha de tres', descripcion: 'Ganar tres partidas seguidas.' },
  { code: 'primer-puzzle', nombre: 'Primer puzzle', descripcion: 'Resolver un puzzle de táctica.' },
  { code: 'racha-de-cinco-puzzles', nombre: 'Ojo táctico', descripcion: 'Resolver cinco puzzles seguidos sin fallar.' },
  { code: 'primera-ruta', nombre: 'Ruta terminada', descripcion: 'Completar todas las lecciones de una ruta.' },
  { code: 'programa-completo', nombre: 'Programa completo', descripcion: 'Completar todas las lecciones del salón.' },
];

export function catalogoDeLogros(): Logro[] {
  return CATALOGO;
}

/** Devuelve los códigos de los logros que se desbloquearon en esta evaluación. */
export async function evaluarLogros(userId: string): Promise<Logro[]> {
  const [partidas, ratings, lecciones, stats] = await Promise.all([
    prisma.game.findMany({
      where: { status: 'FINISHED', OR: [{ whiteId: userId }, { blackId: userId }] },
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: { result: true, whiteId: true },
    }),
    prisma.rating.findMany({ where: { userId }, select: { gamesPlayed: true } }),
    prisma.lessonProgress.findMany({ where: { userId }, select: { lessonSlug: true } }),
    prisma.puzzleStats.findUnique({ where: { userId } }),
  ]);

  const ganadas = partidas.filter(
    (p) => p.result !== 'DRAW' && (p.result === 'WHITE') === (p.whiteId === userId),
  );

  // Racha: se cuentan victorias seguidas desde la más reciente hacia atrás.
  let rachaVictorias = 0;
  for (const partida of partidas) {
    const gano = partida.result !== 'DRAW' && (partida.result === 'WHITE') === (partida.whiteId === userId);
    if (!gano) break;
    rachaVictorias++;
  }

  const hechas = new Set(lecciones.map((l) => l.lessonSlug));
  const rutasCompletas = RUTAS.filter((ruta) => {
    const deLaRuta = LECCIONES.filter((l) => l.ruta === ruta);
    return deLaRuta.length > 0 && deLaRuta.every((l) => hechas.has(l.slug));
  });

  const condiciones: Record<string, boolean> = {
    'primera-partida': partidas.length >= 1,
    'primera-victoria': ganadas.length >= 1,
    'diez-partidas': partidas.length >= 10,
    'rating-calibrado': ratings.some((r) => r.gamesPlayed >= PROVISIONAL_GAMES),
    'racha-de-tres': rachaVictorias >= 3,
    'primer-puzzle': (stats?.solved ?? 0) >= 1,
    'racha-de-cinco-puzzles': (stats?.bestStreak ?? 0) >= 5,
    'primera-ruta': rutasCompletas.length >= 1,
    'programa-completo': hechas.size >= LECCIONES.length,
  };

  const yaObtenidos = await prisma.userAchievement.findMany({
    where: { userId },
    select: { code: true },
  });
  const tiene = new Set(yaObtenidos.map((o) => o.code));

  const nuevos = CATALOGO.filter((logro) => condiciones[logro.code] && !tiene.has(logro.code));
  if (nuevos.length > 0) {
    await prisma.userAchievement.createMany({
      data: nuevos.map((logro) => ({ userId, code: logro.code })),
      skipDuplicates: true,
    });
  }
  return nuevos;
}

/**
 * Días seguidos con actividad, contando desde hoy hacia atrás. Se deduce de las
 * partidas y los puzzles en vez de guardarse: un contador aparte se desincroniza
 * apenas alguien juega desde dos dispositivos.
 */
export async function rachaDeDias(userId: string): Promise<number> {
  const desde = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const [partidas, intentos] = await Promise.all([
    prisma.game.findMany({
      where: { startedAt: { gte: desde }, OR: [{ whiteId: userId }, { blackId: userId }] },
      select: { startedAt: true },
    }),
    prisma.puzzleAttempt.findMany({
      where: { userId, attemptedAt: { gte: desde } },
      select: { attemptedAt: true },
    }),
  ]);

  const dias = new Set<string>();
  for (const p of partidas) dias.add(p.startedAt.toISOString().slice(0, 10));
  for (const i of intentos) dias.add(i.attemptedAt.toISOString().slice(0, 10));

  let racha = 0;
  const cursor = new Date();
  // Si hoy todavía no jugó, la racha puede seguir viva desde ayer.
  if (!dias.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dias.has(cursor.toISOString().slice(0, 10))) {
    racha++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return racha;
}
