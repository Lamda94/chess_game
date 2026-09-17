import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Spinner } from '@gambito/ui';
import { ChessGame, STARTING_FEN, identifyOpening } from '@gambito/chess-core';
import {
  CATEGORY_LABEL,
  TERMINATION_LABEL,
  formatTimeControl,
  type Color,
  type GameState,
} from '@gambito/shared';
import { AvisoMotor } from '../components/AvisoMotor.js';
import { Board } from '../board/Board.js';
import { useGameBoard } from '../board/useGameBoard.js';
import { get } from '../api/client.js';
import { MotorStockfish, type Evaluacion } from '../engine/stockfish.js';

const BOARD_SIZE = 'min(520px, calc(100vh - 250px), calc(100vw - 32px))';

/** Profundidad del análisis. Doce ya distingue un error de una imprecisión. */
const PROFUNDIDAD = 14;

type Etiqueta = 'brillante' | 'mejor' | 'buena' | 'imprecision' | 'error' | 'errorGrave';

const ETIQUETAS: Record<Etiqueta, { texto: string; color: string }> = {
  brillante: { texto: 'Brillante', color: 'var(--cool)' },
  mejor: { texto: 'Mejor jugada', color: 'var(--success)' },
  buena: { texto: 'Buena', color: 'var(--text-muted)' },
  imprecision: { texto: 'Imprecisión', color: 'var(--accent)' },
  error: { texto: 'Error', color: '#e08a3c' },
  errorGrave: { texto: 'Error grave', color: 'var(--danger)' },
};

interface Analisis {
  /** Evaluación de la posición *antes* de la jugada, desde las blancas. */
  antes: number;
  despues: number;
  /** Cuánto perdió quien movió, en centipeones. Nunca negativo. */
  perdida: number;
  /** true si la jugada entregó un mate forzado al rival. */
  permiteMate: boolean;
  mejorJugada: string | null;
  etiqueta: Etiqueta;
}

/**
 * Umbrales de clasificación en centipeones perdidos. Son los que usa la mayoría
 * de los analizadores; no hay un estándar, así que quedan explícitos acá para que
 * se puedan discutir en vez de estar escondidos en un if.
 */
function clasificar(perdida: number, fueLaMejor: boolean, sacrificio: boolean, sigueGanando: boolean): Etiqueta {
  // "Brillante" no es una categoría del motor: acá significa que el jugador
  // entregó material, era igualmente la mejor jugada, y la posición sigue ganada.
  if (fueLaMejor && sacrificio && sigueGanando) return 'brillante';
  if (perdida <= 10) return 'mejor';
  if (perdida <= 50) return 'buena';
  if (perdida <= 100) return 'imprecision';
  if (perdida <= 300) return 'error';
  return 'errorGrave';
}

/** Evaluación en peones desde las blancas, con el mate acotado. */
function aPeones(evaluacion: Evaluacion | null, turno: Color): number {
  if (!evaluacion) return 0;
  const signo = turno === 'white' ? 1 : -1;
  if (evaluacion.mateEn !== null) {
    return signo * (evaluacion.mateEn > 0 ? 100 : -100);
  }
  return (signo * (evaluacion.centipeones ?? 0)) / 100;
}

