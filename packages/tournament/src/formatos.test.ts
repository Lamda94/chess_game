import { describe, expect, it } from 'vitest';
import {
  ESTADO_INICIAL,
  buchholz,
  buchholzMediano,
  calcularDesempates,
  ordenarArena,
  ordenarClasificacion,
  ordenDeSiembra,
  primeraRondaEliminatoria,
  puntuarArena,
  rondasNecesarias,
  siguienteRondaEliminatoria,
  sonnebornBerger,
  tamanoDelCuadro,
  type Participante,
} from './index.js';

function jugador(userId: string, rating: number): Participante {
  return { userId, rating, puntos: 0, rivales: [], colores: [], tuvoBye: false, retirado: false };
}

describe('desempates', () => {
  const puntos = new Map([
    ['a', 4],
    ['b', 3],
    ['c', 2],
    ['d', 1],
    ['e', 0],
  ]);

  it('Buchholz suma los puntos de todos los rivales', () => {
    expect(buchholz(['a', 'c', 'e'], puntos)).toBe(6);
  });

  it('Buchholz mediano descarta al mejor y al peor rival', () => {
    // De 4, 2 y 0 queda sólo el del medio.
    expect(buchholzMediano(['a', 'c', 'e'], puntos)).toBe(2);
  });

  it('con menos de tres rivales el mediano es el Buchholz completo', () => {
    expect(buchholzMediano(['a', 'b'], puntos)).toBe(7);
  });

  it('Sonneborn-Berger pesa contra quién se sacó cada punto', () => {
    // Ganó a "a" (4), empató con "b" (3), perdió con "c" (2).
    const total = sonnebornBerger(
      [
        { rivalId: 'a', puntos: 1 },
        { rivalId: 'b', puntos: 0.5 },
        { rivalId: 'c', puntos: 0 },
      ],
      puntos,
    );
    expect(total).toBe(4 + 1.5);
  });

  it('un rival desconocido cuenta como cero y no rompe el cálculo', () => {
    expect(buchholz(['fantasma'], puntos)).toBe(0);
  });

  it('el desempate distingue a dos jugadores con el mismo puntaje', () => {
    const fuerte = calcularDesempates([{ rivalId: 'a', puntos: 1 }], puntos);
    const flojo = calcularDesempates([{ rivalId: 'e', puntos: 1 }], puntos);
    expect(fuerte.buchholz).toBeGreaterThan(flojo.buchholz);
    expect(fuerte.sonnebornBerger).toBeGreaterThan(flojo.sonnebornBerger);
  });
});

describe('clasificación final', () => {
  const base = { buchholz: 0, buchholzMediano: 0, sonnebornBerger: 0 };

  it('ordena por puntos antes que por nada', () => {
    const orden = ordenarClasificacion([
      { userId: 'a', puntos: 3, rating: 1500, desempates: { ...base, buchholz: 10 } },
      { userId: 'b', puntos: 4, rating: 1200, desempates: { ...base, buchholz: 1 } },
    ]);
    expect(orden[0]?.userId).toBe('b');
  });

  it('a igual puntaje manda el Buchholz', () => {
    const orden = ordenarClasificacion([
      { userId: 'a', puntos: 3, rating: 2000, desempates: { ...base, buchholz: 8 } },
      { userId: 'b', puntos: 3, rating: 1200, desempates: { ...base, buchholz: 12 } },
    ]);
    expect(orden[0]?.userId).toBe('b');
  });

  it('el orden es estable aunque empaten en todo', () => {
    const filas = [
      { userId: 'z', puntos: 2, rating: 1500, desempates: base },
      { userId: 'a', puntos: 2, rating: 1500, desempates: base },
    ];
    expect(ordenarClasificacion(filas).map((f) => f.userId)).toEqual(['a', 'z']);
    expect(ordenarClasificacion([...filas].reverse()).map((f) => f.userId)).toEqual(['a', 'z']);
  });
});

