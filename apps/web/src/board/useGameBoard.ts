import { useCallback, useMemo, useState } from 'react';
import { ChessGame, type LegalMove, type PieceType, type Square } from '@gambito/chess-core';
import type { Color } from '@gambito/shared';

export interface UseGameBoardOptions {
  fen: string;
  /** Color del jugador, o `null` si sólo está mirando. */
  myColor: Color | null;
  /** `false` congela el tablero: partida terminada, turno del rival, etc. */
  interactive: boolean;
  onMove: (uci: string) => void;
}

export interface PendingPromotion {
  from: Square;
  to: Square;
}

export interface GameBoard {
  game: ChessGame;
  turn: Color;
  selected: Square | null;
  /** Destinos legales de la pieza seleccionada, y si cada uno es captura. */
  targets: Map<Square, boolean>;
  checkedKing: Square | null;
  promotion: PendingPromotion | null;
  selectSquare: (square: Square) => void;
  clearSelection: () => void;
  resolvePromotion: (piece: PieceType) => void;
  cancelPromotion: () => void;
  /** Para arrastrar y soltar: valida antes de aplicar. */
  tryMove: (from: Square, to: Square) => void;
}

/**
 * Toda la lógica de interacción del tablero en un solo lugar. El componente que
 * dibuja no sabe nada de reglas, y esto no sabe nada de cómo se ve: por eso lo
 * pueden reusar la partida en vivo, la práctica contra la IA y las lecciones.
 */
export function useGameBoard({
  fen,
  myColor,
  interactive,
  onMove,
}: UseGameBoardOptions): GameBoard {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);

  const game = useMemo(() => new ChessGame(fen), [fen]);
  const turn = game.turn();
  const myTurn = interactive && myColor !== null && myColor === turn;

  const legal: LegalMove[] = useMemo(() => (myTurn ? game.legalMoves() : []), [game, myTurn]);

  const targets = useMemo(() => {
    const map = new Map<Square, boolean>();
    if (!selected) return map;
    for (const move of legal) {
      if (move.from === selected) map.set(move.to, move.captured !== undefined);
    }
    return map;
  }, [legal, selected]);

  const checkedKing = useMemo(
    () => (game.inCheck() ? game.kingSquare(turn) : null),
    [game, turn],
  );

  const clearSelection = useCallback(() => setSelected(null), []);

  const commit = useCallback(
    (from: Square, to: Square) => {
      // Una coronación necesita que el jugador elija pieza antes de mandar nada.
      if (game.needsPromotion(from, to)) {
        setPromotion({ from, to });
        setSelected(null);
        return;
      }
      onMove(`${from}${to}`);
      setSelected(null);
    },
    [game, onMove],
  );

  const tryMove = useCallback(
    (from: Square, to: Square) => {
      if (!myTurn) return;
      const allowed = legal.some((move) => move.from === from && move.to === to);
      if (!allowed) {
        // Soltar sobre una casilla inválida deselecciona, no deja nada a medias.
        setSelected(null);
        return;
      }
      commit(from, to);
    },
    [commit, legal, myTurn],
  );

  const selectSquare = useCallback(
    (square: Square) => {
      if (!myTurn) return;

      if (selected && targets.has(square)) {
        commit(selected, square);
        return;
      }

      const piece = game.pieces().find((p) => p.square === square);
      if (piece && piece.color === myColor) {
        // Tocar de nuevo la misma pieza la suelta.
        setSelected((current) => (current === square ? null : square));
        return;
      }
      setSelected(null);
    },
    [commit, game, myColor, myTurn, selected, targets],
  );

  const resolvePromotion = useCallback(
    (piece: PieceType) => {
      if (!promotion) return;
      onMove(`${promotion.from}${promotion.to}${piece}`);
      setPromotion(null);
    },
    [onMove, promotion],
  );

  const cancelPromotion = useCallback(() => setPromotion(null), []);

  return {
    game,
    turn,
    selected,
    targets,
    checkedKing,
    promotion,
    selectSquare,
    clearSelection,
    resolvePromotion,
    cancelPromotion,
    tryMove,
  };
}