export function Analisis() {
  const { id = '' } = useParams();
  const [ply, setPly] = useState(0);
  const [analisis, setAnalisis] = useState<Array<Analisis | null>>([]);
  const [progreso, setProgreso] = useState(0);
  const [estadoMotor, setEstadoMotor] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const motorRef = useRef<MotorStockfish | null>(null);

  const consulta = useQuery({
    queryKey: ['partida', id],
    queryFn: () => get<{ game: GameState }>(`/games/${id}`),
    enabled: id.length > 0,
  });

  const partida = consulta.data?.game ?? null;

  /** Posiciones: la inicial más una por cada jugada. */
  const posiciones = useMemo(() => {
    if (!partida) return [STARTING_FEN];
    return [STARTING_FEN, ...partida.moves.map((m) => m.fenAfter)];
  }, [partida]);

  const fen = posiciones[Math.min(ply, posiciones.length - 1)]!;

  /* ------------------------------------------------------------------ */
  /* Análisis                                                            */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const motor = new MotorStockfish();
    motorRef.current = motor;
    motor
      .iniciar()
      .then(() => setEstadoMotor('listo'))
      .catch(() => setEstadoMotor('error'));
    return () => {
      motor.terminar();
      motorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (estadoMotor !== 'listo' || !partida || partida.moves.length === 0) return;
    const motor = motorRef.current;
    if (!motor) return;

    let cancelado = false;
    setAnalisis(new Array(partida.moves.length).fill(null));
    setProgreso(0);

    void (async () => {
      // Se recorre una posición por vez. En serie y no en paralelo porque hay un
      // solo motor: lanzar varias búsquedas a la vez sólo las haría pelearse.
      const evaluaciones: Array<{ peones: number; mejor: string | null }> = [];
      for (let i = 0; i < posiciones.length; i++) {
        if (cancelado) return;
        const juego = new ChessGame(posiciones[i]!);
        if (juego.outcome() !== null) {
          // Posición final: no hay nada que buscar.
          const anterior = evaluaciones[i - 1]?.peones ?? 0;
          evaluaciones.push({ peones: anterior, mejor: null });
        } else {
          const resultado = await motor.buscar({ fen: posiciones[i]!, profundidad: PROFUNDIDAD });
          evaluaciones.push({
            peones: aPeones(resultado.evaluacion, juego.turn()),
            mejor: resultado.mejorJugada,
          });
        }

        if (i > 0) {
          const previa = evaluaciones[i - 1]!;
          const actual = evaluaciones[i]!;
          const jugada = partida.moves[i - 1]!;
          const movio: Color = (i - 1) % 2 === 0 ? 'white' : 'black';
          const signo = movio === 'white' ? 1 : -1;
          // La pérdida se mide desde el color que movió: si la evaluación empeoró
          // para él, la diferencia es lo que costó la jugada.
          const perdida = Math.max(0, Math.round((previa.peones - actual.peones) * signo * 100));

          const antesJuego = new ChessGame(posiciones[i - 1]!);
          const aplicada = antesJuego.move(jugada.uci);
          const sacrificio = (aplicada?.captured ?? null) === null && detectaSacrificio(posiciones[i - 1]!, jugada.uci);
          const sigueGanando = actual.peones * signo > 1;

          // Un mate forzado se representa internamente como ±100 peones. Restarlo
          // daría "costó 100.34 peones", que no le dice nada a nadie: se informa
          // como lo que es.
          const permiteMate = Math.abs(actual.peones) >= 100 && Math.abs(previa.peones) < 100;

          const registro: Analisis = {
            antes: previa.peones,
            despues: actual.peones,
            perdida,
            permiteMate,
            mejorJugada: previa.mejor,
            etiqueta: clasificar(perdida, previa.mejor === jugada.uci, sacrificio, sigueGanando),
          };
          if (!cancelado) {
            setAnalisis((actualLista) => {
              const copia = [...actualLista];
              copia[i - 1] = registro;
              return copia;
            });
          }
        }
        if (!cancelado) setProgreso(Math.round(((i + 1) / posiciones.length) * 100));
      }
    })();

    return () => {
      cancelado = true;
      motor.detener();
    };
  }, [estadoMotor, partida, posiciones]);

  /* ------------------------------------------------------------------ */
  /* Navegación                                                          */
  /* ------------------------------------------------------------------ */

  const ir = useCallback(
    (destino: number) => setPly(Math.max(0, Math.min(posiciones.length - 1, destino))),
    [posiciones.length],
  );

  useEffect(() => {
    const alTeclado = (evento: KeyboardEvent) => {
      if (evento.key === 'ArrowLeft') ir(ply - 1);
      else if (evento.key === 'ArrowRight') ir(ply + 1);
      else if (evento.key === 'Home') ir(0);
      else if (evento.key === 'End') ir(posiciones.length - 1);
      else return;
      evento.preventDefault();
    };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [ir, ply, posiciones.length]);

  const board = useGameBoard({ fen, myColor: null, interactive: false, onMove: () => {} });

  if (consulta.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Cargando la partida…" />
      </div>
    );
  }
  if (!partida) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--text-muted)' }}>No se encontró esa partida.</span>
      </div>
    );
  }

  const jugadaActual = ply > 0 ? partida.moves[ply - 1] : null;
  const analisisActual = ply > 0 ? analisis[ply - 1] : null;
  const previoAnalisis = analisis[ply] ?? null;
  const ultimaJugada = jugadaActual
    ? { from: jugadaActual.uci.slice(0, 2), to: jugadaActual.uci.slice(2, 4) }
    : null;

  // La flecha muestra la mejor jugada de la posición que se está viendo.
  const flechas =
    previoAnalisis?.mejorJugada && ply < posiciones.length - 1
      ? [{ from: previoAnalisis.mejorJugada.slice(0, 2), to: previoAnalisis.mejorJugada.slice(2, 4) }]
      : [];

  const apertura = identifyOpening(partida.moves.map((m) => m.san));

  const pares: Array<[number, number, number | null]> = [];
  for (let i = 0; i < partida.moves.length; i += 2) {
    pares.push([i / 2 + 1, i, i + 1 < partida.moves.length ? i + 1 : null]);
  }

  const resumen = contarEtiquetas(analisis, partida.moves.length);

  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-1 flex-col gap-5 px-4 py-5 lg:flex-row lg:px-8">
      <div className="flex flex-1 flex-col items-center gap-3">
        <div className="flex flex-col gap-3" style={{ width: BOARD_SIZE }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm">
              {partida.white.username} <span style={{ color: 'var(--text-muted)' }}>vs</span>{' '}
              {partida.black.username}
            </span>
            <span className="gb-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {CATEGORY_LABEL[partida.category]} {formatTimeControl(partida.timeControl)}
              {partida.termination ? ` · ${TERMINATION_LABEL[partida.termination].toUpperCase()}` : ''}
            </span>
          </div>

          <Board
            board={board}
            orientation="white"
            lastMove={ultimaJugada}
            arrows={flechas}
            size={BOARD_SIZE}
          />

          {flechas.length > 0 ? (
            <span className="text-[11px]" style={{ color: 'var(--cool)' }}>
              La flecha marca la mejor jugada <em>en esta posición</em>.
            </span>
          ) : null}

          <GraficoEvaluacion analisis={analisis} ply={ply} onSeleccionar={(i) => ir(i + 1)} />

          <div className="flex items-center gap-2">
            <Button onClick={() => ir(0)} aria-label="Primera jugada">⏮</Button>
            <Button onClick={() => ir(ply - 1)} aria-label="Jugada anterior">◀</Button>
            <Button onClick={() => ir(ply + 1)} aria-label="Jugada siguiente">▶</Button>
            <Button onClick={() => ir(posiciones.length - 1)} aria-label="Última jugada">⏭</Button>
            <span className="gb-mono ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {ply} / {posiciones.length - 1} · usá ← →
            </span>
          </div>
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
        {estadoMotor !== 'error' && progreso < 100 ? (
          <div className="gb-card flex flex-col gap-2">
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {estadoMotor === 'cargando' ? 'Cargando el motor…' : `Analizando… ${progreso} %`}
            </span>
            <div className="h-1.5 overflow-hidden rounded" style={{ background: 'var(--bg-elevated)' }}>
              <span
                className="block h-full"
                style={{ width: `${progreso}%`, background: 'var(--accent)', transition: 'width 200ms' }}
              />
            </div>
          </div>
        ) : null}

        {apertura ? (
          <div className="gb-card flex flex-col gap-1.5">
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              APERTURA
            </span>
            <span className="gb-display text-[20px]">{apertura.name}</span>
            <span className="gb-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{apertura.eco}</span>
          </div>
        ) : null}

        {jugadaActual && analisisActual ? (
          <div className="gb-card flex flex-col gap-2">
            <span
              className="gb-mono text-[11px] tracking-[0.14em]"
              style={{ color: ETIQUETAS[analisisActual.etiqueta].color }}
            >
              {ETIQUETAS[analisisActual.etiqueta].texto.toUpperCase()}
            </span>
            <span className="text-sm">
              <strong className="gb-mono">{jugadaActual.san}</strong>
              {analisisActual.permiteMate ? (
                <span style={{ color: 'var(--text-muted)' }}> — permite un mate forzado</span>
              ) : analisisActual.perdida > 10 ? (
                <span style={{ color: 'var(--text-muted)' }}>
                  {' '}— costó {(analisisActual.perdida / 100).toFixed(2)} peones
                </span>
              ) : null}
            </span>
            {analisisActual.mejorJugada && analisisActual.perdida > 50 ? (
              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                En su lugar el motor jugaba{' '}
                <strong className="gb-mono" style={{ color: 'var(--cool)' }}>
                  {sanDe(posiciones[ply - 1]!, analisisActual.mejorJugada)}
                </strong>
                . Retrocedé una jugada para verlo en el tablero.
              </span>
            ) : null}
          </div>
        ) : null}

        {progreso === 100 ? (
          <div className="gb-card flex flex-col gap-3">
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              RESUMEN
            </span>
            {(Object.keys(ETIQUETAS) as Etiqueta[]).map((clave) =>
              resumen[clave] > 0 ? (
                <div key={clave} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ETIQUETAS[clave].color }} />
                  <span className="flex-1 text-[13px]">{ETIQUETAS[clave].texto}</span>
                  <span className="gb-mono text-[13px]">{resumen[clave]}</span>
                </div>
              ) : null,
            )}
          </div>
        ) : null}

        <div className="gb-card flex min-h-[200px] flex-1 flex-col gap-2">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            JUGADAS
          </span>
          <div className="flex flex-1 flex-col overflow-auto">
            {pares.map(([numero, indiceBlancas, indiceNegras]) => (
              <div key={numero} className="flex items-center gap-2 px-1 py-0.5">
                <span className="gb-mono w-7 text-xs" style={{ color: 'var(--text-muted)' }}>{numero}.</span>
                <BotonJugada
                  san={partida.moves[indiceBlancas]!.san}
                  activo={ply === indiceBlancas + 1}
                  etiqueta={analisis[indiceBlancas]?.etiqueta ?? null}
                  onClick={() => ir(indiceBlancas + 1)}
                />
                {indiceNegras !== null ? (
                  <BotonJugada
                    san={partida.moves[indiceNegras]!.san}
                    activo={ply === indiceNegras + 1}
                    etiqueta={analisis[indiceNegras]?.etiqueta ?? null}
                    onClick={() => ir(indiceNegras + 1)}
                  />
                ) : (
                  <span className="w-[86px]" />
                )}
              </div>
            ))}
          </div>
          <Link to="/" className="gb-btn gb-btn--secondary gb-btn--block">Volver al lobby</Link>
          <AvisoMotor />
        </div>
      </aside>
    </div>
  );
}

