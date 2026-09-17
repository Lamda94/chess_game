import { z } from 'zod';

/** Modalidades de juego. Cada una lleva su propio rating. */
export const CATEGORIES = ['BULLET', 'BLITZ', 'RAPID', 'CLASSICAL'] as const;
export type Category = (typeof CATEGORIES)[number];

export const categorySchema = z.enum(CATEGORIES);

export const CATEGORY_LABEL: Record<Category, string> = {
  BULLET: 'Bullet',
  BLITZ: 'Blitz',
  RAPID: 'Rápida',
  CLASSICAL: 'Clásica',
};

/** Un control de tiempo: minutos iniciales + incremento por jugada, en segundos. */
export const timeControlSchema = z.object({
  initialSec: z.number().int().min(15).max(10800),
  incrementSec: z.number().int().min(0).max(180),
});
export type TimeControl = z.infer<typeof timeControlSchema>;

/**
 * Clasificación oficial: se usa la duración estimada de una partida de 40 jugadas,
 * el mismo criterio que usa la FIDE para separar relámpago de rápida.
 */
export function categoryFor({ initialSec, incrementSec }: TimeControl): Category {
  const estimated = initialSec + 40 * incrementSec;
  if (estimated < 180) return 'BULLET';
  if (estimated < 600) return 'BLITZ';
  if (estimated < 3600) return 'RAPID';
  return 'CLASSICAL';
}

export function formatTimeControl({ initialSec, incrementSec }: TimeControl): string {
  return `${Math.round(initialSec / 60)}+${incrementSec}`;
}

/** Los controles que ofrece el lobby, agrupados por modalidad. */
export const PRESET_TIME_CONTROLS: readonly TimeControl[] = [
  { initialSec: 60, incrementSec: 0 },
  { initialSec: 120, incrementSec: 1 },
  { initialSec: 180, incrementSec: 0 },
  { initialSec: 180, incrementSec: 2 },
  { initialSec: 300, incrementSec: 0 },
  { initialSec: 600, incrementSec: 0 },
  { initialSec: 900, incrementSec: 10 },
  { initialSec: 1800, incrementSec: 20 },
  { initialSec: 2700, incrementSec: 45 },
];

export function isPresetTimeControl(tc: TimeControl): boolean {
  return PRESET_TIME_CONTROLS.some(
    (p) => p.initialSec === tc.initialSec && p.incrementSec === tc.incrementSec,
  );
}
