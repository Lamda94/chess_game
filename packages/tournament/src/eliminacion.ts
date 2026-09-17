import type { Emparejamiento, Participante } from './tipos.js';

/**
 * Eliminación directa.
 *
 * El cuadro se arma sobre la potencia de dos inmediatamente superior al número
 * de inscriptos, y los lugares que sobran se reparten como byes entre los
 * mejores clasificados: es la forma estándar de que el favorito no quede
 * eliminado en primera ronda por un accidente del sorteo.
 */

export interface RondaEliminatoria {
  ronda: number;
  emparejamientos: Emparejamiento[];
  /** Quiénes pasan de ronda sin jugar. */
  byes: string[];
}

/** Potencia de dos igual o mayor al número de jugadores. */
export function tamanoDelCuadro(jugadores: number): number {
  let tamano = 1;
  while (tamano < jugadores) tamano *= 2;
  return tamano;
}

export function rondasNecesarias(jugadores: number): number {
  return Math.log2(tamanoDelCuadro(Math.max(1, jugadores)));
}

/**
 * Orden de siembra estándar: enfrenta al primero con el último, al segundo con
 * el anteúltimo, y así. Con las semillas ordenadas, el 1 y el 2 sólo pueden
 * cruzarse en la final.
 */
export function ordenDeSiembra(tamano: number): number[] {
  let orden = [1, 2];
  while (orden.length < tamano) {
    const siguiente = orden.length * 2;
    const expandido: number[] = [];
    for (const semilla of orden) {
      expandido.push(semilla, siguiente + 1 - semilla);
    }
    orden = expandido;
  }
  return orden;
}

/** Arma la primera ronda a partir de los inscriptos, ordenados por rating. */
export function primeraRondaEliminatoria(participantes: Participante[]): RondaEliminatoria {
  const activos = [...participantes.filter((p) => !p.retirado)].sort((a, b) => b.rating - a.rating);
  if (activos.length < 2) return { ronda: 1, emparejamientos: [], byes: activos.map((a) => a.userId) };

  const tamano = tamanoDelCuadro(activos.length);
  const orden = ordenDeSiembra(tamano);

  const emparejamientos: Emparejamiento[] = [];
  const byes: string[] = [];
  let tablero = 1;

  for (let i = 0; i < orden.length; i += 2) {
    // Las semillas son 1-indexadas; las que superan el número de inscriptos son
    // huecos del cuadro y se traducen en un bye para el rival.
    const local = activos[orden[i]! - 1];
    const visitante = activos[orden[i + 1]! - 1];

    if (local && visitante) {
      emparejamientos.push({ tablero: tablero++, whiteId: local.userId, blackId: visitante.userId });
    } else if (local) {
      byes.push(local.userId);
    } else if (visitante) {
      byes.push(visitante.userId);
    }
  }

  return { ronda: 1, emparejamientos, byes };
}

/**
 * Arma la ronda siguiente con quienes sobrevivieron, respetando el orden del
 * cuadro: el ganador del tablero 1 juega contra el del 2, y así.
 */
export function siguienteRondaEliminatoria(
  ganadoresEnOrden: string[],
  ronda: number,
): RondaEliminatoria {
  const emparejamientos: Emparejamiento[] = [];
  const byes: string[] = [];

  for (let i = 0; i < ganadoresEnOrden.length; i += 2) {
    const local = ganadoresEnOrden[i]!;
    const visitante = ganadoresEnOrden[i + 1];
    if (visitante) {
      emparejamientos.push({ tablero: emparejamientos.length + 1, whiteId: local, blackId: visitante });
    } else {
      byes.push(local);
    }
  }

  return { ronda, emparejamientos, byes };
}
