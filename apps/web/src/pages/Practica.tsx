import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@gambito/ui';
import {
  ChessGame,
  STARTING_FEN,
  startingPositionWithout,
  type PieceType,
} from '@gambito/chess-core';
import { TERMINATION_LABEL, type Color, opposite } from '@gambito/shared';
import { AvisoMotor } from '../components/AvisoMotor.js';
import { Board } from '../board/Board.js';
import { useGameBoard } from '../board/useGameBoard.js';
import {
  MotorStockfish,
  evaluacionDesdeBlancas,
  type Evaluacion,
} from '../engine/stockfish.js';
import { HANDICAPS, nivelPorNumero, type HandicapId } from '../engine/niveles.js';

const BOARD_SIZE = 'min(560px, calc(100vh - 210px), calc(100vw - 32px))';

type EleccionColor = 'white' | 'black' | 'azar';

interface Config {
  nivel: number;
  color: EleccionColor;
  handicap: HandicapId;
  pistas: boolean;
  deshacer: boolean;
  barraEval: boolean;
}

const CONFIG_INICIAL: Config = {
  nivel: 12,
  color: 'white',
  handicap: 'ninguno',
  pistas: true,
  deshacer: true,
  barraEval: true,
};

export function Practica() {
  const [config, setConfig] = useState<Config>(CONFIG_INICIAL);
  const [miColor, setMiColor] = useState<Color>('white');
  /** Historial de posiciones: la última es la actual, y deshacer es retroceder. */
  const [historial, setHistorial] = useState<string[]>([STARTING_FEN]);
  const [sanes, setSanes] = useState<string[]>([]);
  const [pensando, setPensando] = useState(false);
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  const [pista, setPista] = useState<string | null>(null);
  const [estadoMotor, setEstadoMotor] = useState<'cargando' | 'listo' | 'error'>('cargando');

  const motorRef = useRef<MotorStockfish | null>(null);
  const fen = historial[historial.length - 1]!;
  const nivel = nivelPorNumero(config.nivel);

  const partida = useMemo(() => new ChessGame(fen), [fen]);
  const final = partida.outcome();
  const turno = partida.turn();
  const miTurno = turno === miColor && final === null;

  /* ------------------------------------------------------------------ */
  /* Motor                                                               */
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

  // La fuerza se reconfigura cada vez que cambia el nivel, no en cada jugada.
  useEffect(() => {
    if (estadoMotor !== 'listo') return;
    void motorRef.current?.configurar({
      'Skill Level': nivel.skillLevel,
      UCI_LimitStrength: nivel.limitarFuerza,
      ...(nivel.eloAprox ? { UCI_Elo: nivel.eloAprox } : {}),
    });
  }, [estadoMotor, nivel]);

  /**
   * La jugada se calcula fuera de los actualizadores de estado. Ponerla adentro
   * parecía más prolijo, pero React vuelve a ejecutar esas funciones en modo
   * estricto para detectar impurezas: cada jugada entraba dos veces en la
   * notación y la lista mostraba todo duplicado.
   */
  const aplicar = useCallback(
    (uci: string) => {
      const juego = new ChessGame(fen);
      const jugada = juego.move(uci);
      if (!jugada) return;
      const siguiente = juego.fen();
      setHistorial((actual) => [...actual, siguiente]);
      setSanes((previos) => [...previos, jugada.san]);
      setPista(null);
    },
    [fen],
  );

  // Turno de la IA: pensar y mover.
  useEffect(() => {
    if (estadoMotor !== 'listo' || final !== null || turno === miColor) return;
    const motor = motorRef.current;
    if (!motor) return;

    let cancelado = false;
    setPensando(true);
    void motor
      .buscar({ fen, movetimeMs: nivel.movetimeMs, profundidad: nivel.profundidadMax })
      .then((resultado) => {
        if (cancelado || !resultado.mejorJugada) return;
        if (resultado.evaluacion) setEvaluacion(resultado.evaluacion);
        aplicar(resultado.mejorJugada);
      })
      .finally(() => {
        if (!cancelado) setPensando(false);
      });

    return () => {
      cancelado = true;
      motor.detener();
    };
  }, [fen, turno, miColor, final, estadoMotor, nivel, aplicar]);

  // Turno del jugador: evaluar la posición para la barra y, si hace falta, la pista.
  useEffect(() => {
    if (estadoMotor !== 'listo' || final !== null || turno !== miColor) return;
    if (!config.barraEval && !config.pistas) return;
    const motor = motorRef.current;
    if (!motor) return;

    let cancelado = false;
    const temporizador = setTimeout(() => {
      void motor.buscar({ fen, profundidad: 12, movetimeMs: 400 }).then((resultado) => {
        if (cancelado) return;
        if (resultado.evaluacion) setEvaluacion(resultado.evaluacion);
        if (config.pistas && resultado.mejorJugada) {
          const copia = new ChessGame(fen);
          const jugada = copia.move(resultado.mejorJugada);
          setPista(jugada?.san ?? null);
        }
      });
    }, 250);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [fen, turno, miColor, final, estadoMotor, config.barraEval, config.pistas]);

  /* ------------------------------------------------------------------ */
  /* Acciones                                                            */
  /* ------------------------------------------------------------------ */

  const nuevaPartida = useCallback(() => {
    const elegido: Color =
      config.color === 'azar' ? (Math.random() < 0.5 ? 'white' : 'black') : config.color;
    const handicap = HANDICAPS.find((h) => h.id === config.handicap)!;
    // El hándicap le saca piezas a la IA, que juega del color contrario.
    const colorIA = opposite(elegido);
    const casillas = handicap.quitar.filter((casilla) =>
      colorIA === 'white' ? casilla.endsWith('1') : casilla.endsWith('8'),
    );

    setMiColor(elegido);
    setHistorial([casillas.length ? startingPositionWithout(casillas) : STARTING_FEN]);
    setSanes([]);
    setEvaluacion(null);
    setPista(null);
    motorRef.current?.detener();
  }, [config.color, config.handicap]);

  const deshacer = useCallback(() => {
    motorRef.current?.detener();
    // Se retrocede hasta que vuelva a ser el turno del jugador: deshacer una sola
    // media jugada lo dejaría esperando a que la IA mueva otra vez.
    let siguiente = historial;
    while (siguiente.length > 1) {
      siguiente = siguiente.slice(0, -1);
      if (new ChessGame(siguiente[siguiente.length - 1]!).turn() === miColor) break;
    }
    setHistorial(siguiente);
    setSanes((previos) => previos.slice(0, siguiente.length - 1));
    setPista(null);
  }, [historial, miColor]);

  const board = useGameBoard({
    fen,
    myColor: miColor,
    interactive: miTurno && estadoMotor === 'listo',
    onMove: aplicar,
  });

  /* ------------------------------------------------------------------ */
  /* Presentación                                                        */
  /* ------------------------------------------------------------------ */

  const evalBlancas = evaluacion ? evaluacionDesdeBlancas(evaluacion, turno) : null;
  const porcentajeBlancas =
    evalBlancas === null ? 50 : Math.round(100 / (1 + Math.exp(-0.45 * evalBlancas)));

  const ultima = historial.length > 1 ? new ChessGame(historial[historial.length - 2]!) : null;
  const ultimaJugada = useMemo(() => {
    if (!ultima) return null;
    const anterior = ultima.pieces();
    const ahora = partida.pieces();
    const salio = anterior.find((p) => !ahora.some((q) => q.square === p.square && q.type === p.type && q.color === p.color));
    const llego = ahora.find((p) => !anterior.some((q) => q.square === p.square && q.type === p.type && q.color === p.color));
    return salio && llego ? { from: salio.square, to: llego.square } : null;
  }, [ultima, partida]);

  const pares: Array<[number, string, string | null]> = [];
  for (let i = 0; i < sanes.length; i += 2) {
    pares.push([i / 2 + 1, sanes[i]!, sanes[i + 1] ?? null]);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-5 px-4 py-5 lg:flex-row lg:px-8">
      {/* Configuración */}
      <aside className="gb-card flex w-full shrink-0 flex-col gap-6 lg:w-[330px]">
        <h1 className="gb-display m-0 text-[30px] leading-tight">Práctica contra la IA</h1>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <label htmlFor="nivel" className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Nivel del motor
            </label>
            <span className="gb-mono text-sm" style={{ color: 'var(--accent-text)' }}>
              {config.nivel} / 20
            </span>
          </div>
          <input
            id="nivel"
            type="range"
            min={1}
            max={20}
            value={config.nivel}
            onChange={(e) => setConfig((c) => ({ ...c, nivel: Number(e.target.value) }))}
            style={{ accentColor: 'var(--accent)' }}
          />
          <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>Principiante</span>
            <span style={{ color: 'var(--text-primary)' }}>
              {nivel.nombre}
              {nivel.eloAprox ? ` · ~${nivel.eloAprox}` : ''}
            </span>
            <span>Maestro</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Jugás con</span>
          <div className="flex gap-2.5">
            {(['white', 'black', 'azar'] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, color: opcion }))}
                className="flex h-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-[11px]"
                style={{
                  border: `1px solid ${config.color === opcion ? 'var(--accent)' : 'var(--border)'}`,
                  background: config.color === opcion ? 'var(--accent-wash)' : 'var(--bg-elevated)',
                }}
              >
                <span
                  className="block h-[22px] w-[22px] rounded-full"
                  style={{
                    background:
                      opcion === 'white'
                        ? 'var(--piece-white)'
                        : opcion === 'black'
                          ? 'var(--piece-black)'
                          : 'linear-gradient(90deg, var(--piece-white) 50%, var(--piece-black) 50%)',
                    border: '1px solid var(--border-strong)',
                  }}
                />
                <span className="text-[11px]" style={{ color: config.color === opcion ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {opcion === 'white' ? 'Blancas' : opcion === 'black' ? 'Negras' : 'Al azar'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <label htmlFor="handicap" className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Hándicap de material
          </label>
          <select
            id="handicap"
            className="gb-input"
            style={{ height: 46 }}
            value={config.handicap}
            onChange={(e) => setConfig((c) => ({ ...c, handicap: e.target.value as HandicapId }))}
          >
            {HANDICAPS.map((h) => (
              <option key={h.id} value={h.id}>{h.nombre}</option>
            ))}
          </select>
        </div>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1 p-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>Asistencia</legend>
          {([
            ['pistas', 'Pistas de jugada'],
            ['deshacer', 'Permitir deshacer jugadas'],
            ['barraEval', 'Barra de evaluación en vivo'],
          ] as const).map(([clave, etiqueta]) => (
            <label key={clave} htmlFor={clave} className="flex items-center gap-3 text-sm">
              <input
                id={clave}
                type="checkbox"
                checked={config[clave]}
                onChange={(e) => setConfig((c) => ({ ...c, [clave]: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              {etiqueta}
            </label>
          ))}
        </fieldset>

        <div className="flex-1" />
        <Button variant="primary" block style={{ height: 50 }} onClick={nuevaPartida}>
          Nueva partida de práctica
        </Button>
        <AvisoMotor />
      </aside>

      {/* Tablero */}
      <div className="flex flex-1 flex-col items-center gap-3">
        <div className="flex flex-col gap-3" style={{ width: BOARD_SIZE }}>
          <div className="flex items-center gap-3">
            <span className="gb-mono text-[11px] tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>
              MOTOR NIVEL {config.nivel}
            </span>
            {pensando ? (
              <span className="gb-mono text-[11px]" style={{ color: 'var(--accent-text)' }}>PENSANDO…</span>
            ) : null}
            <div className="flex-1" />
            {final ? (
              <span className="gb-mono text-[11px]" style={{ color: 'var(--accent-text)' }}>
                {TERMINATION_LABEL[final.termination].toUpperCase()}
                {final.winner ? ` · GANAN LAS ${final.winner === 'white' ? 'BLANCAS' : 'NEGRAS'}` : ''}
              </span>
            ) : (
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {miTurno ? 'Tu turno' : 'Juega la IA'}
              </span>
            )}
          </div>

          <Board board={board} orientation={miColor} lastMove={ultimaJugada} size={BOARD_SIZE} />

          {config.barraEval ? (
            <div className="flex items-center gap-3">
              <span className="gb-mono text-[13px] w-12" style={{ color: 'var(--text-primary)' }}>
                {evaluacion?.mateEn != null
                  ? `M${Math.abs(evaluacion.mateEn)}`
                  : evalBlancas === null
                    ? '—'
                    : `${evalBlancas > 0 ? '+' : ''}${evalBlancas.toFixed(1)}`}
              </span>
              <div
                className="flex h-3 flex-1 overflow-hidden rounded"
                style={{ background: 'var(--piece-black)' }}
                role="img"
                aria-label={`Evaluación: ${porcentajeBlancas} por ciento a favor de las blancas`}
              >
                <span
                  className="block h-full"
                  style={{ width: `${porcentajeBlancas}%`, background: 'var(--piece-white)', transition: 'width 200ms ease' }}
                />
              </div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                prof. {evaluacion?.profundidad ?? '—'}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Panel derecho */}
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[300px]">
        {estadoMotor === 'cargando' ? (
          <div className="gb-card text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Cargando el motor… (1,7 MB, sólo la primera vez)
          </div>
        ) : null}
        {estadoMotor === 'error' ? (
          <div
            className="rounded-xl px-4 py-3 text-[13px]"
            style={{ background: 'var(--danger-wash)', border: '1px solid var(--danger-wash-border)', color: 'var(--danger)' }}
          >
            No se pudo cargar el motor. Recargá la página para intentar de nuevo.
          </div>
        ) : null}

        {config.pistas && pista && miTurno ? (
          <div
            className="flex flex-col gap-2.5 rounded-2xl px-5 py-4"
            style={{ background: 'var(--cool-wash)', border: '1px solid var(--cool-wash-border)' }}
          >
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--cool)' }}>PISTA</span>
            <span className="text-sm">
              El motor jugaría <strong className="gb-mono">{pista}</strong>.
            </span>
          </div>
        ) : null}

        <div className="gb-card flex min-h-[220px] flex-1 flex-col gap-2">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>JUGADAS</span>
          <div className="flex flex-1 flex-col overflow-auto">
            {pares.length === 0 ? (
              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Todavía no se jugó nada.
              </span>
            ) : (
              pares.map(([numero, blancas, negras], indice) => (
                <div
                  key={numero}
                  className="flex items-center gap-3 rounded-[7px] px-2.5 py-1.5"
                  style={indice === pares.length - 1 ? { background: 'var(--bg-elevated)' } : undefined}
                >
                  <span className="gb-mono w-7 text-xs" style={{ color: 'var(--text-muted)' }}>{numero}.</span>
                  <span className="gb-mono w-[70px] text-sm">{blancas}</span>
                  <span className="gb-mono w-[70px] text-sm">{negras ?? '…'}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Button
              block
              disabled={!config.deshacer || historial.length < 2}
              onClick={deshacer}
            >
              Deshacer
            </Button>
            <Button block onClick={nuevaPartida}>Reiniciar</Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** Piezas de coronación por si alguna vista las necesita fuera del tablero. */
export const CORONACIONES: PieceType[] = ['q', 'r', 'b', 'n'];
