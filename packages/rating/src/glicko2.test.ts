import { describe, expect, it } from 'vitest';
import { INITIAL, MAX_RD, MIN_RD, applyGame, decay, displayRating, update, type Rating } from './glicko2.js';

describe('ejemplo publicado por Glickman', () => {
  // Único caso de referencia del artículo original: un jugador de 1500/200 que
  // gana contra 1400, pierde contra 1550 y pierde contra 1700 en un mismo período.
  const jugador: Rating = { rating: 1500, rd: 200, volatility: 0.06 };
  const resultado = update(jugador, [
    { opponent: { rating: 1400, rd: 30, volatility: 0.06 }, score: 1 },
    { opponent: { rating: 1550, rd: 100, volatility: 0.06 }, score: 0 },
    { opponent: { rating: 1700, rd: 300, volatility: 0.06 }, score: 0 },
  ]);

  // El artículo publica 1464.06 / 151.52 / 0.05999, pero calcula el rating final a
  // partir de un μ' ya redondeado a cuatro decimales y trunca la volatilidad. Los
  // valores exactos, verificados estables bajando la tolerancia del método iterativo
  // en seis órdenes de magnitud, son los de abajo. Se comparan contra el artículo con
  // una centésima de margen, y contra el valor exacto con toda la precisión.
  it('llega al rating del artículo', () => {
    expect(resultado.rating).toBeCloseTo(1464.06, 1);
    expect(resultado.rating).toBeCloseTo(1464.0506705, 6);
  });

  it('llega a la desviación del artículo', () => {
    expect(resultado.rd).toBeCloseTo(151.52, 1);
    expect(resultado.rd).toBeCloseTo(151.5165241, 6);
  });

  it('llega a la volatilidad del artículo', () => {
    expect(resultado.volatility).toBeCloseTo(0.05999, 4);
    expect(resultado.volatility).toBeCloseTo(0.0599959843, 9);
  });
});

describe('una partida suelta', () => {
  const dosIguales = (): [Rating, Rating] => [
    { rating: 1500, rd: 200, volatility: 0.06 },
    { rating: 1500, rd: 200, volatility: 0.06 },
  ];

  it('el que gana sube y el que pierde baja lo mismo, si venían iguales', () => {
    const [blancas, negras] = dosIguales();
    const salida = applyGame(blancas, negras, 'WHITE');
    const sube = salida.white.rating - 1500;
    const baja = 1500 - salida.black.rating;
    expect(sube).toBeGreaterThan(0);
    expect(sube).toBeCloseTo(baja, 6);
  });

  it('entre iguales, las tablas no mueven el rating', () => {
    const [blancas, negras] = dosIguales();
    const salida = applyGame(blancas, negras, 'DRAW');
    expect(salida.white.rating).toBeCloseTo(1500, 6);
    expect(salida.black.rating).toBeCloseTo(1500, 6);
  });

  it('ganarle a alguien mucho mejor da más puntos que ganarle a un igual', () => {
    const base: Rating = { rating: 1500, rd: 200, volatility: 0.06 };
    const contraIgual = update(base, [{ opponent: { rating: 1500, rd: 200, volatility: 0.06 }, score: 1 }]);
    const contraMejor = update(base, [{ opponent: { rating: 2100, rd: 200, volatility: 0.06 }, score: 1 }]);
    expect(contraMejor.rating).toBeGreaterThan(contraIgual.rating);
  });

  it('cada jugador se calcula contra el rating previo del otro, no contra el ya actualizado', () => {
    const blancas: Rating = { rating: 1800, rd: 60, volatility: 0.06 };
    const negras: Rating = { rating: 1400, rd: 60, volatility: 0.06 };
    const salida = applyGame(blancas, negras, 'BLACK');

    const esperadoBlancas = update(blancas, [{ opponent: negras, score: 0 }]);
    const esperadoNegras = update(negras, [{ opponent: blancas, score: 1 }]);
    expect(salida.white.rating).toBeCloseTo(esperadoBlancas.rating, 10);
    expect(salida.black.rating).toBeCloseTo(esperadoNegras.rating, 10);
  });

  it('la desviación baja al jugar: el sistema aprende del jugador', () => {
    const base: Rating = { rating: 1500, rd: 200, volatility: 0.06 };
    const despues = update(base, [{ opponent: { rating: 1500, rd: 50, volatility: 0.06 }, score: 1 }]);
    expect(despues.rd).toBeLessThan(base.rd);
  });
});

describe('inactividad y topes', () => {
  it('no jugar ensancha la desviación sin tocar el rating', () => {
    const base: Rating = { rating: 1742, rd: 60, volatility: 0.06 };
    const despues = decay(base);
    expect(despues.rating).toBe(1742);
    expect(despues.rd).toBeGreaterThan(60);
  });

  it('la desviación nunca pasa el techo por más que se abandone la cuenta', () => {
    let actual: Rating = { ...INITIAL, rd: MAX_RD };
    for (let i = 0; i < 500; i++) actual = decay(actual);
    expect(actual.rd).toBeLessThanOrEqual(MAX_RD);
  });

  it('la desviación nunca baja del piso por más que se juegue', () => {
    let actual: Rating = { rating: 1500, rd: 200, volatility: 0.06 };
    for (let i = 0; i < 300; i++) {
      actual = update(actual, [{ opponent: { rating: 1500, rd: 30, volatility: 0.06 }, score: i % 2 }] as never);
    }
    expect(actual.rd).toBeGreaterThanOrEqual(MIN_RD);
  });
});

describe('presentación', () => {
  it('el rating que se muestra es entero', () => {
    expect(displayRating({ rating: 1464.0631, rd: 151, volatility: 0.06 })).toBe(1464);
  });
});
