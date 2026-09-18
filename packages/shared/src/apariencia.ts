import { z } from 'zod';

/**
 * Personalización del tablero.
 *
 * Los juegos de piezas y los temas son **datos**: agregar uno es añadir una
 * entrada acá y nada más. El tablero pinta los colores como variables CSS, así
 * que un tema son cinco colores; y un juego de piezas es una geometría más los
 * colores con que se rellena y se contornea.
 */

/* ------------------------------------------------------------------ */
/* Juegos de piezas                                                    */
/* ------------------------------------------------------------------ */

export const PIECE_SETS = [
  'clasicas',
  'tinta',
  'marmol',
  'madera',
  'metal',
  'contorno',
  'nitidas',
  'minimal',
  'silueta',
  'pixel',
  'pixel-noche',
] as const;
export type PieceSet = (typeof PIECE_SETS)[number];

export interface PieceSetInfo {
  id: PieceSet;
  label: string;
  descripcion: string;
  /** Qué siluetas usa. */
  geometria: 'staunton' | 'minimal' | 'pixel';
  blanca: { fill: string; stroke: string };
  negra: { fill: string; stroke: string };
  grosor: number;
  sombra: boolean;
}

export const PIECE_SET_INFO: readonly PieceSetInfo[] = [
  {
    id: 'clasicas',
    label: 'Clásicas',
    descripcion: 'Marfil y ébano, con su contorno fino.',
    geometria: 'staunton',
    blanca: { fill: '#f8f3e6', stroke: '#2a2a2a' },
    negra: { fill: '#1b1e23', stroke: '#000000' },
    grosor: 1.4,
    sombra: true,
  },
  {
    id: 'tinta',
    label: 'Tinta',
    descripcion: 'Blanco y negro puros, dibujados a trazo.',
    geometria: 'staunton',
    blanca: { fill: '#ffffff', stroke: '#111111' },
    negra: { fill: '#111111', stroke: '#111111' },
    grosor: 2.2,
    sombra: false,
  },
  {
    id: 'marmol',
    label: 'Mármol',
    descripcion: 'Blanco frío contra pizarra.',
    geometria: 'staunton',
    blanca: { fill: '#f2f4f6', stroke: '#4a5058' },
    negra: { fill: '#464d57', stroke: '#22262c' },
    grosor: 1.5,
    sombra: true,
  },
  {
    id: 'madera',
    label: 'Madera',
    descripcion: 'Arce claro y nogal, como un juego de torneo.',
    geometria: 'staunton',
    blanca: { fill: '#e8cfa4', stroke: '#7a5a33' },
    negra: { fill: '#6b4527', stroke: '#33200f' },
    grosor: 1.5,
    sombra: true,
  },
  {
    id: 'metal',
    label: 'Metal',
    descripcion: 'Plata y grafito.',
    geometria: 'staunton',
    blanca: { fill: '#dfe3e8', stroke: '#79818b' },
    negra: { fill: '#555c66', stroke: '#2b3037' },
    grosor: 1.6,
    sombra: true,
  },
  {
    id: 'contorno',
    label: 'Contorno',
    descripcion: 'Las blancas son sólo su silueta y dejan ver la casilla.',
    geometria: 'staunton',
    blanca: { fill: 'none', stroke: '#1d1f24' },
    negra: { fill: '#1b1e23', stroke: '#1d1f24' },
    grosor: 1.9,
    sombra: false,
  },
  {
    id: 'nitidas',
    label: 'Nítidas',
    descripcion: 'Trazo grueso y mucho contraste. Cómodas en pantallas chicas.',
    geometria: 'staunton',
    blanca: { fill: '#ffffff', stroke: '#14161a' },
    negra: { fill: '#14161a', stroke: '#efe9dc' },
    grosor: 2.4,
    sombra: true,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    descripcion: 'Figuras geométricas, sin adornos.',
    geometria: 'minimal',
    blanca: { fill: '#f8f3e6', stroke: '#33302b' },
    negra: { fill: '#1b1e23', stroke: '#000000' },
    grosor: 1.2,
    sombra: false,
  },
  {
    id: 'silueta',
    label: 'Silueta',
    descripcion: 'Las mismas figuras, en blanco y negro planos.',
    geometria: 'minimal',
    blanca: { fill: '#ffffff', stroke: '#111111' },
    negra: { fill: '#111111', stroke: '#111111' },
    grosor: 2,
    sombra: false,
  },
  {
    id: 'pixel',
    label: 'Pixel',
    descripcion: 'Dibujadas sobre una retícula, como en un juego de 8 bits.',
    geometria: 'pixel',
    blanca: { fill: '#f6f1e4', stroke: '#2f2a24' },
    negra: { fill: '#232228', stroke: '#000000' },
    grosor: 0,
    sombra: false,
  },
  {
    id: 'pixel-noche',
    label: 'Pixel noche',
    descripcion: 'La misma retícula, en ámbar y azul.',
    geometria: 'pixel',
    blanca: { fill: '#e8b75c', stroke: '#4a3413' },
    negra: { fill: '#4f7fd6', stroke: '#16244a' },
    grosor: 0,
    sombra: false,
  },
];

