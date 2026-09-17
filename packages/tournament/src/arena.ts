/**
 * Puntuación de arena.
 *
 * Una arena no tiene rondas: se juega sin parar durante un tiempo fijo y quien
 * más puntos junta, gana. Para que convenga seguir jugando en vez de sentarse a
 * cuidar el primer puesto, las victorias seguidas valen doble a partir de la
 * tercera. Es el esquema de lichess, y premia el ritmo tanto como el resultado.
 */

export const PUNTOS_VICTORIA = 2;
export const PUNTOS_TABLAS = 1;
export const PUNTOS_DERROTA = 0;
/** A partir de cuántas victorias seguidas se duplican los puntos. */
export const RACHA_PARA_DOBLE = 3;

export type ResultadoArena = 'win' | 'draw' | 'loss';

export interface EstadoArena {
  puntos: number;
  /** Victorias seguidas hasta ahora. */
  racha: number;
  partidas: number;
  /** true mientras la racha esté dando puntos dobles. */
  enLlamas: boolean;
}

export const ESTADO_INICIAL: EstadoArena = { puntos: 0, racha: 0, partidas: 0, enLlamas: false };

/** Aplica el resultado de una partida al estado de arena de un jugador. */
export function puntuarArena(estado: EstadoArena, resultado: ResultadoArena): EstadoArena {
  const racha = resultado === 'win' ? estado.racha + 1 : 0;
  // La racha se mide *después* de esta partida: la tercera victoria seguida ya
  // cobra doble, no la cuarta.
  const doble = resultado === 'win' && racha >= RACHA_PARA_DOBLE;

  const base =
    resultado === 'win' ? PUNTOS_VICTORIA : resultado === 'draw' ? PUNTOS_TABLAS : PUNTOS_DERROTA;

  return {
    puntos: estado.puntos + base * (doble ? 2 : 1),
    racha,
    partidas: estado.partidas + 1,
    enLlamas: racha >= RACHA_PARA_DOBLE,
  };
}

export interface FilaArena {
  userId: string;
  puntos: number;
  partidas: number;
  racha: number;
  rating: number;
}

/** Clasificación de arena: puntos, y a igualdad, menos partidas jugadas. */
export function ordenarArena(filas: FilaArena[]): FilaArena[] {
  return [...filas].sort(
    (a, b) =>
      b.puntos - a.puntos ||
      a.partidas - b.partidas ||
      b.rating - a.rating ||
      a.userId.localeCompare(b.userId),
  );
}
