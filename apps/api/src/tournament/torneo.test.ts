import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { prisma } from '../db.js';
import { closeRedis } from '../redis.js';
import { gameEngine } from '../game/engine.js';
import { matchmaker } from '../game/matchmaking.js';
import { clasificacionDe, comenzarTorneo, registrarResultado } from './motor.js';

const SUFIJO = Math.random().toString(36).slice(2, 8);
let app: FastifyInstance;
const creados: string[] = [];

async function crearJugador(nombre: string, rating: number): Promise<string> {
  const username = `${nombre}_${SUFIJO}`;
  const user = await prisma.user.create({
    data: {
      username,
      usernameLower: username.toLowerCase(),
      email: `${username}@torneo.test`,
      ratings: { create: [{ category: 'BLITZ', rating, gamesPlayed: 20 }] },
    },
    select: { id: true },
  });
  creados.push(user.id);
  return user.id;
}

async function crearTorneo(
  organizador: string,
  formato: 'SWISS' | 'KNOCKOUT' | 'ARENA',
  rondas: number | null,
): Promise<string> {
  const torneo = await prisma.tournament.create({
    data: {
      name: `Prueba ${formato} ${SUFIJO}`,
      format: formato,
      category: 'BLITZ',
      initialSec: 180,
      incrementSec: 2,
      rounds: rondas,
      durationMin: formato === 'ARENA' ? 30 : null,
      startsAt: new Date(),
      createdById: organizador,
    },
    select: { id: true },
  });
  return torneo.id;
}

/** Resuelve todas las partidas pendientes de la ronda actual. */
async function resolverRonda(tournamentId: string, ganaElMejor = true): Promise<number> {
  const torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  return resolverCruces(
    tournamentId,
    { tournamentId, round: torneo.currentRound, isBye: false, result: null },
    ganaElMejor,
  );
}

/**
 * Resuelve cualquier partida pendiente del torneo. La arena no avanza por rondas
 * —vuelve a emparejar apenas termina una partida— así que ahí no sirve filtrar
 * por la ronda actual.
 */
async function resolverPendientes(tournamentId: string, ganaElMejor = true): Promise<number> {
  return resolverCruces(tournamentId, { tournamentId, isBye: false, result: null }, ganaElMejor);
}

async function resolverCruces(
  tournamentId: string,
  filtro: Record<string, unknown>,
  ganaElMejor: boolean,
): Promise<number> {
  const cruces = await prisma.tournamentPairing.findMany({
    where: filtro,
    orderBy: { board: 'asc' },
  });

  for (const cruce of cruces) {
    const entradas = await prisma.tournamentEntry.findMany({
      where: { tournamentId, userId: { in: [cruce.whiteId!, cruce.blackId!] } },
    });
    const blancas = entradas.find((e) => e.userId === cruce.whiteId)!;
    const negras = entradas.find((e) => e.userId === cruce.blackId)!;
    const resultado = !ganaElMejor
      ? 'DRAW'
      : blancas.seedRating >= negras.seedRating
        ? 'WHITE'
        : 'BLACK';
    await prisma.game.update({
      where: { id: cruce.gameId! },
      data: { status: 'FINISHED', result: resultado, endedAt: new Date() },
    });
    await registrarResultado(cruce.gameId!, resultado);
  }
  return cruces.length;
}

beforeAll(async () => {
  app = await buildServer();
});

