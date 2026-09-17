import { z } from 'zod';

/**
 * Personalización del tablero.
 *
 * Los juegos de piezas y los temas del tablero son **datos**, no código: agregar
 * uno nuevo es añadir una entrada acá y nada más. El tablero pinta los colores
 * como variables CSS, así que un tema es sólo un puñado de colores.
 */

/* ------------------------------------------------------------------ */
/* Juegos de piezas                                                    */
/* ------------------------------------------------------------------ */

export const PIECE_SETS = ['clasicas', 'contorno', 'nitidas', 'minimal'] as const;
export type PieceSet = (typeof PIECE_SETS)[number];

export interface PieceSetInfo {
  id: PieceSet;
  label: string;
  descripcion: string;
}

export const PIECE_SET_INFO: readonly PieceSetInfo[] = [
  {
    id: 'clasicas',
    label: 'Clásicas',
    descripcion: 'El Staunton de siempre, con su contorno fino.',
  },
  {
    id: 'contorno',
    label: 'Contorno',
    descripcion: 'Las blancas son sólo su silueta y dejan ver la casilla.',
  },
  {
    id: 'nitidas',
    label: 'Nítidas',
    descripcion: 'Trazo grueso y mucho contraste. Cómodas en pantallas chicas.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    descripcion: 'Figuras geométricas, sin adornos.',
  },
];

/* ------------------------------------------------------------------ */
/* Temas del tablero                                                   */
/* ------------------------------------------------------------------ */

export const BOARD_THEMES = ['madera', 'marmol', 'bosque', 'oceano', 'noche'] as const;
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

export const BOARD_THEME_INFO: readonly BoardThemeInfo[] = [
  {
    id: 'madera',
    label: 'Madera',
    colores: {
      light: '#e6d9be',
      dark: '#6e5c45',
      highlightLight: '#c9b96e',
      highlightDark: '#9b8747',
      check: '#c4685e',
    },
  },
  {
    id: 'marmol',
    label: 'Mármol',
    colores: {
      light: '#eceae4',
      dark: '#8d8b86',
      highlightLight: '#cfcf9a',
      highlightDark: '#9d9c72',
      check: '#c9706a',
    },
  },
  {
    id: 'bosque',
    label: 'Bosque',
    colores: {
      light: '#e8e6d0',
      dark: '#5b7355',
      highlightLight: '#c8cc7e',
      highlightDark: '#8d9a5c',
      check: '#c4685e',
    },
  },
  {
    id: 'oceano',
    label: 'Océano',
    colores: {
      light: '#dee6ee',
      dark: '#4e6b87',
      highlightLight: '#b7c98c',
      highlightDark: '#7d9464',
      check: '#c9706a',
    },
  },
  {
    id: 'noche',
    label: 'Noche',
    colores: {
      light: '#6f7480',
      dark: '#3b3f49',
      highlightLight: '#9a9a6a',
      highlightDark: '#6d6d49',
      check: '#b45f57',
    },
  },
];

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

export function temaDelTablero(id: BoardTheme): BoardThemeInfo {
  return BOARD_THEME_INFO.find((t) => t.id === id) ?? BOARD_THEME_INFO[0]!;
}
