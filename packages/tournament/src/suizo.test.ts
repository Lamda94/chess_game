import { describe, expect, it } from 'vitest';
import { emparejarRondaSuiza, asignarColores } from './suizo.js';
import type { Participante } from './tipos.js';

function jugador(userId: string, rating: number, extra: Partial<Participante> = {}): Participante {
  return {
    userId,
    rating,
    puntos: 0,
    rivales: [],
    colores: [],
    tuvoBye: false,
    retirado: false,
    ...extra,
  };
}

/** Simula un torneo entero: cada ronda se empareja y se resuelve. */
function simular(cantidad: number, rondas: number, ganaElMejor = true) {
  const jugadores = Array.from({ length: cantidad }, (_, i) =>
    jugador(`j${i + 1}`, 2200 - i * 25),
  );
  const porId = new Map(jugadores.map((j) => [j.userId, j]));
  const historial: ReturnType<typeof emparejarRondaSuiza>[] = [];

  for (let ronda = 0; ronda < rondas; ronda++) {
    const emparejada = emparejarRondaSuiza([...porId.values()]);
    historial.push(emparejada);

    for (const cruce of emparejada.emparejamientos) {
      const blancas = porId.get(cruce.whiteId)!;
      const negras = porId.get(cruce.blackId)!;
      blancas.rivales.push(negras.userId);
      negras.rivales.push(blancas.userId);
      blancas.colores.push('white');
      negras.colores.push('black');
      // El de mejor rating gana, o tablas si se pide un torneo parejo.
      if (!ganaElMejor) {
        blancas.puntos += 0.5;
        negras.puntos += 0.5;
      } else if (blancas.rating >= negras.rating) {
        blancas.puntos += 1;
      } else {
        negras.puntos += 1;
      }
    }
    if (emparejada.bye) {
      const descansa = porId.get(emparejada.bye)!;
      descansa.tuvoBye = true;
      descansa.puntos += 1;
    }
  }
  return { jugadores: [...porId.values()], historial };
}

describe('emparejamiento suizo', () => {
  it('con número par, todos juegan y nadie descansa', () => {
    const ronda = emparejarRondaSuiza([
      jugador('a', 2000),
      jugador('b', 1900),
      jugador('c', 1800),
      jugador('d', 1700),
    ]);
    expect(ronda.bye).toBeNull();
    expect(ronda.emparejamientos).toHaveLength(2);
    const involucrados = ronda.emparejamientos.flatMap((e) => [e.whiteId, e.blackId]);
    expect(new Set(involucrados).size).toBe(4);
  });

  it('la primera ronda cruza la mitad de arriba con la de abajo', () => {
    const ronda = emparejarRondaSuiza([
      jugador('a', 2000),
      jugador('b', 1900),
      jugador('c', 1800),
      jugador('d', 1700),
    ]);
    const cruces = ronda.emparejamientos.map((e) => [e.whiteId, e.blackId].sort().join('-'));
    expect(cruces).toContain('a-c');
    expect(cruces).toContain('b-d');
  });

  it('con número impar alguien descansa, y es de los de abajo', () => {
    const ronda = emparejarRondaSuiza([
      jugador('a', 2000, { puntos: 2 }),
      jugador('b', 1900, { puntos: 2 }),
      jugador('c', 1800, { puntos: 1 }),
      jugador('d', 1700, { puntos: 0 }),
      jugador('e', 1600, { puntos: 0 }),
    ]);
    expect(ronda.bye).not.toBeNull();
    expect(['d', 'e']).toContain(ronda.bye);
    expect(ronda.emparejamientos).toHaveLength(2);
  });

  it('no le da dos byes a la misma persona mientras quede alguien sin uno', () => {
    const ronda = emparejarRondaSuiza([
      jugador('a', 2000, { puntos: 2 }),
      jugador('b', 1900, { puntos: 1 }),
      jugador('c', 1800, { puntos: 0, tuvoBye: true }),
    ]);
    expect(ronda.bye).not.toBe('c');
  });

  it('no repite un cruce que ya se jugó', () => {
    const ronda = emparejarRondaSuiza([
      jugador('a', 2000, { puntos: 1, rivales: ['c'] }),
      jugador('b', 1900, { puntos: 1, rivales: ['d'] }),
      jugador('c', 1800, { puntos: 0, rivales: ['a'] }),
      jugador('d', 1700, { puntos: 0, rivales: ['b'] }),
    ]);
    const cruces = ronda.emparejamientos.map((e) => [e.whiteId, e.blackId].sort().join('-'));
    expect(cruces).not.toContain('a-c');
    expect(cruces).not.toContain('b-d');
  });

  it('deja afuera a quien se retiró', () => {
    const ronda = emparejarRondaSuiza([
      jugador('a', 2000),
      jugador('b', 1900),
      jugador('c', 1800, { retirado: true }),
      jugador('d', 1700),
      jugador('e', 1600, { retirado: true }),
    ]);
    const involucrados = ronda.emparejamientos.flatMap((e) => [e.whiteId, e.blackId]);
    expect(involucrados).not.toContain('c');
    expect(involucrados).not.toContain('e');
  });

  it('con menos de dos jugadores activos no empareja nada', () => {
    expect(emparejarRondaSuiza([jugador('a', 2000)]).emparejamientos).toHaveLength(0);
    expect(emparejarRondaSuiza([]).emparejamientos).toHaveLength(0);
  });
});