afterAll(async () => {
  matchmaker.stop();
  gameEngine.shutdown();
  await app.close();
  // El orden importa: los torneos referencian usuarios y los cruces referencian
  // partidas, así que hay que ir de la punta de la cadena hacia la raíz.
  await prisma.tournament.deleteMany({ where: { createdById: { in: creados } } });
  await prisma.game.deleteMany({
    where: { OR: [{ whiteId: { in: creados } }, { blackId: { in: creados } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: creados } } });
  await prisma.$disconnect();
  await closeRedis();
});

describe('torneo suizo de punta a punta', () => {
  it('juega las cinco rondas, sin repetir rivales y con una clasificación coherente', async () => {
    const jugadores = await Promise.all(
      Array.from({ length: 8 }, (_, i) => crearJugador(`sw${i}`, 2000 - i * 50)),
    );
    const torneoId = await crearTorneo(jugadores[0]!, 'SWISS', 5);
    for (const [indice, userId] of jugadores.entries()) {
      await prisma.tournamentEntry.create({
        data: { tournamentId: torneoId, userId, seedRating: 2000 - indice * 50 },
      });
    }

    await comenzarTorneo(torneoId);
    let torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: torneoId } });
    expect(torneo.status).toBe('RUNNING');
    expect(torneo.currentRound).toBe(1);

    // Cada ronda crea cuatro partidas para ocho jugadores.
    for (let ronda = 1; ronda <= 5; ronda++) {
      const partidas = await resolverRonda(torneoId);
      expect(partidas, `ronda ${ronda}`).toBe(4);
    }

    torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: torneoId } });
    expect(torneo.status).toBe('FINISHED');
    expect(torneo.endedAt).not.toBeNull();

    // Nadie se cruzó dos veces con el mismo rival.
    const cruces = await prisma.tournamentPairing.findMany({ where: { tournamentId: torneoId } });
    const vistos = new Set<string>();
    for (const cruce of cruces) {
      if (cruce.isBye) continue;
      const clave = [cruce.whiteId, cruce.blackId].sort().join('-');
      expect(vistos.has(clave), `cruce repetido: ${clave}`).toBe(false);
      vistos.add(clave);
    }

    // Todas las partidas quedaron asociadas al torneo.
    const partidas = await prisma.game.findMany({ where: { tournamentId: torneoId } });
    expect(partidas).toHaveLength(20);

    const clasificacion = await clasificacionDe(torneoId);
    expect(clasificacion).toHaveLength(8);
    // Los puntos suman una unidad por partida jugada.
    const total = clasificacion.reduce((suma, fila) => suma + fila.puntos, 0);
    expect(total).toBe(20);
    // Si siempre gana el mejor sembrado, el primero termina arriba.
    expect(clasificacion[0]?.userId).toBe(jugadores[0]);
    // Y la clasificación está ordenada de verdad.
    for (let i = 1; i < clasificacion.length; i++) {
      expect(clasificacion[i - 1]!.puntos).toBeGreaterThanOrEqual(clasificacion[i]!.puntos);
    }
  });

  it('con número impar reparte un bye por ronda y nadie recibe dos', async () => {
    const jugadores = await Promise.all(
      Array.from({ length: 5 }, (_, i) => crearJugador(`im${i}`, 1900 - i * 40)),
    );
    const torneoId = await crearTorneo(jugadores[0]!, 'SWISS', 3);
    for (const [indice, userId] of jugadores.entries()) {
      await prisma.tournamentEntry.create({
        data: { tournamentId: torneoId, userId, seedRating: 1900 - indice * 40 },
      });
    }

    await comenzarTorneo(torneoId);
    for (let ronda = 1; ronda <= 3; ronda++) await resolverRonda(torneoId);

    const byes = await prisma.tournamentPairing.findMany({
      where: { tournamentId: torneoId, isBye: true },
    });
    expect(byes).toHaveLength(3);
    const conBye = byes.map((b) => b.byeUserId);
    expect(new Set(conBye).size).toBe(3);

    // El bye vale medio punto, que es como quedó configurado el torneo.
    const clasificacion = await clasificacionDe(torneoId);
    const total = clasificacion.reduce((suma, fila) => suma + fila.puntos, 0);
    expect(total).toBe(6 + 1.5);
  });
});

describe('eliminación directa', () => {
  it('va reduciendo el cuadro hasta que queda un campeón', async () => {
    const jugadores = await Promise.all(
      Array.from({ length: 8 }, (_, i) => crearJugador(`ko${i}`, 2100 - i * 60)),
    );
    const torneoId = await crearTorneo(jugadores[0]!, 'KNOCKOUT', null);
    for (const [indice, userId] of jugadores.entries()) {
      await prisma.tournamentEntry.create({
        data: { tournamentId: torneoId, userId, seedRating: 2100 - indice * 60 },
      });
    }

    await comenzarTorneo(torneoId);
    let torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: torneoId } });
    // Ocho jugadores son tres rondas, y las decide el cuadro y no quien lo creó.
    expect(torneo.rounds).toBe(3);

    const porRonda = [4, 2, 1];
    for (const esperadas of porRonda) {
      const partidas = await resolverRonda(torneoId);
      expect(partidas).toBe(esperadas);
    }

    torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: torneoId } });
    expect(torneo.status).toBe('FINISHED');

    const vivos = await prisma.tournamentEntry.findMany({
      where: { tournamentId: torneoId, eliminated: false },
    });
    expect(vivos).toHaveLength(1);
    expect(vivos[0]?.userId).toBe(jugadores[0]);
  });
});

describe('arena', () => {
  it('empareja de nuevo apenas termina una partida y puntúa con racha', async () => {
    const jugadores = await Promise.all(
      Array.from({ length: 4 }, (_, i) => crearJugador(`ar${i}`, 1800 - i * 30)),
    );
    const torneoId = await crearTorneo(jugadores[0]!, 'ARENA', null);
    for (const [indice, userId] of jugadores.entries()) {
      await prisma.tournamentEntry.create({
        data: { tournamentId: torneoId, userId, seedRating: 1800 - indice * 30 },
      });
    }

    await comenzarTorneo(torneoId);
    const primeras = await prisma.tournamentPairing.count({
      where: { tournamentId: torneoId, isBye: false },
    });
    expect(primeras).toBe(2);

    // Al resolver lo pendiente, la arena vuelve a emparejar sola.
    for (let tanda = 0; tanda < 3; tanda++) await resolverPendientes(torneoId);

    const total = await prisma.tournamentPairing.count({
      where: { tournamentId: torneoId, isBye: false },
    });
    expect(total).toBeGreaterThan(primeras);

    const lider = await prisma.tournamentEntry.findUniqueOrThrow({
      where: { tournamentId_userId: { tournamentId: torneoId, userId: jugadores[0]! } },
    });
    // El mejor sembrado gana todas, así que la racha es igual a las partidas.
    expect(lider.games).toBeGreaterThanOrEqual(3);
    expect(lider.streak).toBe(lider.games);
    // Dos puntos por victoria, y doble a partir de la tercera seguida.
    const esperado = lider.games <= 2 ? 2 * lider.games : 4 + 4 * (lider.games - 2);
    expect(lider.score).toBe(esperado);

    const clasificacion = await clasificacionDe(torneoId);
    expect(clasificacion[0]?.userId).toBe(jugadores[0]);
  });
});
