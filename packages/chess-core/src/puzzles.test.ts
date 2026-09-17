import { describe, expect, it } from 'vitest';
import { PUZZLES, puzzlesParaRating, puzzlesPorTema, TEMAS } from './puzzles.js';
import { conservaElMate, esMateEnN, jugadasQueDanMate, mejorDefensa, posicionJugable } from './mate.js';
import { ChessGame } from './index.js';

describe('set de puzzles', () => {
  it('los identificadores no se repiten', () => {
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada tema declarado existe', () => {
    for (const puzzle of PUZZLES) {
      expect(TEMAS, puzzle.id).toContain(puzzle.tema);
    }
  });

  it('ordena por cercanía al rating', () => {
    const cerca = puzzlesParaRating(800, 1);
    expect(cerca[0]?.rating).toBeLessThanOrEqual(900);
  });

  it('cada tema con puzzles devuelve algo', () => {
    const conPuzzles = new Set(PUZZLES.map((p) => p.tema));
    for (const tema of conPuzzles) {
      expect(puzzlesPorTema(tema).length).toBeGreaterThan(0);
    }
  });

  // Lo que de verdad importa: que cada puzzle sea lo que dice ser.
  describe.each(PUZZLES.map((p) => [p.id, p] as const))('%s', (_id, puzzle) => {
    it('la posición podría darse en una partida', () => {
      expect(posicionJugable(puzzle.fen)).toBe(true);
    });

    it('la partida no está terminada todavía', () => {
      expect(new ChessGame(puzzle.fen).outcome()).toBeNull();
    });

    it(`es mate en ${puzzle.mateEn}, ni más ni menos`, () => {
      expect(esMateEnN(puzzle.fen, puzzle.mateEn), 'no es mate en el número declarado').toBe(true);
      if (puzzle.mateEn > 1) {
        // Si fuera mate en menos, el puzzle estaría mal etiquetado.
        expect(esMateEnN(puzzle.fen, puzzle.mateEn - 1), 'en realidad es mate en menos').toBe(false);
      }
    });

    it('existe al menos una solución aceptada', () => {
      const juego = new ChessGame(puzzle.fen);
      const validas = juego.legalMoves().filter((m) => conservaElMate(puzzle.fen, m.uci, puzzle.mateEn));
      expect(validas.length, 'ninguna jugada conserva el mate').toBeGreaterThan(0);
    });
  });
});

describe('verificación de mate', () => {
  it('reconoce un mate en uno', () => {
    expect(jugadasQueDanMate('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')).toEqual(['a1a8']);
  });

  it('no inventa mates donde no los hay', () => {
    expect(esMateEnN('4k3/8/4K3/8/8/8/8/8 w - - 0 1', 2)).toBe(false);
  });

  it('descarta posiciones donde el rival quedó en jaque', () => {
    // Torre en h1 dando jaque a h8 con las blancas por mover: imposible.
    expect(posicionJugable('7k/8/6K1/8/8/8/8/7R w - - 0 1')).toBe(false);
  });

  it('acepta cualquier jugada que conserve el mate, no una sola', () => {
    const fen = 'k7/2Q5/1K6/8/8/8/8/8 w - - 0 1';
    const aceptadas = new ChessGame(fen)
      .legalMoves()
      .filter((m) => conservaElMate(fen, m.uci, 1));
    expect(aceptadas.length).toBeGreaterThan(1);
  });

  it('rechaza una jugada que tira el mate', () => {
    expect(conservaElMate('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a7', 1)).toBe(false);
  });

  it('elige una defensa legal para continuar el puzzle', () => {
    const fen = '7k/8/8/8/8/8/8/RR5K w - - 0 1';
    const juego = new ChessGame(fen);
    juego.move('b1b7');
    const defensa = mejorDefensa(juego.fen());
    expect(defensa).not.toBeNull();
    expect(juego.legalMoves().map((m) => m.uci)).toContain(defensa!);
  });
});
