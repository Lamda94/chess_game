import { APARIENCIA_POR_DEFECTO, type Color, type PieceSet } from '@gambito/shared';
import type { PieceType } from '@gambito/chess-core';

/**
 * Piezas dibujadas en SVG y no con los glifos Unicode de ajedrez: los glifos
 * cambian de forma según la fuente instalada y en algunos sistemas ni existen.
 * Estas se ven igual en todos lados y escalan sin perder nitidez.
 */

const BODY = { strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

/**
 * Geometría alternativa: figuras construidas con primitivas, sin los detalles
 * del Staunton. No es el mismo dibujo con otro color — son otras siluetas.
 */
function pathsMinimal(type: PieceType): string[] {
  const base = 'M11.5 34h22v4h-22z';
  switch (type) {
    case 'p':
      return ['M22.5 9a6 6 0 1 1 0 12 6 6 0 0 1 0-12z', 'M16.5 21.5h12l3 12.5H13.5z', base];
    case 'r':
      return ['M12 9h5v4h4V9h3v4h4V9h5v9H12z', 'M15 18h15l2 16H13z', base];
    case 'n':
      // Silueta de cabeza de caballo mirando a la izquierda: oreja, frente,
      // hocico y cuello. El primer intento salió un borrón sin rasgos.
      return [
        'M28.8 6.5 32.6 15v19H13.4v-5.2c0-4.2 1.6-7.6 4.6-10.3L12.2 20l1.6-4.6 5.6-2.2-1.3-3.4z',
        base,
      ];
    case 'b':
      return ['M22.5 5.2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z', 'M22.5 10l8.5 15a8.5 8.5 0 0 1-17 0z', 'M15 30h15v4H15z', base];
    case 'q':
      return ['M9 12.5v21.5h27V12.5l-4.6 8.2-4.4-9.2-4.5 9.2-4.5-9.2-4.4 9.2z', base];
    case 'k':
      return ['M21 5h3v4h4v3h-4v4h-3v-4h-4V9h4z', 'M13.5 34c0-9 4-14 9-14s9 5 9 14z', base];
  }
}

/**
 * Cada juego es una forma de pintar, no un dibujo aparte: el relleno, el trazo
 * y su grosor. Agregar uno es sumar una entrada acá.
 */
interface Estilo {
  geometria: 'staunton' | 'minimal';
  fill: (color: Color) => string;
  stroke: (color: Color) => string;
  grosor: number;
  sombra: boolean;
}

const ESTILOS: Record<PieceSet, Estilo> = {
  clasicas: {
    geometria: 'staunton',
    fill: (c) => (c === 'white' ? 'var(--piece-white)' : 'var(--piece-black)'),
    stroke: (c) => (c === 'white' ? '#2a2a2a' : '#000000'),
    grosor: 1.4,
    sombra: true,
  },
  contorno: {
    // Las blancas quedan huecas y dejan ver la casilla; su contorno oscuro es lo
    // que las recorta, así que se lee igual sobre casilla clara y oscura.
    geometria: 'staunton',
    fill: (c) => (c === 'white' ? 'none' : 'var(--piece-black)'),
    stroke: () => '#1d1f24',
    grosor: 1.9,
    sombra: false,
  },
  nitidas: {
    // Trazo grueso y un reborde claro en las negras, para que no se empasten
    // contra la casilla oscura en pantallas chicas.
    geometria: 'staunton',
    fill: (c) => (c === 'white' ? '#ffffff' : '#14161a'),
    stroke: (c) => (c === 'white' ? '#14161a' : '#efe9dc'),
    grosor: 2.4,
    sombra: true,
  },
  minimal: {
    geometria: 'minimal',
    fill: (c) => (c === 'white' ? 'var(--piece-white)' : 'var(--piece-black)'),
    stroke: (c) => (c === 'white' ? '#33302b' : '#000000'),
    grosor: 1.2,
    sombra: false,
  },
};

function paths(type: PieceType): string[] {
  switch (type) {
    case 'p':
      return [
        'M22.5 9a4.2 4.2 0 0 0-2.4 7.7c-1.6.9-2.7 2.6-2.7 4.6 0 2 1.1 3.7 2.7 4.7-2.6 1-5.5 3.8-5.5 9.5h15.8c0-5.7-2.9-8.5-5.5-9.5 1.6-1 2.7-2.7 2.7-4.7 0-2-1.1-3.7-2.7-4.6A4.2 4.2 0 0 0 22.5 9z',
      ];
    case 'r':
      return [
        'M11.5 36.5h22v-3h-22zM13 33.5h19V31H13zM14 31V18.5h17V31zM11.5 18.5h22V15h-22z',
        'M12 15V9h3.5v2.5h4V9h6v2.5h4V9H33v6z',
      ];
    case 'n':
      return [
        'M20 10c6.5 1 12 6.5 12 17.5 0 2.5.5 4.5 1.5 6H12c-1-3 0-6.5 2.5-9.5 3-3.6 5.5-5 6.5-7.5l-3 1.5-2-3 3.5-2c-1.5-1-3-.8-4.5.3L13 15l-2-2.6 4-3.2c2-1.6 4.3-2.4 6.5-2.2z',
        'M13.5 33.5h20v3h-20z',
      ];
    case 'b':
      return [
        'M22.5 8a2.6 2.6 0 0 0-1.6 4.7c-3.3 2.2-6.4 6.3-6.4 11.3 0 3 1.4 5 3 6.5h10c1.6-1.5 3-3.5 3-6.5 0-5-3.1-9.1-6.4-11.3A2.6 2.6 0 0 0 22.5 8z',
        'M13 30.5h19v3H13zM11.5 33.5h22v3h-22z',
        'M22.5 15v7M19 18.5h7',
      ];
    case 'q':
      return [
        'M9 14a2 2 0 1 0 0-.1zM36 14a2 2 0 1 0 0-.1zM16 9.5a2 2 0 1 0 0-.1zM29 9.5a2 2 0 1 0 0-.1zM22.5 7a2 2 0 1 0 0-.1z',
        'M9.5 14.5 13 27h19l3.5-12.5-6 6-3.5-13-3.5 13-3.5-13L15.5 20z',
        'M12.5 27h20v3.5h-20zM11 30.5h23v3H11zM11.5 33.5h22v3h-22z',
      ];
    case 'k':
      return [
        // Cruz, collar, cuerpo acampanado y base en dos niveles.
        'M21 7h3v4h4v3h-4v4h-3v-4h-4v-3h4z',
        'M16.5 18.5h12v2.5h-12z',
        'M14.5 31c-1.2-4.6.4-8.5 3.2-10.6h9.6c2.8 2.1 4.4 6 3.2 10.6z',
        'M13 31h19v2.8H13zM11.5 33.8h22v3h-22z',
      ];
  }
}

export interface PieceProps {
  type: PieceType;
  color: Color;
  /** Lado en px. Si se omite, la pieza llena el contenedor. */
  size?: number | string;
  /** Juego de piezas. Por defecto, el clásico. */
  set?: PieceSet;
}

export function Piece({ type, color, size = '100%', set = APARIENCIA_POR_DEFECTO.pieceSet }: PieceProps) {
  const estilo = ESTILOS[set] ?? ESTILOS[APARIENCIA_POR_DEFECTO.pieceSet];
  const dibujos = estilo.geometria === 'minimal' ? pathsMinimal(type) : paths(type);
  return (
    <svg
      viewBox="0 0 45 45"
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        display: 'block',
        pointerEvents: 'none',
        ...(estilo.sombra ? { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' } : {}),
      }}
    >
      <g fill={estilo.fill(color)} stroke={estilo.stroke(color)} strokeWidth={estilo.grosor} {...BODY}>
        {dibujos.map((d, index) => (
          <path key={index} d={d} />
        ))}
      </g>
    </svg>
  );
}

const NAMES: Record<PieceType, string> = {
  p: 'peón',
  n: 'caballo',
  b: 'alfil',
  r: 'torre',
  q: 'dama',
  k: 'rey',
};

/** Nombre hablado de la pieza, para los lectores de pantalla. */
export function pieceName(type: PieceType, color: Color): string {
  return `${NAMES[type]} ${color === 'white' ? 'blanco' : 'negro'}`;
}
