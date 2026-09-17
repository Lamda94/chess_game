import { ChessGame } from './index.js';

/**
 * Búsqueda de mate forzado, sin motor.
 *
 * Alcanza con chess.js: un mate en dos son unas decenas de miles de posiciones y
 * se resuelve en milisegundos. Sirve para dos cosas distintas: verificar en la
 * suite que cada puzzle es lo que dice ser, y decidir en vivo si la jugada que
 * eligió quien practica conserva el mate.
 */

/** ¿El bando que mueve da mate en `jugadas` como máximo, contra cualquier defensa? */
export function esMateEnN(fen: string, jugadas: number): boolean {
  if (jugadas < 1) return false;
  const juego = new ChessGame(fen);

  for (const candidata of juego.legalMoves()) {
    const despues = new ChessGame(fen);
    despues.move(candidata.uci);

    const resultado = despues.outcome();
    if (resultado?.termination === 'CHECKMATE') return true;
    if (jugadas === 1) continue;
    // Si la posición quedó en tablas, esta candidata no sirve.
    if (resultado !== null) continue;

    // El rival elige: el mate tiene que seguir en pie contra *todas* sus respuestas.
    const defensas = despues.legalMoves();
    if (defensas.length === 0) continue;

    const forzado = defensas.every((defensa) => {
      const replica = new ChessGame(despues.fen());
      replica.move(defensa.uci);
      if (replica.outcome() !== null) return false;
      return esMateEnN(replica.fen(), jugadas - 1);
    });
    if (forzado) return true;
  }
  return false;
}

/** Todas las jugadas que dan mate inmediato. */
export function jugadasQueDanMate(fen: string): string[] {
  const juego = new ChessGame(fen);
  return juego.legalMoves().filter((candidata) => {
    const despues = new ChessGame(fen);
    despues.move(candidata.uci);
    return despues.outcome()?.termination === 'CHECKMATE';
  }).map((m) => m.uci);
}

/**
 * ¿Esta jugada mantiene el mate forzado? Es lo que se le pregunta al tablero
 * cuando alguien resuelve un puzzle: no hay una única respuesta válida, hay que
 * aceptar cualquiera que siga llevando al mate en el número de jugadas pedido.
 */
export function conservaElMate(fen: string, uci: string, jugadasRestantes: number): boolean {
  const juego = new ChessGame(fen);
  if (!juego.move(uci)) return false;

  const resultado = juego.outcome();
  if (resultado?.termination === 'CHECKMATE') return true;
  if (jugadasRestantes <= 1 || resultado !== null) return false;

  const defensas = juego.legalMoves();
  if (defensas.length === 0) return false;

  return defensas.every((defensa) => {
    const replica = new ChessGame(juego.fen());
    replica.move(defensa.uci);
    if (replica.outcome() !== null) return false;
    return esMateEnN(replica.fen(), jugadasRestantes - 1);
  });
}

/** La respuesta del rival que más resiste, para continuar el puzzle. */
export function mejorDefensa(fen: string): string | null {
  const juego = new ChessGame(fen);
  const defensas = juego.legalMoves();
  if (defensas.length === 0) return null;

  // Se prefiere la defensa que aguanta más jugadas; si todas caen igual, la primera.
  let elegida = defensas[0]!.uci;
  let mejorResistencia = -1;
  for (const defensa of defensas) {
    const despues = new ChessGame(fen);
    despues.move(defensa.uci);
    if (despues.outcome()?.termination === 'CHECKMATE') continue;
    let resistencia = 0;
    while (resistencia < 3 && !esMateEnN(despues.fen(), resistencia + 1)) resistencia++;
    if (resistencia > mejorResistencia) {
      mejorResistencia = resistencia;
      elegida = defensa.uci;
    }
  }
  return elegida;
}

/**
 * ¿La posición puede darse en una partida real?
 *
 * chess.js acepta FENs donde el bando que *acaba* de mover quedó en jaque, algo
 * imposible en el tablero. Esas posiciones producen "mates" fantasma: cualquier
 * jugada parece dar mate porque el rey ya estaba capturado. Hay que descartarlas.
 */
export function posicionJugable(fen: string): boolean {
  const partes = fen.split(' ');
  if (partes.length < 2) return false;
  const turno = partes[1];
  partes[1] = turno === 'w' ? 'b' : 'w';
  // Se quita el peón al paso, que deja de tener sentido al invertir el turno.
  partes[3] = '-';
  try {
    return !new ChessGame(partes.join(' ')).inCheck();
  } catch {
    return false;
  }
}
