/**
 * Envoltorio de Stockfish sobre un Web Worker.
 *
 * El motor corre fuera del hilo principal, así que pensar una jugada nunca traba
 * la interfaz. Habla UCI por texto plano; esta clase traduce ese protocolo a
 * promesas y se encarga de que no queden búsquedas huérfanas cuando el jugador
 * cambia de posición a mitad de cálculo.
 */

export interface Evaluacion {
  /** Ventaja en centipeones desde el punto de vista de quien mueve. */
  centipeones: number | null;
  /** Jugadas hasta el mate, con signo. Si está presente, `centipeones` es null. */
  mateEn: number | null;
  profundidad: number;
  /** Mejor línea encontrada, en UCI. */
  linea: string[];
}

export interface ResultadoBusqueda {
  mejorJugada: string | null;
  evaluacion: Evaluacion | null;
}

export interface OpcionesBusqueda {
  fen: string;
  movetimeMs?: number;
  profundidad?: number;
  /** Se llama con cada evaluación parcial mientras el motor piensa. */
  onEvaluacion?: (evaluacion: Evaluacion) => void;
  signal?: AbortSignal;
}

type Escucha = (linea: string) => void;

export class MotorStockfish {
  private worker: Worker | null = null;
  private escuchas = new Set<Escucha>();
  private listo: Promise<void> | null = null;
  /**
   * Las búsquedas se encadenan de a una. UCI exige esperar el `bestmove` de la
   * búsqueda en curso antes de mandar otra `position`: si se solapan, el motor
   * descarta la segunda orden y se queda mudo para siempre.
   */
  private cola: Promise<unknown> = Promise.resolve();
  private buscando = false;

  /** Arranca el worker y espera a que el motor conteste que está listo. */
  async iniciar(): Promise<void> {
    if (this.listo) return this.listo;

    this.listo = (async () => {
      this.worker = new Worker('/engine/stockfish-19-lite-single.js');
      this.worker.onmessage = (evento: MessageEvent<string>) => {
        const linea = typeof evento.data === 'string' ? evento.data : '';
        for (const escucha of this.escuchas) escucha(linea);
      };
      await this.esperar('uci', (l) => l === 'uciok');
      await this.esperar('isready', (l) => l === 'readyok');
    })();

    return this.listo;
  }

  private enviar(comando: string): void {
    this.worker?.postMessage(comando);
  }

  /** Manda un comando y resuelve cuando llega la línea que lo da por terminado. */
  private esperar(comando: string, termina: (linea: string) => boolean, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => {
        this.escuchas.delete(escucha);
        reject(new Error(`el motor no respondió a "${comando}"`));
      }, timeoutMs);

      const escucha: Escucha = (linea) => {
        if (!termina(linea)) return;
        clearTimeout(temporizador);
        this.escuchas.delete(escucha);
        resolve();
      };
      this.escuchas.add(escucha);
      this.enviar(comando);
    });
  }

  async configurar(opciones: Record<string, string | number | boolean>): Promise<void> {
    await this.iniciar();
    for (const [nombre, valor] of Object.entries(opciones)) {
      this.enviar(`setoption name ${nombre} value ${valor}`);
    }
    await this.esperar('isready', (l) => l === 'readyok');
  }

  /**
   * Corta la búsqueda en curso. No cancela la promesa: el motor igual contesta un
   * `bestmove`, y es justamente esa respuesta la que habilita la búsqueda siguiente.
   */
  detener(): void {
    if (this.buscando) this.enviar('stop');
  }

  async buscar(opciones: OpcionesBusqueda): Promise<ResultadoBusqueda> {
    await this.iniciar();
    // Se encola detrás de lo que haya en vuelo, pase lo que pase con aquello.
    const siguiente = this.cola.then(
      () => this.buscarAhora(opciones),
      () => this.buscarAhora(opciones),
    );
    this.cola = siguiente.catch(() => undefined);
    return siguiente;
  }

  private buscarAhora(opciones: OpcionesBusqueda): Promise<ResultadoBusqueda> {
    let ultima: Evaluacion | null = null;
    this.buscando = true;

    return new Promise<ResultadoBusqueda>((resolve) => {
      const terminar = (mejorJugada: string | null) => {
        this.buscando = false;
        this.escuchas.delete(escucha);
        opciones.signal?.removeEventListener('abort', abortar);
        resolve({ mejorJugada, evaluacion: ultima });
      };

      const abortar = () => {
        this.enviar('stop');
      };

      const escucha: Escucha = (linea) => {
        if (linea.startsWith('info ') && linea.includes(' pv ')) {
          const evaluacion = parsearInfo(linea);
          if (evaluacion) {
            ultima = evaluacion;
            opciones.onEvaluacion?.(evaluacion);
          }
          return;
        }
        if (linea.startsWith('bestmove')) {
          const jugada = linea.split(/\s+/)[1];
          terminar(jugada && jugada !== '(none)' ? jugada : null);
        }
      };

      this.escuchas.add(escucha);
      opciones.signal?.addEventListener('abort', abortar, { once: true });

      this.enviar(`position fen ${opciones.fen}`);
      const limites = [
        opciones.profundidad ? `depth ${opciones.profundidad}` : '',
        opciones.movetimeMs ? `movetime ${opciones.movetimeMs}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      this.enviar(`go ${limites || 'depth 12'}`);
    });
  }

  terminar(): void {
    this.buscando = false;
    this.cola = Promise.resolve();
    this.escuchas.clear();
    this.enviar('quit');
    this.worker?.terminate();
    this.worker = null;
    this.listo = null;
  }
}

/** Extrae profundidad, puntaje y línea principal de una línea `info`. */
export function parsearInfo(linea: string): Evaluacion | null {
  const partes = linea.split(/\s+/);
  const leer = (clave: string): string | undefined => {
    const indice = partes.indexOf(clave);
    return indice === -1 ? undefined : partes[indice + 1];
  };

  const profundidad = Number(leer('depth') ?? NaN);
  if (!Number.isFinite(profundidad)) return null;

  const tipo = partes.indexOf('score') === -1 ? null : partes[partes.indexOf('score') + 1];
  const valor = Number(partes[partes.indexOf('score') + 2] ?? NaN);
  if (tipo === null || !Number.isFinite(valor)) return null;

  const indicePv = partes.indexOf('pv');
  const linea_ = indicePv === -1 ? [] : partes.slice(indicePv + 1);

  return {
    centipeones: tipo === 'cp' ? valor : null,
    mateEn: tipo === 'mate' ? valor : null,
    profundidad,
    linea: linea_,
  };
}

/** Convierte una evaluación a la cifra que se muestra, siempre desde las blancas. */
export function evaluacionDesdeBlancas(evaluacion: Evaluacion, turno: 'white' | 'black'): number | null {
  if (evaluacion.centipeones === null) return null;
  const signo = turno === 'white' ? 1 : -1;
  return (evaluacion.centipeones * signo) / 100;
}
