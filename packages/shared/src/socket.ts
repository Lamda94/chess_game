import { z } from 'zod';
import { categorySchema, timeControlSchema } from './time-control.js';
import type { ChatMessage, Color, GameOverPayload, GameState, MoveView } from './game.js';

/** Namespace único de juego. */
export const PLAY_NAMESPACE = '/play';

/* ------------------------------------------------------------------ */
/* Cliente → servidor                                                   */
/* ------------------------------------------------------------------ */

export const queueJoinSchema = z.object({
  timeControl: timeControlSchema,
  rated: z.boolean().default(true),
});
export type QueueJoinInput = z.infer<typeof queueJoinSchema>;

export const gameMoveSchema = z.object({
  gameId: z.string().min(1),
  /** Jugada en formato UCI: casilla origen + destino + pieza de coronación. */
  uci: z
    .string()
    .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, 'Jugada UCI inválida'),
});
export type GameMoveInput = z.infer<typeof gameMoveSchema>;

export const gameIdSchema = z.object({ gameId: z.string().min(1) });

export const drawResponseSchema = z.object({
  gameId: z.string().min(1),
  accept: z.boolean(),
});

export const chatSendSchema = z.object({
  gameId: z.string().min(1),
  body: z.string().trim().min(1).max(300),
});

export const tournamentIdSchema = z.object({ tournamentId: z.string().min(1) });

export interface ClientToServerEvents {
  'tournament:watch': (input: z.infer<typeof tournamentIdSchema>) => void;
  'tournament:unwatch': (input: z.infer<typeof tournamentIdSchema>) => void;
  'queue:join': (input: QueueJoinInput) => void;
  'queue:leave': () => void;
  'game:sync': (input: z.infer<typeof gameIdSchema>) => void;
  'game:move': (input: GameMoveInput) => void;
  'game:resign': (input: z.infer<typeof gameIdSchema>) => void;
  'game:offerDraw': (input: z.infer<typeof gameIdSchema>) => void;
  'game:respondDraw': (input: z.infer<typeof drawResponseSchema>) => void;
  'chat:send': (input: z.infer<typeof chatSendSchema>) => void;
}

/* ------------------------------------------------------------------ */
/* Servidor → cliente                                                   */
/* ------------------------------------------------------------------ */

export interface QueueStatusPayload {
  category: z.infer<typeof categorySchema>;
  timeControl: z.infer<typeof timeControlSchema>;
  waitingMs: number;
  ratingRange: { min: number; max: number };
  queued: number;
}

export interface MatchedPayload {
  gameId: string;
  color: Color;
}

export interface MoveAppliedPayload {
  gameId: string;
  move: MoveView;
  turn: Color;
  clocks: Record<Color, number>;
  turnStartedAt: number;
  /** Se limpia cualquier oferta de tablas pendiente al mover. */
  drawOfferFrom: Color | null;
}

export type SocketErrorCode =
  | 'UNAUTHENTICATED'
  | 'NOT_IN_GAME'
  | 'GAME_NOT_FOUND'
  | 'GAME_FINISHED'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'INVALID_INPUT'
  | 'ALREADY_QUEUED'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface SocketErrorPayload {
  code: SocketErrorCode;
  message: string;
}

export interface TournamentUpdatePayload {
  tournamentId: string;
  /** Motivo del aviso, para que el cliente sepa qué volver a pedir. */
  motivo: 'clasificacion' | 'ronda' | 'fin';
  ronda?: number;
}

export interface ServerToClientEvents {
  'tournament:update': (payload: TournamentUpdatePayload) => void;
  'queue:status': (payload: QueueStatusPayload) => void;
  'queue:matched': (payload: MatchedPayload) => void;
  'game:state': (payload: GameState) => void;
  'game:moveApplied': (payload: MoveAppliedPayload) => void;
  'game:drawOffered': (payload: { gameId: string; from: Color }) => void;
  'game:drawDeclined': (payload: { gameId: string }) => void;
  'game:over': (payload: GameOverPayload) => void;
  'chat:message': (payload: ChatMessage) => void;
  error: (payload: SocketErrorPayload) => void;
}

/** Datos que el middleware de autenticación cuelga de cada socket. */
export interface SocketData {
  userId: string;
  username: string;
  /** Partida que este socket está siguiendo, para soltarla al cambiar de una a otra. */
  watching?: string;
}

/**
 * Sala privada de la partida: sólo los dos jugadores. Por acá va el chat y las
 * ofertas de tablas, que son cosa entre ellos.
 */
export function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

/**
 * Sala pública: los jugadores y quien esté mirando. Por acá van las jugadas y el
 * final de la partida.
 *
 * Están separadas porque antes había una sola y, para que el chat no se filtrara,
 * el espectador no entraba a ninguna: veía la posición del momento en que abría
 * la página y después nada: hacía falta recargar para enterarse de cada jugada.
 */
export function watchRoom(gameId: string): string {
  return `watch:${gameId}`;
}

export function tournamentRoom(tournamentId: string): string {
  return `tournament:${tournamentId}`;
}
