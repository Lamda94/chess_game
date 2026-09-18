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

/**
 * Los juegos son archivos SVG servidos desde `/piece/<id>/<código>.svg`, con el
 * código de la pieza como lo nombra la notación: `wN`, `bK`…
 *
 * No son obra de Gambito: son juegos libres de terceros, cada uno con su autor y
 * su licencia, listados en `apps/web/public/piece/LICENCIAS.md`. Están sólo los
 * que permiten uso comercial y son compatibles con la AGPLv3 de este proyecto;
 * agregar uno exige comprobar su licencia antes y anotarla en esa tabla.
 */
export const PIECE_SETS = [
  'cburnett',
  'merida',
  'fantasy',
  'celtic',
  'spatial',
  'chessnut',
  'mpchess',
  'kiwen-suwi',
  'papercut',
  'totoy',
  'pirouetti',
  'rhosgfx',
  'pixel',
  'shapes',
  'letter',
] as const;
export type PieceSet = (typeof PIECE_SETS)[number];

export interface PieceSetInfo {
  id: PieceSet;
  label: string;
  autor: string;
  licencia: string;
}

export const PIECE_SET_INFO: readonly PieceSetInfo[] = [
  { id: 'cburnett', label: 'Clásicas', autor: 'Colin M.L. Burnett', licencia: 'GPLv2+' },
  { id: 'merida', label: 'Mérida', autor: 'Armando Hernandez Marroquin', licencia: 'GPLv2+' },
  { id: 'fantasy', label: 'Fantasía', autor: 'Maurizio Monge', licencia: 'MIT' },
  { id: 'celtic', label: 'Celta', autor: 'Maurizio Monge', licencia: 'MIT' },
  { id: 'spatial', label: 'Espacial', autor: 'Maurizio Monge', licencia: 'MIT' },
  { id: 'chessnut', label: 'Chessnut', autor: 'Alexis Luengas', licencia: 'Apache 2.0' },
  { id: 'mpchess', label: 'Trazo', autor: 'Maxime Chupin', licencia: 'GPLv3+' },
  { id: 'kiwen-suwi', label: 'Kiwen', autor: 'neverRare', licencia: 'CC BY 4.0' },
  { id: 'papercut', label: 'Papel', autor: 'Nikolay Anzarov', licencia: 'CC BY 4.0' },
  { id: 'totoy', label: 'Totoy', autor: 'Kosal Sen', licencia: 'CC BY 4.0' },
  { id: 'pirouetti', label: 'Pirouetti', autor: 'pirouetti', licencia: 'AGPLv3+' },
  { id: 'rhosgfx', label: 'Rhos', autor: 'RhosGFX', licencia: 'CC0' },
  { id: 'pixel', label: 'Pixel', autor: 'therealqtpi', licencia: 'AGPLv3+' },
  { id: 'shapes', label: 'Formas', autor: 'flugsio', licencia: 'CC BY-SA 4.0' },
  { id: 'letter', label: 'Letras', autor: 'usolando', licencia: 'AGPLv3+' },
];

export function juegoDePiezas(id: PieceSet): PieceSetInfo {
  return PIECE_SET_INFO.find((p) => p.id === id) ?? PIECE_SET_INFO[0]!;
}

/** Ruta del archivo de una pieza dentro de un juego. */
export function rutaDePieza(set: PieceSet, tipo: string, color: 'white' | 'black'): string {
  return `/piece/${set}/${color === 'white' ? 'w' : 'b'}${tipo.toUpperCase()}.svg`;
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

export const APARIENCIA_POR_DEFECTO = { pieceSet: 'cburnett', boardTheme: 'madera' } as const;