describe('eliminación directa', () => {
  it('el cuadro es la potencia de dos que alcanza', () => {
    expect(tamanoDelCuadro(8)).toBe(8);
    expect(tamanoDelCuadro(9)).toBe(16);
    expect(tamanoDelCuadro(5)).toBe(8);
    expect(rondasNecesarias(8)).toBe(3);
    expect(rondasNecesarias(9)).toBe(4);
  });

  it('la siembra enfrenta al primero con el último', () => {
    expect(ordenDeSiembra(4)).toEqual([1, 4, 2, 3]);
    expect(ordenDeSiembra(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('con un cuadro lleno nadie recibe bye', () => {
    const ronda = primeraRondaEliminatoria(
      ['a', 'b', 'c', 'd'].map((id, i) => jugador(id, 2000 - i * 100)),
    );
    expect(ronda.byes).toHaveLength(0);
    expect(ronda.emparejamientos).toHaveLength(2);
    // El mejor contra el peor.
    expect(ronda.emparejamientos[0]).toMatchObject({ whiteId: 'a', blackId: 'd' });
  });

  it('los lugares que sobran son byes para los mejores clasificados', () => {
    const ronda = primeraRondaEliminatoria(
      ['a', 'b', 'c', 'd', 'e'].map((id, i) => jugador(id, 2000 - i * 100)),
    );
    // Cuadro de 8 con 5 inscriptos: tres byes, y el primer sembrado entre ellos.
    expect(ronda.byes).toContain('a');
    expect(ronda.byes).toHaveLength(3);
    expect(ronda.emparejamientos).toHaveLength(1);
    // El único cruce es entre los dos peores sembrados que sí tienen rival.
    expect([ronda.emparejamientos[0]!.whiteId, ronda.emparejamientos[0]!.blackId].sort()).toEqual(['d', 'e']);
  });

  it('el primero y el segundo sólo pueden cruzarse en la final', () => {
    const ronda = primeraRondaEliminatoria(
      Array.from({ length: 8 }, (_, i) => jugador(`j${i + 1}`, 2000 - i * 50)),
    );
    const mitadDeArriba = ronda.emparejamientos.slice(0, 2).flatMap((e) => [e.whiteId, e.blackId]);
    expect(mitadDeArriba).toContain('j1');
    expect(mitadDeArriba).not.toContain('j2');
  });

  it('la ronda siguiente cruza a los ganadores en el orden del cuadro', () => {
    const ronda = siguienteRondaEliminatoria(['a', 'b', 'c', 'd'], 2);
    expect(ronda.emparejamientos).toHaveLength(2);
    expect(ronda.emparejamientos[0]).toMatchObject({ whiteId: 'a', blackId: 'b' });
    expect(ronda.emparejamientos[1]).toMatchObject({ whiteId: 'c', blackId: 'd' });
  });

  it('un número impar de sobrevivientes deja un bye', () => {
    const ronda = siguienteRondaEliminatoria(['a', 'b', 'c'], 2);
    expect(ronda.emparejamientos).toHaveLength(1);
    expect(ronda.byes).toEqual(['c']);
  });

  it('con un solo inscripto no hay nada que jugar', () => {
    const ronda = primeraRondaEliminatoria([jugador('a', 1500)]);
    expect(ronda.emparejamientos).toHaveLength(0);
  });
});

describe('arena', () => {
  it('una victoria vale dos puntos', () => {
    expect(puntuarArena(ESTADO_INICIAL, 'win').puntos).toBe(2);
  });

  it('las tablas valen uno y la derrota cero', () => {
    expect(puntuarArena(ESTADO_INICIAL, 'draw').puntos).toBe(1);
    expect(puntuarArena(ESTADO_INICIAL, 'loss').puntos).toBe(0);
  });

  it('la tercera victoria seguida ya vale doble', () => {
    let estado = ESTADO_INICIAL;
    estado = puntuarArena(estado, 'win'); // 2
    estado = puntuarArena(estado, 'win'); // 4
    expect(estado.enLlamas).toBe(false);
    estado = puntuarArena(estado, 'win'); // 4 + 4 = 8
    expect(estado.puntos).toBe(8);
    expect(estado.enLlamas).toBe(true);
  });

  it('perder corta la racha y vuelve a los puntos normales', () => {
    let estado = ESTADO_INICIAL;
    for (let i = 0; i < 3; i++) estado = puntuarArena(estado, 'win');
    estado = puntuarArena(estado, 'loss');
    expect(estado.racha).toBe(0);
    expect(estado.enLlamas).toBe(false);
    estado = puntuarArena(estado, 'win');
    expect(estado.puntos).toBe(8 + 2);
  });

  it('unas tablas también cortan la racha', () => {
    let estado = ESTADO_INICIAL;
    for (let i = 0; i < 3; i++) estado = puntuarArena(estado, 'win');
    estado = puntuarArena(estado, 'draw');
    expect(estado.racha).toBe(0);
  });

  it('cuenta todas las partidas jugadas', () => {
    let estado = ESTADO_INICIAL;
    for (const r of ['win', 'loss', 'draw'] as const) estado = puntuarArena(estado, r);
    expect(estado.partidas).toBe(3);
  });

  it('a igual puntaje gana quien jugó menos partidas', () => {
    const orden = ordenarArena([
      { userId: 'a', puntos: 10, partidas: 8, racha: 0, rating: 1500 },
      { userId: 'b', puntos: 10, partidas: 6, racha: 0, rating: 1500 },
    ]);
    expect(orden[0]?.userId).toBe('b');
  });
});
