export * from './puzzles.js';
export * from './lecciones.js';
export * from './mate.js';
export * from './openings.js';
import { Chess } from 'chess.js';
import type { Color, Termination } from '@gambito/shared';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square = string;

export interface PieceOnSquare {
  square: Square;
  type: PieceType;
  color: Color;
}

export interface LegalMove {
  from: Square;
  to: Square;
  san: string;
  uci: string;
  promotion?: PieceType;
  captured?: PieceType;
}

/** Cómo terminó una posición, o `null` si la partida sigue. */
export interface PositionOutcome {
  termination: Termination;
  /** Ganador, o `null` en tablas. */
  winner: Color | null;
}

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

/** Las 64 casillas en orden de lectura desde a8 hasta h1. */
export const SQUARES: readonly Square[] = RANKS.flatMap((rank) =>
  FILES.map((file) => `${file}${rank}`),
);

export function isLightSquare(square: Square): boolean {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}

function toColor(c: 'w' | 'b'): Color {
  return c === 'w' ? 'white' : 'black';
}

/**
 * Envoltorio de `chess.js`. Concentra todas las reglas en un solo lugar para que
 * el servidor y el navegador validen exactamente igual: el cliente lo usa para
 * dibujar jugadas legales y el servidor para decidir, que es lo que vale.
 */
export class ChessGame {
  private readonly chess: Chess;

  constructor(fen: string = STARTING_FEN) {
    this.chess = new Chess(fen);
  }

  static fromPgn(pgn: string): ChessGame {
    const game = new ChessGame();
    game.chess.loadPgn(pgn);
    return game;
  }

  fen(): string {
    return this.chess.fen();
  }

  pgn(): string {
    return this.chess.pgn();
  }

  turn(): Color {
    return toColor(this.chess.turn());
  }

  /** Número de medio-jugadas jugadas desde el inicio. */
  ply(): number {
    return this.chess.history().length;
  }

  inCheck(): boolean {
    return this.chess.inCheck();
  }

  /** Casilla del rey del color pedido, para marcar el jaque. */
  kingSquare(color: Color): Square | null {
    for (const piece of this.pieces()) {
      if (piece.type === 'k' && piece.color === color) return piece.square;
    }
    return null;
  }

  pieces(): PieceOnSquare[] {
    const out: PieceOnSquare[] = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell) out.push({ square: cell.square, type: cell.type, color: toColor(cell.color) });
      }
    }
    return out;
  }

  legalMoves(): LegalMove[] {
    return this.chess.moves({ verbose: true }).map((m) => ({
      from: m.from,
      to: m.to,
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion ?? ''}`,
      promotion: m.promotion as PieceType | undefined,
      captured: m.captured as PieceType | undefined,
    }));
  }

  /** Jugadas legales agrupadas por casilla de origen, que es como las consume el tablero. */
  legalMovesFrom(square: Square): LegalMove[] {
    return this.legalMoves().filter((m) => m.from === square);
  }

  /** `true` si mover de `from` a `to` obliga a elegir pieza de coronación. */
  needsPromotion(from: Square, to: Square): boolean {
    return this.legalMovesFrom(from).some((m) => m.to === to && m.promotion !== undefined);
  }

  /**
   * Aplica una jugada en UCI. Devuelve la jugada aplicada o `null` si es ilegal.
   * Nunca lanza: una jugada ilegal es un caso esperado, no un error del programa.
   */
  move(uci: string): LegalMove | null {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    try {
      const applied = this.chess.move({ from, to, promotion });
      return {
        from: applied.from,
        to: applied.to,
        san: applied.san,
        uci: `${applied.from}${applied.to}${applied.promotion ?? ''}`,
        promotion: applied.promotion as PieceType | undefined,
        captured: applied.captured as PieceType | undefined,
      };
    } catch {
      return null;
    }
  }

  history(): LegalMove[] {
    return this.chess.history({ verbose: true }).map((m) => ({
      from: m.from,
      to: m.to,
      san: m.san,
      uci: `${m.from}${m.to}${m.promotion ?? ''}`,
      promotion: m.promotion as PieceType | undefined,
      captured: m.captured as PieceType | undefined,
    }));
  }

  /**
   * Resultado de la posición actual. Sólo cubre los finales que decide el tablero:
   * el abandono y la caída de bandera los decide el servidor, no la posición.
   */
  outcome(): PositionOutcome | null {
    if (this.chess.isCheckmate()) {
      // Está en mate quien tiene el turno, así que gana el otro.
      return { termination: 'CHECKMATE', winner: this.turn() === 'white' ? 'black' : 'white' };
    }
    if (this.chess.isStalemate()) return { termination: 'STALEMATE', winner: null };
    if (this.chess.isThreefoldRepetition()) return { termination: 'THREEFOLD', winner: null };
    if (this.chess.isInsufficientMaterial())
      return { termination: 'INSUFFICIENT_MATERIAL', winner: null };
    if (this.chess.isDrawByFiftyMoves()) return { termination: 'FIFTY_MOVE', winner: null };
    return null;
  }

  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  setHeaders(headers: Record<string, string>): void {
    for (const [key, value] of Object.entries(headers)) {
      this.chess.setHeader(key, value);
    }
  }
}

/**
 * Posición inicial a la que se le sacan piezas, para las partidas con hándicap.
 *
 * Quitar una torre no es sólo borrarla del tablero: también hay que quitar el
 * enroque de ese lado, o la posición queda ilegal y chess.js la rechaza.
 */
export function startingPositionWithout(squares: Square[]): string {
  const chess = new Chess(STARTING_FEN);
  for (const square of squares) {
    chess.remove(square as never);
  }

  const parts = chess.fen().split(' ');
  const rookRights: Record<string, string> = { a1: 'Q', h1: 'K', a8: 'q', h8: 'k' };
  let castling = parts[2] ?? '-';

  for (const square of squares) {
    // Sacar un rey quita los dos enroques de ese color; sacar una torre, sólo el suyo.
    if (square === 'e1') castling = castling.replace(/[KQ]/g, '');
    else if (square === 'e8') castling = castling.replace(/[kq]/g, '');
    else {
      const right = rookRights[square];
      if (right) castling = castling.replace(right, '');
    }
  }

  parts[2] = castling === '' ? '-' : castling;
  return parts.join(' ');
}

/** Valor en peones de cada pieza, para el marcador de material capturado. */
export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export interface MaterialBalance {
  /** Piezas negras que capturaron las blancas. */
  capturedByWhite: PieceType[];
  capturedByBlack: PieceType[];
  /** Positivo = ventaja de las blancas. */
  advantage: number;
}

export function materialBalance(moves: Pick<LegalMove, 'captured' | 'uci'>[]): MaterialBalance {
  const capturedByWhite: PieceType[] = [];
  const capturedByBlack: PieceType[] = [];
  moves.forEach((move, index) => {
    if (!move.captured) return;
    // Las blancas juegan los medio-movimientos pares (0, 2, 4…).
    if (index % 2 === 0) capturedByWhite.push(move.captured);
    else capturedByBlack.push(move.captured);
  });
  const sum = (list: PieceType[]) => list.reduce((acc, p) => acc + PIECE_VALUE[p], 0);
  return {
    capturedByWhite,
    capturedByBlack,
    advantage: sum(capturedByWhite) - sum(capturedByBlack),
  };
}
