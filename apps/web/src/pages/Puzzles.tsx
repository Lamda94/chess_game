import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@gambito/ui';
import { ChessGame, TEMA_LABEL, mejorDefensa, type Tema } from '@gambito/chess-core';
import type { Color } from '@gambito/shared';
import { Board } from '../board/Board.js';
import { useGameBoard } from '../board/useGameBoard.js';
import { get, post } from '../api/client.js';

const BOARD_SIZE = 'min(500px, calc(100vh - 260px), calc(100vw - 32px))';

interface Puzzle {
  id: string;
  fen: string;
  mateEn: 1 | 2;
  tema: Tema;
  rating: number;
  pista: string;
}

interface Estadisticas {
  rating: number;
  solved: number;
  failed: number;
  streak: number;
  bestStreak: number;
}

type Estado = 'resolviendo' | 'bien' | 'mal' | 'resuelto';

export function Puzzles() {
  const queryClient = useQueryClient();
  const [fen, setFen] = useState<string | null>(null);
  const [restantes, setRestantes] = useState(1);
  const [estado, setEstado] = useState<Estado>('resolviendo');
  const [verPista, setVerPista] = useState(false);
  const [historial, setHistorial] = useState<string[]>([]);
  /**
   * Las estadísticas se llevan aparte de la consulta: cada intento devuelve las
   * actualizadas, y mostrarlas en el acto evita que el contador de fallos quede
   * viejo hasta que se pida el puzzle siguiente.
   */
  const [stats, setStats] = useState<Estadisticas | null>(null);
  const inicio = useRef(Date.now());

  const consulta = useQuery({
    queryKey: ['puzzle-actual'],
    queryFn: () => get<{ puzzle: Puzzle; stats: Estadisticas }>('/training/puzzles/next'),
  });

  const puzzle = consulta.data?.puzzle ?? null;

  // Cada puzzle nuevo reinicia el tablero y el cronómetro.
  useEffect(() => {
    if (!puzzle) return;
    setFen(puzzle.fen);
    setRestantes(puzzle.mateEn);
    setEstado('resolviendo');
    setVerPista(false);
    setHistorial([]);
    inicio.current = Date.now();
  }, [puzzle]);

  // Las del servidor mandan mientras no haya un intento más reciente.
  useEffect(() => {
    if (consulta.data?.stats) setStats(consulta.data.stats);
  }, [consulta.data?.stats]);

  const siguiente = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['puzzle-actual'] });
    void queryClient.invalidateQueries({ queryKey: ['puzzle-stats'] });
  }, [queryClient]);

  const alMover = useCallback(
    async (uci: string) => {
      if (!puzzle || !fen || estado === 'resuelto') return;

      const respuesta = await post<{
        correcta: boolean;
        completa: boolean;
        stats: Estadisticas;
      }>('/training/puzzles/attempt', {
        puzzleId: puzzle.id,
        uci,
        msTaken: Date.now() - inicio.current,
        restantes,
        fen,
      });

      setStats(respuesta.stats);

      if (!respuesta.correcta) {
        setEstado('mal');
        return;
      }

      const juego = new ChessGame(fen);
      const jugada = juego.move(uci);
      setHistorial((previo) => [...previo, jugada?.san ?? uci]);

      if (respuesta.completa) {
        setFen(juego.fen());
        setEstado('resuelto');
        void queryClient.invalidateQueries({ queryKey: ['puzzle-stats'] });
        return;
      }

      // Falta más de una jugada: responde el rival con su mejor defensa y sigue.
      const defensa = mejorDefensa(juego.fen());
      if (defensa) {
        const replica = juego.move(defensa);
        setHistorial((previo) => [...previo, replica?.san ?? defensa]);
      }
      setFen(juego.fen());
      setRestantes((r) => r - 1);
      setEstado('bien');
    },
    [estado, fen, puzzle, queryClient, restantes],
  );

  const reintentar = useCallback(() => {
    if (!puzzle) return;
    setFen(puzzle.fen);
    setRestantes(puzzle.mateEn);
    setEstado('resolviendo');
    setHistorial([]);
    inicio.current = Date.now();
  }, [puzzle]);

  const turno: Color | null = fen ? new ChessGame(fen).turn() : null;

  const board = useGameBoard({
    fen: fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    myColor: turno,
    interactive: estado !== 'resuelto' && fen !== null,
    onMove: (uci) => void alMover(uci),
  });

  if (consulta.isLoading || !puzzle || !fen) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Buscando un puzzle…" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-5 px-4 py-6 lg:flex-row lg:px-8">
      <div className="flex flex-1 flex-col items-center gap-3">
        <div className="flex flex-col gap-3" style={{ width: BOARD_SIZE }}>
          <div className="flex items-baseline justify-between">
            <span className="gb-mono text-[11px] tracking-[0.12em]" style={{ color: 'var(--accent-text)' }}>
              {TEMA_LABEL[puzzle.tema].toUpperCase()} · {puzzle.rating}
            </span>
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Juegan {turno === 'white' ? 'blancas' : 'negras'} y dan mate en {restantes}
            </span>
          </div>

          <Board board={board} orientation={turno ?? 'white'} size={BOARD_SIZE} />

          <div
            className="rounded-xl px-4 py-3 text-[13px]"
            role="status"
            style={
              estado === 'resuelto'
                ? { background: 'rgba(70,169,123,0.12)', border: '1px solid var(--success)', color: 'var(--success)' }
                : estado === 'mal'
                  ? { background: 'var(--danger-wash)', border: '1px solid var(--danger-wash-border)', color: 'var(--danger)' }
                  : estado === 'bien'
                    ? { background: 'var(--cool-wash)', border: '1px solid var(--cool-wash-border)', color: 'var(--cool)' }
                    : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }
            }
          >
            {estado === 'resuelto'
              ? '¡Mate! Puzzle resuelto.'
              : estado === 'mal'
                ? 'Esa jugada suelta el mate. Probá otra vez.'
                : estado === 'bien'
                  ? `Bien. El rival se defendió: ahora te queda mate en ${restantes}.`
                  : 'Encontrá la jugada que fuerza el mate.'}
          </div>

          <div className="flex flex-wrap gap-2">
            {estado === 'resuelto' ? (
              <Button variant="primary" block onClick={siguiente}>Puzzle siguiente</Button>
            ) : (
              <>
                <Button onClick={() => setVerPista(true)} disabled={verPista}>Ver pista</Button>
                <Button onClick={reintentar}>Reiniciar</Button>
                <Button onClick={siguiente}>Saltear</Button>
              </>
            )}
          </div>

          {verPista && estado !== 'resuelto' ? (
            <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {puzzle.pista}
            </p>
          ) : null}
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[280px]">
        <section className="gb-card flex flex-col gap-3">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            TU RATING DE PUZZLES
          </span>
          <span className="gb-mono text-[40px] font-bold leading-none" style={{ color: 'var(--accent-text)' }}>
            {stats?.rating ?? 1200}
          </span>
          <div className="flex justify-between text-[13px]" style={{ color: 'var(--text-muted)' }}>
            <span>{stats?.solved ?? 0} resueltos</span>
            <span>{stats?.failed ?? 0} fallados</span>
          </div>
          <span className="h-px" style={{ background: 'var(--border)' }} />
          <div className="flex justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="gb-display text-[24px] leading-none" style={{ color: 'var(--success)' }}>
                {stats?.streak ?? 0}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>racha actual</span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="gb-display text-[24px] leading-none">{stats?.bestStreak ?? 0}</span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>mejor racha</span>
            </div>
          </div>
        </section>

        {historial.length > 0 ? (
          <section className="gb-card flex flex-col gap-2">
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              SOLUCIÓN
            </span>
            <span className="gb-mono text-sm">{historial.join(' ')}</span>
          </section>
        ) : null}

        <Link to="/entrenamiento" className="gb-btn gb-btn--secondary gb-btn--block">
          Volver al salón
        </Link>
      </aside>
    </div>
  );
}
