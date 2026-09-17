import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@gambito/ui';
import { ChessGame, type Leccion, type RutaId } from '@gambito/chess-core';
import type { Color } from '@gambito/shared';
import { Board } from '../board/Board.js';
import { useGameBoard } from '../board/useGameBoard.js';
import { get, post } from '../api/client.js';

const BOARD_SIZE = 'min(420px, calc(100vw - 32px))';

interface RutaResumen {
  id: RutaId;
  nombre: string;
  descripcion: string;
  orden: number;
  lecciones: Array<{ slug: string; titulo: string; resumen: string; pasos: number; completada: boolean }>;
  completadas: number;
  total: number;
}

interface Rutas {
  rutas: RutaResumen[];
  progreso: { completadas: number; total: number; porcentaje: number };
}

interface EstadisticasPuzzle {
  rating: number;
  solved: number;
  failed: number;
  streak: number;
  bestStreak: number;
}

export function Entrenamiento() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const rutas = useQuery({ queryKey: ['rutas'], queryFn: () => get<Rutas>('/training/paths') });
  const puzzles = useQuery({
    queryKey: ['puzzle-stats'],
    queryFn: () => get<{ stats: EstadisticasPuzzle }>('/training/puzzles/next'),
  });

  const elegida = slug ?? rutas.data?.rutas.flatMap((r) => r.lecciones).find((l) => !l.completada)?.slug;

  if (rutas.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Cargando el salón…" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="gb-display m-0 text-[40px] leading-none">Salón de entrenamiento</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Cinco rutas, de las reglas del juego a la estrategia. Cada lección se resuelve sobre
            el tablero, no leyendo.
          </p>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col items-end gap-0.5">
            <span className="gb-display text-[30px] leading-none">
              {rutas.data?.progreso.porcentaje ?? 0} %
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>del programa</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="gb-display text-[30px] leading-none" style={{ color: 'var(--accent-text)' }}>
              {puzzles.data?.stats.bestStreak ?? 0}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>mejor racha</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Rutas */}
        <section className="gb-card flex flex-col gap-3.5">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            RUTAS DE APRENDIZAJE
          </span>
          {rutas.data?.rutas.map((ruta) => {
            const completa = ruta.completadas === ruta.total;
            return (
              <div
                key={ruta.id}
                className="flex flex-col gap-2.5 rounded-xl p-4"
                style={{
                  border: `1px solid ${completa ? 'var(--success)' : 'var(--border)'}`,
                  background: completa ? 'rgba(70, 169, 123, 0.08)' : 'var(--bg-elevated)',
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="gb-display text-[20px]">{ruta.nombre}</span>
                  <span
                    className="gb-mono text-xs"
                    style={{ color: completa ? 'var(--success)' : 'var(--accent)' }}
                  >
                    {ruta.completadas}/{ruta.total}
                  </span>
                </div>
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {ruta.descripcion}
                </span>
                <div className="flex flex-col gap-1">
                  {ruta.lecciones.map((leccion) => (
                    <button
                      key={leccion.slug}
                      type="button"
                      onClick={() => navigate(`/entrenamiento/${leccion.slug}`)}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]"
                      style={{
                        background: leccion.slug === elegida ? 'var(--accent-wash)' : 'transparent',
                        border: `1px solid ${leccion.slug === elegida ? 'var(--accent)' : 'transparent'}`,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px]"
                        style={{
                          background: leccion.completada ? 'var(--success)' : 'transparent',
                          border: leccion.completada ? 'none' : '1px solid var(--border-strong)',
                          color: 'var(--accent-ink)',
                        }}
                        aria-hidden="true"
                      >
                        {leccion.completada ? '✓' : ''}
                      </span>
                      {leccion.titulo}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* Lección */}
        {elegida ? <VistaLeccion slug={elegida} /> : (
          <section className="gb-card flex items-center justify-center">
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Elegí una lección de la izquierda.
            </span>
          </section>
        )}

        {/* Entrenador de táctica */}
        <aside className="flex flex-col gap-4">
          <section
            className="flex flex-col gap-3.5 rounded-2xl p-6"
            style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent)' }}
          >
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--accent-text)' }}>
              ENTRENADOR DE TÁCTICA
            </span>
            <div className="flex items-baseline gap-3">
              <span className="gb-mono text-[38px] font-bold leading-none">
                {puzzles.data?.stats.rating ?? 1200}
              </span>
              {(puzzles.data?.stats.streak ?? 0) > 0 ? (
                <span className="text-[13px]" style={{ color: 'var(--success)' }}>
                  racha de {puzzles.data!.stats.streak}
                </span>
              ) : null}
            </div>
            <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {puzzles.data
                ? `${puzzles.data.stats.solved} resueltos · ${puzzles.data.stats.failed} fallados`
                : 'Todavía no resolviste ninguno.'}
            </span>
            <Link to="/puzzles" className="gb-btn gb-btn--primary gb-btn--block">
              Resolver puzzles
            </Link>
          </section>

          <Logros />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lección                                                             */
/* ------------------------------------------------------------------ */

function VistaLeccion({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState(false);
  const [resuelto, setResuelto] = useState(false);

  const consulta = useQuery({
    queryKey: ['leccion', slug],
    queryFn: () => get<{ leccion: Leccion }>(`/training/lessons/${slug}`),
  });

  const completar = useMutation({
    mutationFn: () => post('/training/lessons/complete', { slug }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rutas'] });
      void queryClient.invalidateQueries({ queryKey: ['logros'] });
    },
  });

  // Cambiar de lección empieza de cero.
  useEffect(() => {
    setPaso(0);
    setError(false);
    setResuelto(false);
  }, [slug]);

  const leccion = consulta.data?.leccion;
  const actual = leccion?.pasos[paso];
  const ultimo = leccion ? paso === leccion.pasos.length - 1 : false;

  const avanzar = useCallback(() => {
    if (!leccion) return;
    setError(false);
    setResuelto(false);
    if (ultimo) {
      completar.mutate();
      return;
    }
    setPaso((p) => p + 1);
  }, [completar, leccion, ultimo]);

  const alMover = useCallback(
    (uci: string) => {
      if (!actual?.esperada) return;
      if (uci === actual.esperada) {
        setError(false);
        setResuelto(true);
      } else {
        setError(true);
      }
    },
    [actual],
  );

  // La posición mostrada avanza sola cuando la jugada fue la correcta.
  const fenMostrado = useMemo(() => {
    if (!actual) return undefined;
    if (!resuelto || !actual.esperada) return actual.fen;
    const juego = new ChessGame(actual.fen);
    juego.move(actual.esperada);
    return juego.fen();
  }, [actual, resuelto]);

  const board = useGameBoard({
    fen: fenMostrado ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    myColor: actual ? new ChessGame(actual.fen).turn() : null,
    interactive: Boolean(actual?.esperada) && !resuelto,
    onMove: alMover,
  });

  if (consulta.isLoading || !leccion || !actual) {
    return (
      <section className="gb-card flex items-center justify-center">
        <Spinner label="Cargando la lección…" />
      </section>
    );
  }

  const orientacion: Color = actual.orientacion ?? new ChessGame(actual.fen).turn();

  return (
    <section className="@container gb-card flex min-w-0 flex-col gap-4 self-start">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--accent-text)' }}>
            PASO {paso + 1} DE {leccion.pasos.length}
          </span>
          <h2 className="gb-display m-0 mt-1 text-[28px] leading-tight">{leccion.titulo}</h2>
        </div>
        {completar.isSuccess ? (
          <span className="gb-mono text-[11px]" style={{ color: 'var(--success)' }}>
            LECCIÓN COMPLETADA
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-5 @3xl:flex-row">
        <div className="flex shrink-0 flex-col gap-3" style={{ width: BOARD_SIZE }}>
          <Board board={board} orientation={orientacion} size={BOARD_SIZE} />
          {actual.esperada ? (
            <div
              className="rounded-xl px-4 py-3 text-[13px]"
              style={
                resuelto
                  ? { background: 'rgba(70,169,123,0.12)', border: '1px solid var(--success)', color: 'var(--success)' }
                  : error
                    ? { background: 'var(--danger-wash)', border: '1px solid var(--danger-wash-border)', color: 'var(--danger)' }
                    : { background: 'var(--accent-wash)', border: '1px solid var(--accent-wash-border)', color: 'var(--accent-soft)' }
              }
              role="status"
            >
              {resuelto
                ? '¡Esa es! Seguí con el paso siguiente.'
                : error
                  ? (actual.pista ?? 'No es esa. Probá de nuevo.')
                  : 'Hacé la jugada sobre el tablero.'}
            </div>
          ) : null}
        </div>

        {/* min-w-0: sin esto el texto no se deja encoger por debajo de su ancho
            natural y se desborda de la tarjeta, pisando la columna de al lado. */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <p className="m-0 text-[15px] leading-relaxed">{actual.texto}</p>
          <div className="flex-1" />
          <div className="flex gap-2">
            <Button disabled={paso === 0} onClick={() => { setPaso((p) => p - 1); setError(false); setResuelto(false); }}>
              Anterior
            </Button>
            <Button
              variant="primary"
              block
              disabled={Boolean(actual.esperada) && !resuelto}
              onClick={avanzar}
            >
              {ultimo ? 'Terminar la lección' : 'Siguiente paso'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Logros                                                              */
/* ------------------------------------------------------------------ */

function Logros() {
  const consulta = useQuery({
    queryKey: ['logros'],
    queryFn: () =>
      get<{ logros: Array<{ code: string; nombre: string; descripcion: string; obtenido: boolean }> }>(
        '/training/achievements',
      ),
  });

  const obtenidos = consulta.data?.logros.filter((l) => l.obtenido) ?? [];
  const pendientes = consulta.data?.logros.filter((l) => !l.obtenido) ?? [];

  return (
    <section className="gb-card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
          LOGROS
        </span>
        <span className="gb-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {obtenidos.length}/{consulta.data?.logros.length ?? 0}
        </span>
      </div>
      {[...obtenidos, ...pendientes].map((logro) => (
        <div
          key={logro.code}
          className="flex flex-col gap-0.5 rounded-xl px-3.5 py-2.5"
          style={{
            background: logro.obtenido ? 'var(--accent-wash)' : 'var(--bg-elevated)',
            border: `1px solid ${logro.obtenido ? 'var(--accent-wash-border)' : 'var(--border)'}`,
          }}
        >
          <span
            className="text-[13px]"
            style={{ color: logro.obtenido ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {logro.nombre}
          </span>
          <span className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
            {logro.descripcion}
          </span>
        </div>
      ))}
    </section>
  );
}
