import { APARIENCIA_POR_DEFECTO, rutaDePieza, type Color, type PieceSet } from '@gambito/shared';
import type { PieceType } from '@gambito/chess-core';

/**
 * Las piezas son archivos SVG servidos desde `/piece/<juego>/<código>.svg`.
 *
 * Son juegos libres de terceros —cada uno con su autor y su licencia, anotados
 * en `public/piece/LICENCIAS.md`— y no dibujos de este proyecto. Antes se
 * dibujaban acá a mano; el resultado no llegaba ni de cerca al de un set hecho
 * por un ilustrador, y mantener nueve variantes de dos siluetas era mucho código
 * para poca variedad de verdad.
 *
 * Van como `<img>` y no incrustadas: el navegador cachea cada archivo una vez y
 * lo reutiliza en las treinta y dos casillas, y cambiar de juego no obliga a
 * volver a dibujar nada.
 */

export interface PieceProps {
  type: PieceType;
  color: Color;
  /** Lado en px. Si se omite, la pieza llena el contenedor. */
  size?: number | string;
  /** Juego de piezas. Por defecto, el clásico. */
  set?: PieceSet;
}

const NAMES: Record<PieceType, string> = {
  p: 'peón',
  n: 'caballo',
  b: 'alfil',
  r: 'torre',
  q: 'dama',
  k: 'rey',
};

export function pieceName(type: PieceType, color: Color): string {
  return `${NAMES[type]} ${color === 'white' ? 'blanco' : 'negro'}`;
}

export function Piece({ type, color, size = '100%', set = APARIENCIA_POR_DEFECTO.pieceSet }: PieceProps) {
  return (
    <img
      src={rutaDePieza(set, type, color)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ display: 'block', width: size, height: size, pointerEvents: 'none', userSelect: 'none' }}
    />
  );
}