export function juegoDePiezas(id: PieceSet): PieceSetInfo {
  return PIECE_SET_INFO.find((p) => p.id === id) ?? PIECE_SET_INFO[0]!;
}

/* ------------------------------------------------------------------ */
/* Temas del tablero                                                   */
/* ------------------------------------------------------------------ */

export const BOARD_THEMES = [
  'madera',
  'trigo',
  'nogal',
  'marmol',
  'pizarra',
  'bosque',
  'menta',
  'oceano',
  'lavanda',
  'coral',
  'arena',
  'noche',
] as const;
export type BoardTheme = (typeof BOARD_THEMES)[number];

export interface BoardThemeInfo {
  id: BoardTheme;
  label: string;
  /** Los cinco colores que el tablero expone como variables CSS. */
  colores: {
    light: string;
    dark: string;
    highlightLight: string;
    highlightDark: string;
    check: string;
  };
}

/** Atajo: el resaltado y el jaque se derivan si no se dicen aparte. */
function tema(
  id: BoardTheme,
  label: string,
  light: string,
  dark: string,
  highlightLight: string,
  highlightDark: string,
  check = '#c4685e',
): BoardThemeInfo {
  return { id, label, colores: { light, dark, highlightLight, highlightDark, check } };
}

export const BOARD_THEME_INFO: readonly BoardThemeInfo[] = [
  tema('madera', 'Madera', '#e6d9be', '#6e5c45', '#c9b96e', '#9b8747'),
  tema('trigo', 'Trigo', '#eeddb8', '#b58863', '#d6c76a', '#a58a45'),
  tema('nogal', 'Nogal', '#dfc9a2', '#5a3b23', '#c2ab60', '#87673a'),
  tema('marmol', 'Mármol', '#eceae4', '#8d8b86', '#cfcf9a', '#9d9c72', '#c9706a'),
  tema('pizarra', 'Pizarra', '#d8dce3', '#6d7480', '#c3c98a', '#8d9464', '#c9706a'),
  tema('bosque', 'Bosque', '#e8e6d0', '#5b7355', '#c8cc7e', '#8d9a5c'),
  tema('menta', 'Menta', '#e3efe6', '#6d9b82', '#c6d489', '#89a568'),
  tema('oceano', 'Océano', '#dee6ee', '#4e6b87', '#b7c98c', '#7d9464', '#c9706a'),
  tema('lavanda', 'Lavanda', '#e8e4f2', '#7a6f9b', '#c9c58a', '#8f8a63', '#c9706a'),
  tema('coral', 'Coral', '#f4e2d8', '#b5765f', '#d8c470', '#a08a48'),
  tema('arena', 'Arena', '#f0e6d2', '#c3a679', '#d5c26b', '#a89050'),
  tema('noche', 'Noche', '#6f7480', '#3b3f49', '#9a9a6a', '#6d6d49', '#b45f57'),
];

export function temaDelTablero(id: BoardTheme): BoardThemeInfo {
  return BOARD_THEME_INFO.find((t) => t.id === id) ?? BOARD_THEME_INFO[0]!;
}

/* ------------------------------------------------------------------ */
/* Contrato                                                            */
/* ------------------------------------------------------------------ */

export const pieceSetSchema = z.enum(PIECE_SETS);
export const boardThemeSchema = z.enum(BOARD_THEMES);

export const apparienceSchema = z.object({
  pieceSet: pieceSetSchema.optional(),
  boardTheme: boardThemeSchema.optional(),
});
export type ApparienceInput = z.infer<typeof apparienceSchema>;

export const APARIENCIA_POR_DEFECTO = { pieceSet: 'clasicas', boardTheme: 'madera' } as const;
