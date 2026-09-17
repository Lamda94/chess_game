export const FORMATOS = ['SWISS', 'ARENA', 'KNOCKOUT'] as const;
export type Formato = (typeof FORMATOS)[number];

export const FORMATO_LABEL: Record<Formato, string> = {
  SWISS: 'Suizo',
  ARENA: 'Arena',
  KNOCKOUT: 'Eliminación directa',
};

/** Un jugador inscripto, tal como lo ve el emparejador. */
export interface Participante {
  userId: string;
  rating: number;
  /** Puntos acumulados: 1 por victoria, 0.5 por tablas. */
  puntos: number;
  /** Rivales enfrentados, en orden de ronda. */
  rivales: string[];
  /** Colores jugados, en orden de ronda. */
  colores: Array<'white' | 'black'>;
  /** Ya recibió un bye en alguna ronda. */
  tuvoBye: boolean;
  /** Se retiró del torneo. */
  retirado: boolean;
}

export interface Emparejamiento {
  tablero: number;
  whiteId: string;
  blackId: string;
}

export interface RondaEmparejada {
  emparejamientos: Emparejamiento[];
  /** Quién descansa esta ronda, si el número de jugadores es impar. */
  bye: string | null;
}
