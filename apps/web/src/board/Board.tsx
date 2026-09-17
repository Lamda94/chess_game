import { useMemo, useRef, useState } from 'react';
import { FILES, RANKS, isLightSquare, type PieceType, type Square } from '@gambito/chess-core';
import type { Color } from '@gambito/shared';
import { Piece, pieceName } from './pieces.js';
import { useApariencia } from '../state/apariencia.js';
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
  /** Flechas dibujadas encima del tablero, para señalar jugadas sugeridas. */
  arrows?: Array<{ from: Square; to: Square; color?: string }>;
}

const PROMOTION_CHOICES: PieceType[] = ['q', 'r', 'b', 'n'];

export function Board({
  board,
  orientation,
  lastMove,
  size = 'min(560px, calc(100vw - 32px))',
  showCoordinates = true,
  arrows = [],
}: BoardProps) {
  const [dragging, setDragging] = useState<Square | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const { pieceSet } = useApariencia();

  /**
   * Navegación por teclado. Cada casilla ya es un botón, así que el tabulador
   * pasaría por las 64 de a una: las flechas mueven el foco por el tablero y el
   * tabulador salta afuera, que es como se espera que funcione una grilla.
   */
  const alPresionar = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    const teclas: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const paso = teclas[evento.key];
    if (!paso) return;

    const actual = document.activeElement as HTMLElement | null;
    const casillas = Array.from(
      boardRef.current?.querySelectorAll<HTMLButtonElement>('[role="gridcell"]') ?? [],
    );
    const indice = actual ? casillas.indexOf(actual as HTMLButtonElement) : -1;
    if (indice === -1) {
      casillas[0]?.focus();
      evento.preventDefault();
      return;
    }

    const columna = indice % 8;
    const fila = Math.floor(indice / 8);
    const siguienteColumna = Math.min(7, Math.max(0, columna + paso[0]));
    const siguienteFila = Math.min(7, Math.max(0, fila + paso[1]));
    casillas[siguienteFila * 8 + siguienteColumna]?.focus();
    evento.preventDefault();
  };
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
        aria-label="Tablero de ajedrez. Movete con las flechas y jugá con Enter."
        onKeyDown={alPresionar}
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
                  tabIndex={file === files[0] && rank === ranks[0] ? 0 : -1}
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
                      <Piece type={piece.type} color={piece.color} set={pieceSet} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {arrows.length > 0 ? <CapaFlechas arrows={arrows} orientation={orientation} /> : null}

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
                  <Piece type={choice} color={board.turn} size={52} set={pieceSet} />
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

/**
 * Flechas encima del tablero. Se dibujan en un SVG de 8×8 unidades para que el
 * cálculo sea el mismo a cualquier tamaño: una casilla es exactamente 1 unidad.
 */
function CapaFlechas({
  arrows,
  orientation,
}: {
  arrows: NonNullable<BoardProps['arrows']>;
  orientation: Color;
}) {
  const centro = (square: Square): [number, number] => {
    const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
    const rank = Number(square[1]);
    const x = orientation === 'white' ? file : 7 - file;
    const y = orientation === 'white' ? 8 - rank : rank - 1;
    return [x + 0.5, y + 0.5];
  };

  return (
    <svg className="gb-board__arrows" viewBox="0 0 8 8" aria-hidden="true">
      <defs>
        <marker
          id="gb-punta"
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="3.2"
          markerHeight="3.2"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {arrows.map((flecha, indice) => {
        const [x1, y1] = centro(flecha.from);
        const [x2, y2] = centro(flecha.to);
        // La flecha arranca un poco fuera del centro para no tapar la pieza.
        const dx = x2 - x1;
        const dy = y2 - y1;
        const largo = Math.hypot(dx, dy) || 1;
        const recorte = 0.3;
        return (
          <line
            key={`${flecha.from}${flecha.to}${indice}`}
            x1={x1 + (dx / largo) * recorte}
            y1={y1 + (dy / largo) * recorte}
            x2={x2 - (dx / largo) * recorte}
            y2={y2 - (dy / largo) * recorte}
            stroke={flecha.color ?? 'var(--cool)'}
            strokeWidth="0.16"
            strokeLinecap="round"
            markerEnd="url(#gb-punta)"
            opacity="0.85"
          />
        );
      })}
    </svg>
  );
}
