import { Link } from 'react-router-dom';
import {
  BOARD_THEME_INFO,
  PIECE_SET_INFO,
  temaDelTablero,
  type BoardTheme,
  type PieceSet,
} from '@gambito/shared';
import type { PieceType } from '@gambito/chess-core';
import { Piece } from '../board/pieces.js';
import { useApariencia } from '../state/apariencia.js';

/**
 * Elegir piezas y tablero.
 *
 * Cada opción se muestra dibujada con sus propios colores y piezas: elegir un
 * tema por su nombre sería adivinar. La previsualización grande usa la misma
 * pieza que el tablero de verdad, así que lo que se ve acá es lo que se juega.
 */

/** Una fila de piezas sobre dos casillas, para juzgar el contraste real. */
function Muestra({
  set,
  tema,
  tamano = 34,
}: {
  set: PieceSet;
  tema: BoardTheme;
  tamano?: number;
}) {
  const { colores } = temaDelTablero(tema);
  const piezas: Array<[PieceType, 'white' | 'black']> = [
    ['k', 'white'],
    ['q', 'black'],
    ['n', 'white'],
    ['p', 'black'],
  ];
  return (
    <div className="flex overflow-hidden rounded-lg" style={{ border: '1px solid var(--border)' }}>
      {piezas.map(([tipo, color], i) => (
        <span
          key={`${tipo}${color}`}
          className="flex items-center justify-center"
          style={{
            width: tamano,
            height: tamano,
            // Alterna casilla clara y oscura: una pieza puede verse bien en una
            // y perderse en la otra.
            background: i % 2 === 0 ? colores.light : colores.dark,
          }}
        >
          <Piece type={tipo} color={color} set={set} size={tamano - 4} />
        </span>
      ))}
    </div>
  );
}

function Opcion({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className="flex w-full items-center gap-3 rounded-xl p-3 text-left"
      style={{
        background: activa ? 'var(--accent-wash)' : 'var(--bg-elevated)',
        border: `1px solid ${activa ? 'var(--accent)' : 'var(--border)'}`,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

export function Apariencia() {
  const { pieceSet, boardTheme, guardar, guardando } = useApariencia();

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="gb-display m-0 text-[28px]">Apariencia</h1>
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Se guarda en tu cuenta, así que te sigue a cualquier dispositivo.
        </p>
      </header>

      {/* Previsualización grande con lo elegido ahora mismo. */}
      <section className="gb-card flex flex-col items-center gap-3">
        <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
          ASÍ SE VE TU TABLERO
        </span>
        <Muestra set={pieceSet} tema={boardTheme} tamano={64} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="gb-display m-0 text-[19px]">Piezas</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {PIECE_SET_INFO.map((info) => (
            <Opcion
              key={info.id}
              activa={pieceSet === info.id}
              onClick={() => void guardar({ pieceSet: info.id })}
            >
              {/* Cada juego se muestra sobre el tablero que la persona ya eligió. */}
              <Muestra set={info.id} tema={boardTheme} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{info.label}</span>
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  {info.descripcion}
                </span>
              </span>
            </Opcion>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="gb-display m-0 text-[19px]">Tablero</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {BOARD_THEME_INFO.map((info) => (
            <Opcion
              key={info.id}
              activa={boardTheme === info.id}
              onClick={() => void guardar({ boardTheme: info.id })}
            >
              <Muestra set={pieceSet} tema={info.id} />
              <span className="text-sm font-medium">{info.label}</span>
            </Opcion>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Link to="/perfil" className="gb-btn gb-btn--secondary">
          Volver al perfil
        </Link>
        {guardando ? (
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Guardando…
          </span>
        ) : null}
      </div>
    </div>
  );
}