describe('colores', () => {
  it('alterna cuando alguien jugó dos veces seguidas con el mismo color', () => {
    const forzado = jugador('a', 2000, { colores: ['white', 'white'] });
    const libre = jugador('b', 1900, { colores: ['white', 'black'] });
    expect(asignarColores(forzado, libre).blackId).toBe('a');
  });

  it('le da blancas a quien viene debiendo blancas', () => {
    const debeBlancas = jugador('a', 1800, { colores: ['black', 'black'] });
    const equilibrado = jugador('b', 2000, { colores: ['white', 'black'] });
    expect(asignarColores(equilibrado, debeBlancas).whiteId).toBe('a');
  });

  it('si están parejos, las blancas van al de más puntos', () => {
    const lider = jugador('a', 1700, { puntos: 3 });
    const otro = jugador('b', 2100, { puntos: 2 });
    expect(asignarColores(otro, lider).whiteId).toBe('a');
  });
});

describe('torneo completo simulado', () => {
  for (const [cantidad, rondas] of [
    [8, 3],
    [16, 5],
    [12, 5],
    [7, 5],
    [33, 7],
  ] as Array<[number, number]>) {
    describe(`${cantidad} jugadores, ${rondas} rondas`, () => {
      const { jugadores, historial } = simular(cantidad, rondas);

      it('nadie se enfrenta dos veces al mismo rival', () => {
        for (const j of jugadores) {
          expect(new Set(j.rivales).size, `${j.userId} repitió rival`).toBe(j.rivales.length);
        }
      });

      it('nadie juega dos partidas en la misma ronda', () => {
        for (const ronda of historial) {
          const involucrados = ronda.emparejamientos.flatMap((e) => [e.whiteId, e.blackId]);
          expect(new Set(involucrados).size).toBe(involucrados.length);
          if (ronda.bye) expect(involucrados).not.toContain(ronda.bye);
        }
      });

      it('nadie recibe más de un bye', () => {
        const byes = historial.map((r) => r.bye).filter((b): b is string => b !== null);
        expect(new Set(byes).size).toBe(byes.length);
      });

      it('cada ronda incluye a todos los que no descansan', () => {
        for (const ronda of historial) {
          const esperados = cantidad - (ronda.bye ? 1 : 0);
          expect(ronda.emparejamientos.length * 2).toBe(esperados);
        }
      });

      it('nadie juega tres veces seguidas con el mismo color', () => {
        for (const j of jugadores) {
          for (let i = 0; i + 2 < j.colores.length; i++) {
            const tres = j.colores.slice(i, i + 3);
            expect(
              new Set(tres).size,
              `${j.userId} jugó ${tres.join(',')} seguidos`,
            ).toBeGreaterThan(1);
          }
        }
      });

      it('el reparto de colores queda equilibrado', () => {
        for (const j of jugadores) {
          const blancas = j.colores.filter((c) => c === 'white').length;
          const negras = j.colores.length - blancas;
          expect(Math.abs(blancas - negras), `${j.userId}: ${blancas}B/${negras}N`).toBeLessThanOrEqual(2);
        }
      });
    });
  }

  it('aguanta un torneo donde todos empatan todo', () => {
    const { jugadores } = simular(10, 5, false);
    for (const j of jugadores) {
      expect(new Set(j.rivales).size).toBe(j.rivales.length);
    }
  });
});
