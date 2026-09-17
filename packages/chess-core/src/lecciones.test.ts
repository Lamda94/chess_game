import { describe, expect, it } from 'vitest';
import { ChessGame } from './index.js';
import { LECCIONES, RUTAS, RUTA_INFO, leccionPorSlug, leccionesDeRuta } from './lecciones.js';

/**
 * El contenido del salón se verifica entero. Una lección con un FEN mal escrito o
 * una jugada esperada que no existe es un error que no se puede descubrir delante
 * de alguien que está aprendiendo.
 */
describe('contenido de las lecciones', () => {
  it('los slugs no se repiten', () => {
    const slugs = LECCIONES.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('todas las rutas tienen al menos una lección', () => {
    for (const ruta of RUTAS) {
      expect(leccionesDeRuta(ruta).length, `ruta ${ruta}`).toBeGreaterThan(0);
    }
  });

  it('cada lección pertenece a una ruta conocida', () => {
    for (const leccion of LECCIONES) {
      expect(RUTA_INFO[leccion.ruta], leccion.slug).toBeDefined();
    }
  });

  it('se puede buscar cada lección por su slug', () => {
    for (const leccion of LECCIONES) {
      expect(leccionPorSlug(leccion.slug)?.titulo).toBe(leccion.titulo);
    }
    expect(leccionPorSlug('no-existe')).toBeNull();
  });

  // El caso que de verdad importa: cada posición y cada jugada tienen que ser reales.
  describe.each(LECCIONES.map((l) => [l.slug, l] as const))('%s', (_slug, leccion) => {
    it('tiene al menos un paso', () => {
      expect(leccion.pasos.length).toBeGreaterThan(0);
    });

    leccion.pasos.forEach((paso, indice) => {
      it(`paso ${indice + 1}: la posición es legal y la jugada esperada existe`, () => {
        // Un FEN inválido hace que chess.js lance; que llegue a construirse ya prueba
        // que la posición es legal.
        const juego = new ChessGame(paso.fen);
        expect(juego.fen().split(' ')[0]).toBe(paso.fen.split(' ')[0]);

        if (paso.esperada) {
          const legales = juego.legalMoves().map((m) => m.uci);
          expect(legales, `jugadas legales en ${paso.fen}`).toContain(paso.esperada);
        }
      });

      it(`paso ${indice + 1}: el texto explica algo`, () => {
        expect(paso.texto.length).toBeGreaterThan(40);
      });
    });
  });
});
