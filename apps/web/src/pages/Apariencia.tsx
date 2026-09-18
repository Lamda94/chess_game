import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BOARD_THEME_INFO,
  PIECE_SET_INFO,
  temaDelTablero,
  type BoardTheme,
  type PieceSet,
} from '@gambito/shared';
import { ChessGame } from '@gambito/chess-core';
import { Piece } from '../board/pieces.js';
import { useApariencia } from '../state/apariencia.js';

/**
 * Elegir piezas y tablero.
 *
 * El tablero de arriba es una previsualización de verdad: mismas piezas y mismos
 * colores que en partida, con la posición inicial completa. Elegir por el nombre
 * de un tema sería adivinar, y una pieza puede verse bien contra una casilla y
 * perderse contra la otra.
 */

/** Posición inicial, calculada una sola vez. */
const INICIAL = new ChessGame().pieces();

function TableroMuestra({ set, tema }: { set: PieceSet; tema: BoardTheme }) {
  const { colores } = temaDelTablero(tema);
  const ocupa = new Map(INICIAL.map((p) => [p.square, p]));
  const filas = [8, 7, 6, 5, 4, 3, 2, 1];
  const columnas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  return (
    <div
      className="grid w-full overflow-hidden rounded-xl"
      style={{ gridTemplateColumns: 'repeat(8, 1fr)', border: '1px solid var(--border)' }}
      aria-hidden="true"
    >
      {filas.map((fila, i) =>
        columnas.map((columna, j) => {
          const id = `${columna}${fila}`;
          const pieza = ocupa.get(id as never);
          return (
            <span
              key={id}
              className="flex items-center justify-center"
              style={{ aspectRatio: '1', background: (i + j) % 2 === 0 ? colores.light : colores.dark }}
            >
              {pieza ? (
                <span style={{ width: '88%', height: '88%' }}>
                  <Piece type={pieza.type} color={pieza.color} set={set} />
                </span>
              ) : null}
            </span>
          );
        }),
      )}
    </div>
  );
}

function Miniatura({
  activa,
  etiqueta,
  fondo,
  onClick,
  children,
}: {
  activa: boolean;
  etiqueta: string;
  /** Sobre qué se dibuja. Para las piezas, la casilla del tablero elegido. */
  fondo?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      aria-label={etiqueta}
      title={etiqueta}
      className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl p-1.5"
      style={{
        background: fondo ?? 'var(--bg-elevated)',
        // El anillo de selección va por fuera del borde para que no mueva el
        // contenido al elegir: con `border` la miniatura saltaría un píxel.
        border: '1px solid var(--border)',
        outline: activa ? '2px solid var(--accent)' : 'none',
        outlineOffset: '-2px',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

type Pestana = 'piezas' | 'tablero';

export function Apariencia() {
  const { pieceSet, boardTheme, guardar, guardando } = useApariencia();
  const [pestana, setPestana] = useState<Pestana>('piezas');

  const juego = PIECE_SET_INFO.find((p) => p.id === pieceSet);
  const nombreActual =
    pestana === 'piezas'
      ? (juego?.label ?? '')
      : (BOARD_THEME_INFO.find((t) => t.id === boardTheme)?.label ?? '');

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-1 flex-col gap-4 px-4 py-5">
      <header className="flex items-center gap-3">
        <Link
          to="/"
          aria-label="Volver"
          className="flex h-9 w-9 items-center justify-center rounded-[10px]"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <h1 className="gb-display m-0 flex-1 text-center text-[22px]">Apariencia</h1>
        <span className="w-9 text-right text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {guardando ? '···' : ''}
        </span>
      </header>

      <TableroMuestra set={pieceSet} tema={boardTheme} />

      {/* Pestañas */}
      <div role="tablist" className="flex gap-6" style={{ borderBottom: '1px solid var(--border)' }}>
        {([['piezas', 'Piezas'], ['tablero', 'Tablero']] as const).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className="pb-2.5 text-[15px]"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: pestana === id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: pestana === id ? 600 : 400,
              borderBottom: `2px solid ${pestana === id ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {texto}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {nombreActual}
        </p>
        {/*
          Las piezas son obra de otras personas y varias licencias exigen
          acreditarlas. Se nombra al autor de la que está puesta, que es donde
          corresponde verlo.
        */}
        {pestana === 'piezas' && juego ? (
          <p className="m-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            por {juego.autor} · {juego.licencia}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {pestana === 'piezas'
          ? PIECE_SET_INFO.map((info) => (
              <Miniatura
                key={info.id}
                activa={pieceSet === info.id}
                etiqueta={info.label}
                // Sobre la casilla del tablero que ya eligió: una pieza clara
                // puede verse bien sobre un fondo neutro y perderse en el tablero.
                fondo={temaDelTablero(boardTheme).colores.light}
                onClick={() => void guardar({ pieceSet: info.id })}
              >
                {/* Un caballo, que es la pieza donde más se nota el estilo. */}
                <Piece type="n" color="white" set={info.id} />
              </Miniatura>
            ))
          : BOARD_THEME_INFO.map((info) => (
              <Miniatura
                key={info.id}
                activa={boardTheme === info.id}
                etiqueta={info.label}
                onClick={() => void guardar({ boardTheme: info.id })}
              >
                <span
                  className="grid h-full w-full overflow-hidden rounded-md"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <span style={{ background: info.colores.light }} />
                  <span style={{ background: info.colores.dark }} />
                  <span style={{ background: info.colores.dark }} />
                  <span style={{ background: info.colores.light }} />
                </span>
              </Miniatura>
            ))}
      </div>

      <p className="m-0 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Se guarda en tu cuenta: te sigue a cualquier dispositivo.{' '}
        <a href="/piece/LICENCIAS.md" target="_blank" rel="noreferrer noopener">
          Autores y licencias de las piezas
        </a>
        .
      </p>
    </div>
  );
}
