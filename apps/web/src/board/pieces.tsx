import { APARIENCIA_POR_DEFECTO, juegoDePiezas, type Color, type PieceSet } from '@gambito/shared';
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
 * Piezas pixeladas.
 *
 * Se diseñaron sobre una retícula de texto y se convirtieron a `path` con un
 * script: dibujar con caracteres deja ver la silueta mientras se trabaja, que es
 * justo lo que falta al escribir coordenadas a ciegas.
 *
 * Devuelve dos trazos: el contorno —la misma retícula dilatada una celda— y el
 * relleno encima. Un `stroke` no sirve acá, porque dibujaría también los bordes
 * internos de cada rectángulo y la pieza queda rayada.
 */
function pathsPixel(type: PieceType): [borde: string, relleno: string] {
  switch (type) {
    case 'p':
      return [
        'M18 9h9v3h-9zM15 12h15v3h-15zM12 15h21v3h-21zM12 18h21v3h-21zM15 21h15v3h-15zM12 24h21v3h-21zM9 27h27v3h-27zM6 30h33v3h-33zM6 33h33v3h-33zM9 36h27v3h-27z',
        'M18 12h9v3h-9zM15 15h15v3h-15zM15 18h15v3h-15zM18 21h9v3h-9zM15 24h15v3h-15zM12 27h21v3h-21zM9 30h27v3h-27zM9 33h27v3h-27z',
      ];
    case 'r':
      return [
        'M12 6h3v3h-3zM18 6h3v3h-3zM24 6h3v3h-3zM30 6h3v3h-3zM9 9h27v3h-27zM9 12h27v3h-27zM9 15h27v3h-27zM9 18h27v3h-27zM9 21h27v3h-27zM9 24h27v3h-27zM9 27h27v3h-27zM6 30h33v3h-33zM6 33h33v3h-33zM9 36h27v3h-27z',
        'M12 9h3v3h-3zM18 9h3v3h-3zM24 9h3v3h-3zM30 9h3v3h-3zM12 12h21v3h-21zM12 15h21v3h-21zM12 18h21v3h-21zM12 21h21v3h-21zM12 24h21v3h-21zM12 27h21v3h-21zM9 30h27v3h-27zM9 33h27v3h-27z',
      ];
    case 'n':
      return [
        'M21 3h6v3h-6zM18 6h12v3h-12zM15 9h18v3h-18zM12 12h21v3h-21zM9 15h24v3h-24zM6 18h27v3h-27zM6 21h27v3h-27zM9 24h24v3h-24zM9 27h27v3h-27zM6 30h33v3h-33zM6 33h33v3h-33zM9 36h27v3h-27z',
        'M21 6h6v3h-6zM18 9h12v3h-12zM15 12h15v3h-15zM12 15h18v3h-18zM9 18h21v3h-21zM9 21h3v3h-3zM15 21h15v3h-15zM15 24h15v3h-15zM12 27h18v3h-18zM9 30h27v3h-27zM9 33h27v3h-27z',
      ];
    case 'b':
      return [
        'M21 3h3v3h-3zM18 6h9v3h-9zM15 9h15v3h-15zM12 12h21v3h-21zM12 15h21v3h-21zM12 18h21v3h-21zM15 21h15v3h-15zM12 24h21v3h-21zM9 27h27v3h-27zM6 30h33v3h-33zM6 33h33v3h-33zM9 36h27v3h-27z',
        'M21 6h3v3h-3zM18 9h9v3h-9zM15 12h6v3h-6zM24 12h6v3h-6zM15 15h15v3h-15zM15 18h15v3h-15zM18 21h9v3h-9zM15 24h15v3h-15zM12 27h21v3h-21zM9 30h27v3h-27zM9 33h27v3h-27z',
      ];
    case 'q':
      return [
        'M9 3h3v3h-3zM15 3h3v3h-3zM21 3h3v3h-3zM27 3h3v3h-3zM33 3h3v3h-3zM6 6h33v3h-33zM6 9h33v3h-33zM9 12h27v3h-27zM12 15h21v3h-21zM12 18h21v3h-21zM12 21h21v3h-21zM9 24h27v3h-27zM9 27h27v3h-27zM6 30h33v3h-33zM6 33h33v3h-33zM9 36h27v3h-27z',
        'M9 6h3v3h-3zM15 6h3v3h-3zM21 6h3v3h-3zM27 6h3v3h-3zM33 6h3v3h-3zM9 9h27v3h-27zM12 12h21v3h-21zM15 15h15v3h-15zM15 18h15v3h-15zM15 21h15v3h-15zM12 24h21v3h-21zM12 27h21v3h-21zM9 30h27v3h-27zM9 33h27v3h-27z',
      ];
    case 'k':
      return [
        'M21 3h3v3h-3zM15 6h15v3h-15zM12 9h21v3h-21zM15 12h15v3h-15zM12 15h21v3h-21zM9 18h27v3h-27zM12 21h21v3h-21zM12 24h21v3h-21zM9 27h27v3h-27zM6 30h33v3h-33zM6 33h33v3h-33zM9 36h27v3h-27z',
        'M21 6h3v3h-3zM15 9h15v3h-15zM21 12h3v3h-3zM15 15h15v3h-15zM12 18h21v3h-21zM15 21h15v3h-15zM15 24h15v3h-15zM12 27h21v3h-21zM9 30h27v3h-27zM9 33h27v3h-27z',
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
  const juego = juegoDePiezas(set);
  const tinta = color === 'white' ? juego.blanca : juego.negra;

  // El pixelado se pinta distinto: dos capas planas, sin trazo y sin suavizado.
  if (juego.geometria === 'pixel') {
    const [borde, relleno] = pathsPixel(type);
    return (
      <svg viewBox="0 0 45 45" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges" style={{ display: 'block', pointerEvents: 'none' }}>
        <path d={borde} fill={tinta.stroke} />
        <path d={relleno} fill={tinta.fill === 'none' ? 'transparent' : tinta.fill} />
      </svg>
    );
  }

  const dibujos = juego.geometria === 'minimal' ? pathsMinimal(type) : paths(type);
  return (
    <svg
      viewBox="0 0 45 45"
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        display: 'block',
        pointerEvents: 'none',
        ...(juego.sombra ? { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' } : {}),
      }}
    >
      <g fill={tinta.fill} stroke={tinta.stroke} strokeWidth={juego.grosor} {...BODY}>
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
