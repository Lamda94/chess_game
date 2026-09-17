import { z } from 'zod';
import { categorySchema, timeControlSchema } from './time-control.js';

export const COLORS = ['white', 'black'] as const;
export type Color = (typeof COLORS)[number];
export const colorSchema = z.enum(COLORS);

export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

export const RESULTS = ['WHITE', 'BLACK', 'DRAW'] as const;
export type GameResult = (typeof RESULTS)[number];

export const TERMINATIONS = [
  'CHECKMATE',
  'RESIGNATION',
  'TIMEOUT',
  'STALEMATE',
  'AGREEMENT',
  'THREEFOLD',
  'FIFTY_MOVE',
  'INSUFFICIENT_MATERIAL',
  'ABANDONED',
] as const;
export type Termination = (typeof TERMINATIONS)[number];

export const TERMINATION_LABEL: Record<Termination, string> = {
  CHECKMATE: 'Jaque mate',
  RESIGNATION: 'Abandono',
  TIMEOUT: 'Tiempo agotado',
  STALEMATE: 'Rey ahogado',
  AGREEMENT: 'Tablas acordadas',
  THREEFOLD: 'Triple repetición',
  FIFTY_MOVE: 'Regla de 50 jugadas',
  INSUFFICIENT_MATERIAL: 'Material insuficiente',
  ABANDONED: 'Partida abandonada',
};

/** Una jugada tal como la publica el servidor. */
export interface MoveView {
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
  /** Reloj del jugador que acaba de mover, después de aplicar el incremento. */
  clockMsAfter: number;
}

export interface PlayerView {
  id: string;
  username: string;
  rating: number;
  /** `true` si el rating todavía no está calibrado (menos de 10 partidas). */
  provisional: boolean;
  avatarUrl: string | null;
  country: string | null;
}

/** El estado completo de una partida. Es lo que se manda al conectarse o reconectarse. */
export interface GameState {
  id: string;
  category: z.infer<typeof categorySchema>;
  timeControl: z.infer<typeof timeControlSchema>;
  rated: boolean;
  white: PlayerView;
  black: PlayerView;
  fen: string;
  moves: MoveView[];
  turn: Color;
  clocks: Record<Color, number>;
  /** Marca del servidor en la que arrancó a correr el reloj del jugador en turno. */
  turnStartedAt: number | null;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED';
  result: GameResult | null;
  termination: Termination | null;
  drawOfferFrom: Color | null;
}

export interface GameOverPayload {
  gameId: string;
  result: GameResult;
  termination: Termination;
  finalFen: string;
  pgn: string;
  ratingDelta: Record<Color, number> | null;
  ratingAfter: Record<Color, number> | null;
}

export interface ChatMessage {
  id: string;
  gameId: string;
  from: string;
  body: string;
  at: number;
}

/** Devuelve el resultado desde el punto de vista de un color. */
export function outcomeFor(result: GameResult, color: Color): 'win' | 'loss' | 'draw' {
  if (result === 'DRAW') return 'draw';
  return (result === 'WHITE' ? 'white' : 'black') === color ? 'win' : 'loss';
}
