/**
 * Los veinte niveles de la sala de práctica.
 *
 * Stockfish tiene dos formas de jugar peor a propósito y cada una sirve para algo
 * distinto: `UCI_Elo` apunta a una fuerza concreta pero sólo baja hasta ~1320, y
 * `Skill Level` degrada la búsqueda y llega mucho más abajo, aunque sin prometer
 * un número. Por eso los primeros niveles usan Skill Level y los altos, Elo.
 * El tiempo por jugada se limita siempre: un motor que piensa cinco segundos en
 * el nivel 3 juega raro, no débil.
 */
export interface Nivel {
  nivel: number;
  /** Etiqueta que ve el jugador. */
  nombre: string;
  /** Fuerza aproximada, o null cuando el motor no la promete. */
  eloAprox: number | null;
  skillLevel: number;
  /** Milisegundos máximos de cálculo por jugada. */
  movetimeMs: number;
  profundidadMax: number;
  /** true cuando se usa UCI_LimitStrength con un Elo objetivo. */
  limitarFuerza: boolean;
}

const NOMBRES = [
  'Primera partida',
  'Aprendiendo',
  'Principiante',
  'Principiante',
  'Casual',
  'Casual',
  'Aficionado',
  'Aficionado',
  'Club',
  'Club',
  'Club fuerte',
  'Club fuerte',
  'Torneo',
  'Torneo',
  'Experto',
  'Experto',
  'Maestro',
  'Maestro',
  'Gran maestro',
  'Sin piedad',
];

export const NIVELES: readonly Nivel[] = Array.from({ length: 20 }, (_, index) => {
  const nivel = index + 1;
  const limitarFuerza = nivel >= 9;
  // De 1320 en el nivel 9 hasta 2850 en el 20.
  const elo = limitarFuerza ? Math.round(1320 + ((nivel - 9) / 11) * 1530) : null;
  return {
    nivel,
    nombre: NOMBRES[index]!,
    eloAprox: elo,
    skillLevel: Math.min(20, Math.round(((nivel - 1) / 19) * 20)),
    movetimeMs: Math.round(60 + Math.pow(nivel, 1.9) * 3.2),
    profundidadMax: Math.min(22, 2 + Math.floor(nivel * 1.1)),
    limitarFuerza,
  };
});

export function nivelPorNumero(nivel: number): Nivel {
  return NIVELES[Math.min(20, Math.max(1, Math.round(nivel))) - 1]!;
}

/** Cuánto material le sacamos a la IA para emparejar una partida desigual. */
export const HANDICAPS = [
  { id: 'ninguno', nombre: 'Ninguno — posición inicial', quitar: [] as string[] },
  { id: 'caballo', nombre: 'La IA juega sin un caballo', quitar: ['b1', 'b8'] },
  { id: 'torre', nombre: 'La IA juega sin una torre', quitar: ['a1', 'a8'] },
  { id: 'dama', nombre: 'La IA juega sin la dama', quitar: ['d1', 'd8'] },
] as const;

export type HandicapId = (typeof HANDICAPS)[number]['id'];
