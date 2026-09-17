import { applyGame, displayRating, type Rating } from '@gambito/rating';
import { PROVISIONAL_GAMES, type Category, type Color, type GameResult } from '@gambito/shared';
import { prisma } from '../db.js';

export interface RatingChange {
  before: Record<Color, number>;
  after: Record<Color, number>;
  delta: Record<Color, number>;
}

/**
 * Aplica el resultado de una partida clasificatoria a los ratings de los dos
 * jugadores, en la modalidad de esa partida. Todo ocurre en una transacción: si
 * falla la escritura de uno, no queda el otro actualizado contra un rival que no
 * se movió.
 */
export async function applyRatedResult(params: {
  whiteId: string;
  blackId: string;
  category: Category;
  result: GameResult;
}): Promise<RatingChange | null> {
  const [white, black] = await Promise.all([
    ensureRating(params.whiteId, params.category),
    ensureRating(params.blackId, params.category),
  ]);

  const outcome = applyGame(toRating(white), toRating(black), params.result);

  const whiteAfter = displayRating(outcome.white);
  const blackAfter = displayRating(outcome.black);

  await prisma.$transaction([
    prisma.rating.update({
      where: { userId_category: { userId: params.whiteId, category: params.category } },
      data: {
        rating: whiteAfter,
        rd: outcome.white.rd,
        volatility: outcome.white.volatility,
        gamesPlayed: { increment: 1 },
        peak: Math.max(white.peak, whiteAfter),
      },
    }),
    prisma.rating.update({
      where: { userId_category: { userId: params.blackId, category: params.category } },
      data: {
        rating: blackAfter,
        rd: outcome.black.rd,
        volatility: outcome.black.volatility,
        gamesPlayed: { increment: 1 },
        peak: Math.max(black.peak, blackAfter),
      },
    }),
  ]);

  return {
    before: { white: white.rating, black: black.rating },
    after: { white: whiteAfter, black: blackAfter },
    delta: { white: whiteAfter - white.rating, black: blackAfter - black.rating },
  };
}

/** Una partida amistosa cuenta como jugada, pero no mueve el rating. */
export async function countUnratedGame(userIds: string[], category: Category): Promise<void> {
  await prisma.rating.updateMany({
    where: { userId: { in: userIds }, category },
    data: { gamesPlayed: { increment: 1 } },
  });
}

async function ensureRating(userId: string, category: Category) {
  // Las cuentas creadas antes de que existiera una modalidad no tienen su fila.
  return prisma.rating.upsert({
    where: { userId_category: { userId, category } },
    create: { userId, category },
    update: {},
  });
}

function toRating(row: { rating: number; rd: number; volatility: number }): Rating {
  return { rating: row.rating, rd: row.rd, volatility: row.volatility };
}

export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < PROVISIONAL_GAMES;
}
