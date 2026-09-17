import { describe, expect, it } from 'vitest';
import {
  ChessGame,
  STARTING_FEN,
  isLightSquare,
  materialBalance,
  startingPositionWithout,
  identifyOpening,
  sanMovesFromPgn,
  SQUARES,
} from './index.js';

describe('tablero', () => {
  it('tiene 64 casillas, de a8 a h1', () => {
    expect(SQUARES).toHaveLength(64);
    expect(SQUARES[0]).toBe('a8');
    expect(SQUARES[63]).toBe('h1');
  });

  it('reconoce el color de la casilla', () => {
    expect(isLightSquare('a8')).toBe(true);
    expect(isLightSquare('h1')).toBe(true);
    expect(isLightSquare('a1')).toBe(false);
    expect(isLightSquare('e4')).toBe(true);
    expect(isLightSquare('h8')).toBe(false);
  });
});

describe('jugadas legales', () => {
  it('la posición inicial tiene 20 jugadas', () => {
    expect(new ChessGame().legalMoves()).toHaveLength(20);
  });

  it('rechaza una jugada ilegal sin lanzar', () => {
    const game = new ChessGame();
    expect(game.move('e2e5')).toBeNull();
    expect(game.fen()).toBe(STARTING_FEN);
  });

  it('acepta una jugada legal y cambia el turno', () => {
    const game = new ChessGame();
    const move = game.move('e2e4');
    expect(move?.san).toBe('e4');
    expect(game.turn()).toBe('black');
    expect(game.ply()).toBe(1);
  });
});

describe('reglas especiales', () => {
  it('enroque corto de las blancas', () => {
    const game = new ChessGame('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1');
    expect(game.move('e1g1')?.san).toBe('O-O');
    expect(game.fen()).toContain('RNBQ1RK1');
  });

  it('captura al paso', () => {
    const game = new ChessGame('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
    const move = game.move('e5f6');
    expect(move?.san).toBe('exf6');
    expect(move?.captured).toBe('p');
  });

  it('coronación a dama', () => {
    const game = new ChessGame('8/P6k/8/8/8/8/6K1/8 w - - 0 1');
    expect(game.needsPromotion('a7', 'a8')).toBe(true);
    expect(game.move('a7a8q')?.san).toBe('a8=Q');
  });
});

describe('finales de partida', () => {
  it('mate del pastor', () => {
    const game = new ChessGame();
    for (const uci of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']) {
      expect(game.move(uci)).not.toBeNull();
    }
    expect(game.outcome()).toEqual({ termination: 'CHECKMATE', winner: 'white' });
  });

  it('rey ahogado', () => {
    const game = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(game.outcome()).toEqual({ termination: 'STALEMATE', winner: null });
  });

  it('material insuficiente: rey contra rey', () => {
    const game = new ChessGame('8/8/4k3/8/8/4K3/8/8 w - - 0 1');
    expect(game.outcome()?.termination).toBe('INSUFFICIENT_MATERIAL');
  });

  it('triple repetición', () => {
    const game = new ChessGame();
    for (let i = 0; i < 2; i++) {
      for (const uci of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) {
        expect(game.move(uci)).not.toBeNull();
      }
    }
    expect(game.outcome()?.termination).toBe('THREEFOLD');
  });

  it('la partida en curso no tiene resultado', () => {
    expect(new ChessGame().outcome()).toBeNull();
  });
});

describe('balance de material', () => {
  it('atribuye cada captura al color que movió', () => {
    const balance = materialBalance([
      { uci: 'e2e4' },
      { uci: 'd7d5' },
      { uci: 'e4d5', captured: 'p' },
      { uci: 'd8d5', captured: 'p' },
      { uci: 'b1c3', captured: undefined },
      { uci: 'd5d1', captured: 'q' },
    ]);
    expect(balance.capturedByWhite).toEqual(['p']);
    expect(balance.capturedByBlack).toEqual(['p', 'q']);
    expect(balance.advantage).toBe(-9);
  });
});

describe('hándicap de material', () => {
  it('sin quitar nada devuelve la posición inicial', () => {
    expect(startingPositionWithout([])).toBe(STARTING_FEN);
  });

  it('quitar un caballo deja una posición jugable', () => {
    const fen = startingPositionWithout(['b8']);
    const game = new ChessGame(fen);
    expect(game.pieces()).toHaveLength(31);
    expect(game.legalMoves().length).toBeGreaterThan(0);
  });

  it('quitar la torre de a1 también quita el enroque largo de las blancas', () => {
    const fen = startingPositionWithout(['a1']);
    expect(fen.split(' ')[2]).toBe('Kkq');
    // Y la posición sigue siendo válida para las reglas.
    expect(new ChessGame(fen).legalMoves().length).toBeGreaterThan(0);
  });

  it('quitar las dos torres de dama deja sólo los enroques cortos', () => {
    expect(startingPositionWithout(['a1', 'a8']).split(' ')[2]).toBe('Kk');
  });

  it('quitar la dama no toca los enroques', () => {
    expect(startingPositionWithout(['d1', 'd8']).split(' ')[2]).toBe('KQkq');
  });
});

describe('libro de aperturas', () => {
  it('reconoce la española por sus tres primeras jugadas', () => {
    const apertura = identifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(apertura?.name).toBe('Apertura española');
    expect(apertura?.eco).toBe('C60');
  });

  it('prefiere la línea más específica, no la primera que encaje', () => {
    // Estas jugadas encajan con "Siciliana", "línea abierta" y "Dragón" a la vez.
    const apertura = identifyOpening(
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3'.split(' '),
    );
    expect(apertura?.name).toBe('Dragón, ataque Yugoslavo');
  });

  it('con una sola jugada devuelve la familia', () => {
    expect(identifyOpening(['d4'])?.name).toBe('Apertura de peón de dama');
  });

  it('devuelve null si ni la primera jugada está en el libro', () => {
    expect(identifyOpening(['h4', 'h5'])).toBeNull();
  });

  it('una partida sin jugadas no tiene apertura', () => {
    expect(identifyOpening([])).toBeNull();
  });

  it('extrae las jugadas de un PGN con cabeceras y comentarios', () => {
    const pgn = [
      '[Event "Partida de Gambito"]',
      '[White "alguien"]',
      '[Result "1-0"]',
      '',
      '1. e4 {buena} e5 2. Nf3 $1 Nc6 3. Bb5 (3. Bc4 Bc5) a6 1-0',
    ].join('\n');
    expect(sanMovesFromPgn(pgn)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });

  it('el PGN que genera una partida real se reconoce', () => {
    const game = new ChessGame();
    for (const uci of ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']) game.move(uci);
    expect(identifyOpening(sanMovesFromPgn(game.pgn()))?.name).toBe('Apertura española');
  });
});
