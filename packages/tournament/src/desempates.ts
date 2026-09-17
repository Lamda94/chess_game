import type { Participante } from './tipos.js';

/**
 * Desempates del sistema suizo.
 *
 * Dos jugadores con el mismo puntaje no valen lo mismo: uno puede haberlo sacado
 * contra la mitad de arriba de la tabla y el otro contra la de abajo. Los
 * desempates miden eso.
 */

export interface ResultadoPorRival {
  rivalId: string;
  /** Desde el punto de vista del jugador. */
  puntos: 0 | 0.5 | 1;
}

export interface Desempates {
  buchholz: number;
  buchholzMediano: number;
  sonnebornBerger: number;
}

/**
 * Buchholz: la suma de los puntos de todos los rivales. Premia haber jugado
 * contra gente que terminó bien.
 */
export function buchholz(rivales: string[], puntosPorJugador: Map<string, number>): number {
  return rivales.reduce((suma, rivalId) => suma + (puntosPorJugador.get(rivalId) ?? 0), 0);
}

/**
 * Buchholz mediano: el mismo cálculo sin el rival más flojo ni el más fuerte.
 * Amortigua el efecto de haber cruzado a alguien que abandonó el torneo.
 */
export function buchholzMediano(rivales: string[], puntosPorJugador: Map<string, number>): number {
  if (rivales.length < 3) return buchholz(rivales, puntosPorJugador);
  const valores = rivales.map((id) => puntosPorJugador.get(id) ?? 0).sort((a, b) => a - b);
  return valores.slice(1, -1).reduce((suma, v) => suma + v, 0);
}

/**
 * Sonneborn-Berger: suma los puntos de los rivales a los que se les ganó, y la
 * mitad de los de aquellos con los que se empató. A diferencia del Buchholz,
 * pesa contra quién se sacó cada punto y no sólo contra quién se jugó.
 */
export function sonnebornBerger(
  resultados: ResultadoPorRival[],
  puntosPorJugador: Map<string, number>,
): number {
  return resultados.reduce((suma, resultado) => {
    const delRival = puntosPorJugador.get(resultado.rivalId) ?? 0;
    return suma + delRival * resultado.puntos;
  }, 0);
}

export function calcularDesempates(
  resultados: ResultadoPorRival[],
  puntosPorJugador: Map<string, number>,
): Desempates {
  const rivales = resultados.map((r) => r.rivalId);
  return {
    buchholz: buchholz(rivales, puntosPorJugador),
    buchholzMediano: buchholzMediano(rivales, puntosPorJugador),
    sonnebornBerger: sonnebornBerger(resultados, puntosPorJugador),
  };
}

export interface FilaClasificacion {
  userId: string;
  puntos: number;
  desempates: Desempates;
  rating: number;
}

/**
 * Ordena la clasificación final: puntos, Buchholz, Sonneborn-Berger y, si aun
 * así hay empate, rating. Nunca queda indefinido: dos filas iguales en todo se
 * ordenan por identificador para que la tabla sea estable entre recargas.
 */
export function ordenarClasificacion(filas: FilaClasificacion[]): FilaClasificacion[] {
  return [...filas].sort(
    (a, b) =>
      b.puntos - a.puntos ||
      b.desempates.buchholz - a.desempates.buchholz ||
      b.desempates.sonnebornBerger - a.desempates.sonnebornBerger ||
      b.rating - a.rating ||
      a.userId.localeCompare(b.userId),
  );
}

/** Reconstruye el puntaje de cada jugador desde sus resultados. */
export function puntajesDe(participantes: Participante[]): Map<string, number> {
  return new Map(participantes.map((p) => [p.userId, p.puntos]));
}
