import { useMemo, useRef, useState } from 'react';
import { FILES, RANKS, isLightSquare, type PieceType, type Square } from '@gambito/chess-core';
import type { Color } from '@gambito/shared';
import { Piece, pieceName } from './pieces.js';
import type { GameBoard } from './useGameBoard.js';
import './board.css';

export interface BoardProps {
  board: GameBoard;
  /** Desde qué lado se mira. Las negras ven su primera fila abajo. */
  orientation: Color;
  lastMove?: { from: Square; to: Square } | null;
  /**
   * Lado del tablero como longitud CSS. Acepta una expresión con `min()` para
   * que el tablero se achique solo antes que salirse de la pantalla.
   */
  size?: string;
  showCoordinates?: boolean;
}

const PROMOTION_CHOICES: PieceType[] = ['q', 'r', 'b', 'n'];

export function Board({
  board,
  orientation,
  lastMove,
  size = 'min(560px, calc(100vw - 32px))',
  showCoordinates = true,
}: BoardProps) {
  const [dragging, setDragging] = useState<Square | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // Todo el tamaño cuelga de una variable CSS: las casillas y las piezas se
  // derivan de ella, así el tablero es fluido sin medir nada en JavaScript.
  const sized = { '--gb-board': size } as React.CSSProperties;

  const files = orientation === 'white' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'white' ? RANKS : [...RANKS].reverse();

  const pieces = useMemo(() => {
    const map = new Map<Square, { type: PieceType; color: Color }>();
    for (const piece of board.game.pieces()) {
      map.set(piece.square, { type: piece.type, color: piece.color });
    }
    return map;
  }, [board.game]);

  return (
    <div className="gb-board-wrap" style={sized}>
      <div
        ref={boardRef}
        className="gb-board"
        role="grid"
        aria-label="Tablero de ajedrez"
      >
        {ranks.map((rank) => (
          <div className="gb-board__row" role="row" key={rank}>
            {files.map((file) => {
              const id = `${file}${rank}` as Square;
              const piece = pieces.get(id);
              const isTarget = board.targets.has(id);
              const isCapture = board.targets.get(id) === true;
              const isLast = lastMove?.from === id || lastMove?.to === id;

              const description = piece
                ? `${id}, ${pieceName(piece.type, piece.color)}`
                : `${id}, vacía`;

              return (
                <button
                  key={id}
                  type="button"
                  role="gridcell"
                  aria-label={description}
                  aria-selected={board.selected === id}
                  className={[
                    'gb-square',
                    isLightSquare(id) ? 'gb-square--light' : 'gb-square--dark',
                    isLast ? 'gb-square--last' : '',
                    board.selected === id ? 'gb-square--selected' : '',
                    board.checkedKing === id ? 'gb-square--check' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => board.selectSquare(id)}
                  onDragOver={(event) => {
                    if (dragging) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging) board.tryMove(dragging, id);
                    setDragging(null);
                  }}
                >
                  {showCoordinates && file === files[0] ? (
                    <span className="gb-square__rank">{rank}</span>
                  ) : null}
                  {showCoordinates && rank === ranks[7] ? (
                    <span className="gb-square__file">{file}</span>
                  ) : null}

                  {isTarget ? (
                    <span className={isCapture ? 'gb-square__capture' : 'gb-square__dot'} />
                  ) : null}

                  {piece ? (
                    <span
                      className="gb-square__piece"
                      draggable={board.selected === id || true}
                      onDragStart={() => {
                        setDragging(id);
                        board.selectSquare(id);
                      }}
                      onDragEnd={() => setDragging(null)}
                    >
                      <Piece type={piece.type} color={piece.color} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {board.promotion ? (
        <div className="gb-promotion" role="dialog" aria-label="Elegí la pieza de coronación">
          <div className="gb-promotion__panel">
            <span className="gb-promotion__title">Coronás a</span>
            <div className="gb-promotion__choices">
              {PROMOTION_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className="gb-promotion__choice"
                  onClick={() => board.resolvePromotion(choice)}
                  aria-label={pieceName(choice, board.turn)}
                >
                  <Piece type={choice} color={board.turn} size={52} />
                </button>
              ))}
            </div>
            <button type="button" className="gb-promotion__cancel" onClick={board.cancelPromotion}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