function BotonJugada({
  san,
  activo,
  etiqueta,
  onClick,
}: {
  san: string;
  activo: boolean;
  etiqueta: Etiqueta | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="gb-mono flex w-[86px] items-center gap-1.5 rounded px-2 py-1 text-left text-sm"
      style={{
        background: activo ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${activo ? 'var(--accent)' : 'transparent'}`,
        color: 'var(--text-primary)',
      }}
    >
      {san}
      {etiqueta && etiqueta !== 'buena' && etiqueta !== 'mejor' ? (
        <span
          className="ml-auto h-1.5 w-1.5 rounded-full"
          style={{ background: ETIQUETAS[etiqueta].color }}
          aria-label={ETIQUETAS[etiqueta].texto}
        />
      ) : null}
    </button>
  );
}

/** Curva de evaluación: una sola serie, con el cero como línea de referencia. */
function GraficoEvaluacion({
  analisis,
  ply,
  onSeleccionar,
}: {
  analisis: Array<Analisis | null>;
  ply: number;
  onSeleccionar: (indice: number) => void;
}) {
  const hechos = analisis.filter((a): a is Analisis => a !== null);
  if (hechos.length < 2) return null;

  const ancho = 520;
  const alto = 70;
  const tope = 5;
  const y = (peones: number) => alto / 2 - (Math.max(-tope, Math.min(tope, peones)) / tope) * (alto / 2 - 3);
  const x = (i: number) => (i / Math.max(1, analisis.length - 1)) * ancho;

  const puntos = analisis
    .map((a, i) => (a ? `${x(i).toFixed(1)},${y(a.despues).toFixed(1)}` : null))
    .filter((p): p is string => p !== null);

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      width="100%"
      height={alto}
      role="img"
      aria-label="Evaluación del motor a lo largo de la partida"
      style={{ cursor: 'pointer' }}
      onClick={(evento) => {
        const caja = (evento.target as SVGElement).closest('svg')!.getBoundingClientRect();
        const razon = (evento.clientX - caja.left) / caja.width;
        onSeleccionar(Math.round(razon * (analisis.length - 1)));
      }}
    >
      <rect x="0" y="0" width={ancho} height={alto / 2} fill="var(--bg-elevated)" />
      <rect x="0" y={alto / 2} width={ancho} height={alto / 2} fill="var(--bg-base)" />
      <line x1="0" y1={alto / 2} x2={ancho} y2={alto / 2} stroke="var(--border)" strokeWidth="1" />
      <polyline
        points={puntos.join(' ')}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {ply > 0 ? (
        <line x1={x(ply - 1)} y1="0" x2={x(ply - 1)} y2={alto} stroke="var(--text-primary)" strokeWidth="1" />
      ) : null}
    </svg>
  );
}

function contarEtiquetas(analisis: Array<Analisis | null>, total: number): Record<Etiqueta, number> {
  const base: Record<Etiqueta, number> = {
    brillante: 0,
    mejor: 0,
    buena: 0,
    imprecision: 0,
    error: 0,
    errorGrave: 0,
  };
  for (let i = 0; i < total; i++) {
    const registro = analisis[i];
    if (registro) base[registro.etiqueta]++;
  }
  return base;
}

/** Traduce una jugada UCI a notación algebraica en el contexto de su posición. */
function sanDe(fen: string, uci: string): string {
  const juego = new ChessGame(fen);
  return juego.move(uci)?.san ?? uci;
}

/**
 * Detecta si una jugada deja una pieza en una casilla atacada por el rival sin
 * capturar nada: una aproximación al sacrificio, suficiente para la etiqueta.
 */
function detectaSacrificio(fen: string, uci: string): boolean {
  const juego = new ChessGame(fen);
  const jugada = juego.move(uci);
  if (!jugada || jugada.captured) return false;
  // Tras la jugada, ¿el rival puede capturar la pieza que acaba de moverse?
  return juego.legalMoves().some((m) => m.to === jugada.to && m.captured !== undefined);
}
