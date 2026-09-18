import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Button, Clock, RatingBadge } from '@gambito/ui';
import {
  CATEGORY_LABEL,
  TERMINATION_LABEL,
  formatTimeControl,
  outcomeFor,
  type ChatMessage,
  type Color,
  type GameOverPayload,
  type GameState,
} from '@gambito/shared';
import { materialBalance } from '@gambito/chess-core';
import { Board } from '../board/Board.js';
import { useGameBoard } from '../board/useGameBoard.js';
import { Piece } from '../board/pieces.js';
import { useSession } from '../state/session.js';
import { useSocket } from '../state/socket.js';

/**
 * Lado del tablero. El descuento de 268 px es el alto del encabezado, las dos
 * barras de jugador y los espacios: garantiza que la partida entre entera en
 * pantallas de 720 px sin que haya que desplazar.
 */
const BOARD_SIZE = 'min(560px, calc(100vh - 268px), calc(100vw - 32px))';

/** Relojes recibidos del servidor más el instante local en que llegaron. */
interface ClockSnapshot {
  clocks: Record<Color, number>;
  running: Color | null;
  receivedAt: number;
}

export function Partida() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const { socket, connected } = useSocket();

  const [state, setState] = useState<GameState | null>(null);
  const [over, setOver] = useState<GameOverPayload | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ClockSnapshot | null>(null);
  const [, forceTick] = useState(0);
  const chatEnd = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------ */
  /* Sincronización con el servidor                                      */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (!socket || !connected || !id) return;

    const onState = (payload: GameState) => {
      setState(payload);
      setSnapshot({
        clocks: payload.clocks,
        running: payload.status === 'ACTIVE' ? payload.turn : null,
        receivedAt: Date.now(),
      });
    };

    const onMove: Parameters<typeof socket.on<'game:moveApplied'>>[1] = (payload) => {
      setState((current) =>
        current
          ? {
              ...current,
              fen: payload.move.fenAfter,
              moves: [...current.moves, payload.move],
              turn: payload.turn,
              clocks: payload.clocks,
              drawOfferFrom: payload.drawOfferFrom,
            }
          : current,
      );
      setSnapshot({ clocks: payload.clocks, running: payload.turn, receivedAt: Date.now() });
      setNotice(null);
    };

    socket.on('game:state', onState);
    socket.on('game:moveApplied', onMove);
    socket.on('game:over', (payload) => {
      setOver(payload);
      setState((current) =>
        current ? { ...current, status: 'FINISHED', result: payload.result, termination: payload.termination } : current,
      );
      setSnapshot((current) => (current ? { ...current, running: null } : current));
    });
    socket.on('game:drawOffered', ({ from }) =>
      setState((current) => (current ? { ...current, drawOfferFrom: from } : current)),
    );
    socket.on('game:drawDeclined', () => {
      setState((current) => (current ? { ...current, drawOfferFrom: null } : current));
      setNotice('Tu oferta de tablas fue rechazada.');
    });
    socket.on('chat:message', (message) => setMessages((list) => [...list, message]));
    socket.on('error', ({ message }) => setNotice(message));

    socket.emit('game:sync', { gameId: id });

    return () => {
      socket.off('game:state', onState);
      socket.off('game:moveApplied', onMove);
      socket.off('game:over');
      socket.off('game:drawOffered');
      socket.off('game:drawDeclined');
      socket.off('chat:message');
      socket.off('error');
    };
  }, [socket, connected, id]);

  // El reloj se dibuja contando desde el último dato del servidor, no desde la
  // hora local: así un reloj desfasado del sistema no altera lo que se ve.
  useEffect(() => {
    if (!snapshot?.running) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 100);
    return () => clearInterval(timer);
  }, [snapshot?.running]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const myColor: Color | null = useMemo(() => {
    if (!state || !user) return null;
    if (state.white.id === user.id) return 'white';
    if (state.black.id === user.id) return 'black';
    return null;
  }, [state, user]);

  const sendMove = useCallback(
    (uci: string) => socket?.emit('game:move', { gameId: id, uci }),
    [socket, id],
  );

  const board = useGameBoard({
    fen: state?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    myColor,
    interactive: state?.status === 'ACTIVE' && myColor !== null,
    onMove: sendMove,
  });

  if (!state) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--text-muted)' }}>Cargando la partida…</span>
      </div>
    );
  }

  const orientation: Color = myColor ?? 'white';
  const opponentSide: Color = orientation === 'white' ? 'black' : 'white';
  const lastMove = state.moves.at(-1);
  const lastSquares = lastMove
    ? { from: lastMove.uci.slice(0, 2), to: lastMove.uci.slice(2, 4) }
    : null;

  function displayed(color: Color): number {
    if (!snapshot) return state!.clocks[color];
    const base = snapshot.clocks[color];
    if (snapshot.running !== color) return base;
    return Math.max(0, base - (Date.now() - snapshot.receivedAt));
  }

  const balance = materialBalance(
    state.moves.map((move) => ({ uci: move.uci, captured: undefined })),
  );
  void balance; // el detalle de capturas llega con el visor de análisis (Fase 2)

  const pairs: Array<[number, string, string | null]> = [];
  for (let i = 0; i < state.moves.length; i += 2) {
    pairs.push([i / 2 + 1, state.moves[i]!.san, state.moves[i + 1]?.san ?? null]);
  }

  const canOfferDraw = state.status === 'ACTIVE' && myColor !== null && state.drawOfferFrom !== myColor;
  const pendingOffer = state.drawOfferFrom !== null && state.drawOfferFrom !== myColor;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-5 px-4 py-5 lg:flex-row lg:px-8">
      {/* Tablero. Una sola medida gobierna el tablero y las dos barras, para que
          queden alineados y para que el conjunto se achique antes de desbordar. */}
      <div className="flex flex-1 flex-col items-center gap-3">
        <div className="flex flex-col gap-3" style={{ width: BOARD_SIZE }}>
          <PlayerBar
            state={state}
            side={opponentSide}
            clockMs={displayed(opponentSide)}
            active={state.status === 'ACTIVE' && state.turn === opponentSide}
          />
          <Board
            board={board}
            orientation={orientation}
            lastMove={lastSquares}
            size={BOARD_SIZE}
          />
          <PlayerBar
            state={state}
            side={orientation}
            clockMs={displayed(orientation)}
            active={state.status === 'ACTIVE' && state.turn === orientation}
            // Sólo si quien mira es de verdad ese jugador: a un espectador se le
            // marcaba como "vos" al de abajo, que no es nadie suyo.
            you={myColor !== null}
          />
        </div>
      </div>

      {/* Panel */}
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
        <div className="gb-card flex items-center justify-between">
          <span className="gb-mono text-[11px] tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
            {CATEGORY_LABEL[state.category]} {formatTimeControl(state.timeControl)}
            {state.rated ? ' · CLASIFICATORIA' : ' · AMISTOSA'}
          </span>
        </div>

        {over ? (
          <div className="gb-card flex flex-col gap-3" style={{ borderColor: 'var(--accent)' }}>
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--accent-text)' }}>
              {TERMINATION_LABEL[over.termination].toUpperCase()}
            </span>
            <div className="flex items-end justify-between gap-4">
              <h2 className="gb-display m-0 text-[40px] leading-none">
                {myColor === null
                  ? over.result === 'DRAW'
                    ? 'Tablas'
                    : `Ganan las ${over.result === 'WHITE' ? 'blancas' : 'negras'}`
                  : { win: 'Ganaste', loss: 'Perdiste', draw: 'Tablas' }[outcomeFor(over.result, myColor)]}
              </h2>
              {over.ratingDelta && myColor ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className="gb-mono text-[28px] font-bold leading-none"
                    style={{
                      color:
                        over.ratingDelta[myColor] > 0
                          ? 'var(--success)'
                          : over.ratingDelta[myColor] < 0
                            ? 'var(--danger)'
                            : 'var(--text-muted)',
                    }}
                  >
                    {over.ratingDelta[myColor] > 0 ? '+' : ''}
                    {over.ratingDelta[myColor]}
                  </span>
                  <span className="gb-mono text-[12px]" style={{ color: 'var(--text-muted)' }}>
                    {state.status === 'FINISHED' && over.ratingAfter
                      ? `${over.ratingAfter[myColor] - over.ratingDelta[myColor]} → ${over.ratingAfter[myColor]}`
                      : null}
                  </span>
                </div>
              ) : null}
            </div>
            {!state.rated ? (
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Partida amistosa: no cuenta para el rating.
              </span>
            ) : null}
            <div className="flex gap-2">
              <Link to={`/analisis/${id}`} className="gb-btn gb-btn--primary" style={{ flex: 1 }}>
                Analizar partida
              </Link>
              <Link to="/" className="gb-btn gb-btn--secondary" style={{ flex: 1 }}>
                Volver al lobby
              </Link>
            </div>
          </div>
        ) : null}

        {notice ? (
          <div
            className="rounded-xl px-4 py-3 text-[13px]"
            style={{ background: 'var(--danger-wash)', border: '1px solid var(--danger-wash-border)', color: 'var(--danger)' }}
            role="status"
          >
            {notice}
          </div>
        ) : null}

        {pendingOffer ? (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--cool-wash)', border: '1px solid var(--cool-wash-border)' }}
            role="status"
          >
            <span className="flex-1 text-[13px]" style={{ color: 'var(--cool)' }}>
              Te ofrecen tablas
            </span>
            <Button onClick={() => socket?.emit('game:respondDraw', { gameId: id, accept: true })}>
              Aceptar
            </Button>
            <Button
              variant="ghost"
              onClick={() => socket?.emit('game:respondDraw', { gameId: id, accept: false })}
            >
              Rechazar
            </Button>
          </div>
        ) : null}

        {/* Jugadas */}
        <div className="gb-card flex min-h-[220px] flex-1 flex-col gap-2 overflow-hidden">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            JUGADAS
          </span>
          <div className="flex flex-1 flex-col overflow-auto">
            {pairs.length === 0 ? (
              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Todavía no se jugó nada.
              </span>
            ) : (
              pairs.map(([number, white, black], index) => (
                <div
                  key={number}
                  className="flex items-center gap-3 rounded-[7px] px-2.5 py-1.5"
                  style={index === pairs.length - 1 ? { background: 'var(--bg-elevated)' } : undefined}
                >
                  <span className="gb-mono w-7 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {number}.
                  </span>
                  <span className="gb-mono w-[74px] text-sm">{white}</span>
                  <span className="gb-mono w-[74px] text-sm">{black ?? '…'}</span>
                </div>
              ))
            )}
          </div>

          {state.status === 'ACTIVE' && myColor ? (
            <div className="flex gap-2">
              <Button
                block
                disabled={!canOfferDraw}
                onClick={() => socket?.emit('game:offerDraw', { gameId: id })}
              >
                Ofrecer tablas
              </Button>
              <Button
                variant="danger"
                block
                onClick={() => {
                  if (confirm('¿Seguro que querés rendirte?')) {
                    socket?.emit('game:resign', { gameId: id });
                  }
                }}
              >
                Rendirse
              </Button>
            </div>
          ) : null}
        </div>

        {/* Chat */}
        {myColor ? (
          <div className="gb-card flex h-[220px] flex-col gap-2">
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              CHAT
            </span>
            <div className="flex flex-1 flex-col gap-2 overflow-auto">
              {messages.map((message) => (
                <div key={message.id} className="flex flex-col gap-0.5">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {message.from}
                  </span>
                  <span className="text-[13px]">{message.body}</span>
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const body = draft.trim();
                if (!body) return;
                socket?.emit('chat:send', { gameId: id, body });
                setDraft('');
              }}
            >
              <label htmlFor="chat" className="sr-only">
                Mensaje
              </label>
              <input
                id="chat"
                className="gb-input"
                style={{ height: 40 }}
                placeholder="Escribir mensaje…"
                maxLength={300}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </form>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function PlayerBar({
  state,
  side,
  clockMs,
  active,
  you,
}: {
  state: GameState;
  side: Color;
  clockMs: number;
  active: boolean;
  you?: boolean;
}) {
  const player = state[side];
  return (
    <div className="flex w-full items-center gap-3">
      <Avatar username={player.username} url={player.avatarUrl} size={40} status={active ? 'playing' : 'offline'} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">
          {player.username}
          {you ? <span style={{ color: 'var(--accent-text)', fontSize: 12 }}> · vos</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <RatingBadge rating={player.rating} provisional={player.provisional} />
          <span className="flex h-4 w-4 items-center justify-center" aria-hidden="true">
            <Piece type="k" color={side} size={16} />
          </span>
        </span>
      </div>
      <div className="flex-1" />
      <div className="w-[150px]">
        <Clock label={active ? 'Juega' : ''} ms={clockMs} active={active} />
      </div>
    </div>
  );
}
