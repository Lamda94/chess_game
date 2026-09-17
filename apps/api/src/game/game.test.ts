import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import { PLAY_NAMESPACE, type GameOverPayload, type GameState, type MatchedPayload } from '@gambito/shared';
import { buildServer } from '../server.js';
import { createSocketServer } from '../socket.js';
import { prisma } from '../db.js';
import { redis, closeRedis } from '../redis.js';
import { gameEngine } from '../game/engine.js';
import { matchmaker } from '../game/matchmaking.js';

const SUFFIX = Math.random().toString(36).slice(2, 8);

interface TestUser {
  id: string;
  username: string;
  cookie: string;
}

let app: FastifyInstance;
let io: ReturnType<typeof createSocketServer>;
let baseUrl: string;
const sockets: Socket[] = [];

/** Espera un evento concreto, o falla con un mensaje útil en vez de colgarse. */
function once<T>(socket: Socket, event: string, timeoutMs = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no llegó el evento "${event}" en ${timeoutMs} ms`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function register(name: string): Promise<TestUser> {
  const username = `${name}_${SUFFIX}`;
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      username,
      email: `${username}@ejemplo.test`,
      password: 'contrasenadeprueba',
      acceptedTerms: true,
    },
  });
  expect(response.statusCode).toBe(201);

  const raw = response.headers['set-cookie'];
  const cookies = (Array.isArray(raw) ? raw : [raw as string]).map((c) => c.split(';')[0]);
  return {
    id: response.json().user.id as string,
    username,
    cookie: cookies.join('; '),
  };
}

function open(user: TestUser): Socket {
  const socket = connect(`${baseUrl}${PLAY_NAMESPACE}`, {
    transports: ['websocket'],
    extraHeaders: { cookie: user.cookie },
    forceNew: true,
  });
  sockets.push(socket);
  return socket;
}

beforeAll(async () => {
  app = await buildServer();
  await app.listen({ port: 0, host: '127.0.0.1' });
  io = createSocketServer(app.server);
  const address = app.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  matchmaker.stop();
  gameEngine.shutdown();
  await io.close();
  await app.close();
  const testUsers = await prisma.user.findMany({
    where: { username: { endsWith: `_${SUFFIX}` } },
    select: { id: true },
  });
  const ids = testUsers.map((u) => u.id);
  // Game referencia a User sin cascada: las partidas se borran primero.
  await prisma.game.deleteMany({
    where: { OR: [{ whiteId: { in: ids } }, { blackId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
  await closeRedis();
});

describe('autenticación del socket', () => {
  it('rechaza una conexión sin sesión', async () => {
    const socket = connect(`${baseUrl}${PLAY_NAMESPACE}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
    const error = await once<Error>(socket, 'connect_error');
    expect(error.message).toBe('UNAUTHENTICATED');
  });
});

describe('partida completa de punta a punta', () => {
  it('empareja, juega el mate del pastor y guarda la partida', async () => {
    const white = await register('blancas');
    const black = await register('negras');

    const socketA = open(white);
    const socketB = open(black);
    await Promise.all([once(socketA, 'connect'), once(socketB, 'connect')]);

    const matchedA = once<MatchedPayload>(socketA, 'queue:matched');
    const matchedB = once<MatchedPayload>(socketB, 'queue:matched');

    const timeControl = { initialSec: 180, incrementSec: 2 };
    socketA.emit('queue:join', { timeControl, rated: true });
    socketB.emit('queue:join', { timeControl, rated: true });

    const [a, b] = await Promise.all([matchedA, matchedB]);
    expect(a.gameId).toBe(b.gameId);
    expect(new Set([a.color, b.color])).toEqual(new Set(['white', 'black']));

    // El que recibió las blancas mueve primero, sin importar quién entró antes.
    const bySide: Record<'white' | 'black', Socket> = {
      white: a.color === 'white' ? socketA : socketB,
      black: a.color === 'white' ? socketB : socketA,
    };
    const gameId = a.gameId;

    bySide.white.emit('game:sync', { gameId });
    bySide.black.emit('game:sync', { gameId });
    const state = await once<GameState>(bySide.white, 'game:state');
    expect(state.status).toBe('ACTIVE');
    expect(state.turn).toBe('white');
    // El reloj de las blancas ya está corriendo, así que es 180 s menos unos pocos ms.
    expect(state.clocks.white).toBeLessThanOrEqual(180_000);
    expect(state.clocks.white).toBeGreaterThan(178_000);
    expect(state.clocks.black).toBe(180_000);

    const over = once<GameOverPayload>(bySide.white, 'game:over', 15_000);

    // Mate del pastor: cuatro jugadas de cada lado.
    const script: Array<['white' | 'black', string]> = [
      ['white', 'e2e4'],
      ['black', 'e7e5'],
      ['white', 'f1c4'],
      ['black', 'b8c6'],
      ['white', 'd1h5'],
      ['black', 'g8f6'],
      ['white', 'h5f7'],
    ];

    // La jugada se difunde a los dos sockets. Si se escucha en uno y se emite en el
    // otro, la copia del emisor puede llegar tarde y confundir la siguiente espera:
    // por eso se acumula todo en un único observador.
    const seen: string[] = [];
    bySide.white.on('game:moveApplied', (payload: { move: { uci: string } }) => {
      seen.push(payload.move.uci);
    });

    for (const [side, uci] of script) {
      const expected = seen.length + 1;
      bySide[side].emit('game:move', { gameId, uci });
      await vi.waitFor(() => expect(seen).toHaveLength(expected), { timeout: 5_000 });
      expect(seen[expected - 1]).toBe(uci);
    }

    const result = await over;
    expect(result.result).toBe('WHITE');
    expect(result.termination).toBe('CHECKMATE');
    expect(result.pgn).toContain('Qxf7#');

    const saved = await prisma.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });
    expect(saved.status).toBe('FINISHED');
    expect(saved.result).toBe('WHITE');
    expect(saved.moves).toHaveLength(7);
    expect(saved.moves[0]?.san).toBe('e4');
    expect(saved.moves[6]?.san).toBe('Qxf7#');
    // El incremento se sumó: tras cuatro jugadas blancas quedan más de 180 s menos lo pensado.
    expect(saved.moves[6]!.clockMsAfter).toBeGreaterThan(180_000);
  });

  it('rechaza una jugada ilegal y devuelve el estado real', async () => {
    const white = await register('legal_b');
    const black = await register('legal_n');
    const socketA = open(white);
    const socketB = open(black);
    await Promise.all([once(socketA, 'connect'), once(socketB, 'connect')]);

    const matchedA = once<MatchedPayload>(socketA, 'queue:matched');
    const matchedB = once<MatchedPayload>(socketB, 'queue:matched');
    const timeControl = { initialSec: 300, incrementSec: 0 };
    socketA.emit('queue:join', { timeControl, rated: true });
    socketB.emit('queue:join', { timeControl, rated: true });
    const [a] = await Promise.all([matchedA, matchedB]);

    const whiteSocket = a.color === 'white' ? socketA : socketB;
    const blackSocket = a.color === 'white' ? socketB : socketA;

    // Las negras no pueden abrir la partida.
    const rejected = once<{ code: string }>(blackSocket, 'error');
    blackSocket.emit('game:move', { gameId: a.gameId, uci: 'e7e5' });
    expect((await rejected).code).toBe('NOT_YOUR_TURN');

    // Ni las blancas pueden mover un peón tres casillas. El servidor responde el
    // error y el estado real uno detrás del otro, así que hay que escuchar los dos
    // antes de emitir: si no, el segundo llega sin oyente y se pierde.
    const illegal = once<{ code: string }>(whiteSocket, 'error');
    const correction = once<GameState>(whiteSocket, 'game:state');
    whiteSocket.emit('game:move', { gameId: a.gameId, uci: 'e2e5' });
    expect((await illegal).code).toBe('ILLEGAL_MOVE');

    const corrected = await correction;
    expect(corrected.moves).toHaveLength(0);
    expect(corrected.turn).toBe('white');
  });

  it('el abandono termina la partida y la deja guardada', async () => {
    const white = await register('rinde_b');
    const black = await register('rinde_n');
    const socketA = open(white);
    const socketB = open(black);
    await Promise.all([once(socketA, 'connect'), once(socketB, 'connect')]);

    const matchedA = once<MatchedPayload>(socketA, 'queue:matched');
    const matchedB = once<MatchedPayload>(socketB, 'queue:matched');
    const timeControl = { initialSec: 600, incrementSec: 0 };
    socketA.emit('queue:join', { timeControl, rated: true });
    socketB.emit('queue:join', { timeControl, rated: true });
    const [a] = await Promise.all([matchedA, matchedB]);

    socketA.emit('game:sync', { gameId: a.gameId });
    socketB.emit('game:sync', { gameId: a.gameId });
    await once<GameState>(socketA, 'game:state');

    const over = once<GameOverPayload>(socketB, 'game:over');
    socketA.emit('game:resign', { gameId: a.gameId });
    const result = await over;

    expect(result.termination).toBe('RESIGNATION');
    expect(result.result).toBe(a.color === 'white' ? 'BLACK' : 'WHITE');

    const saved = await prisma.game.findUniqueOrThrow({ where: { id: a.gameId } });
    expect(saved.status).toBe('FINISHED');
    expect(saved.endedAt).not.toBeNull();
  });
});

describe('recuperación tras un reinicio', () => {
  it('retoma una partida que quedó activa y la cierra por tiempo', async () => {
    const blancas = await register('huerfana_b');
    const negras = await register('huerfana_n');

    // Simula lo que deja atrás un proceso que murió en mitad de una partida:
    // una fila ACTIVE sin nadie que le lleve el reloj.
    const huerfana = await prisma.game.create({
      data: {
        whiteId: blancas.id,
        blackId: negras.id,
        category: 'BULLET',
        initialSec: 1,
        incrementSec: 0,
        rated: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const retomadas = await gameEngine.resumeActive();
    expect(retomadas).toBeGreaterThan(0);

    await vi.waitFor(
      async () => {
        const fila = await prisma.game.findUniqueOrThrow({ where: { id: huerfana.id } });
        expect(fila.status).toBe('FINISHED');
        expect(fila.termination).toBe('TIMEOUT');
        // Le tocaba a las blancas, así que pierden por caída de bandera.
        expect(fila.result).toBe('BLACK');
      },
      { timeout: 8_000, interval: 200 },
    );
  });
});

describe('emparejamiento', () => {
  it('no empareja a jugadores con controles de tiempo distintos', async () => {
    const one = await register('solo_a');
    const two = await register('solo_b');
    const socketA = open(one);
    const socketB = open(two);
    await Promise.all([once(socketA, 'connect'), once(socketB, 'connect')]);

    socketA.emit('queue:join', { timeControl: { initialSec: 60, incrementSec: 0 }, rated: true });
    socketB.emit('queue:join', { timeControl: { initialSec: 1800, incrementSec: 20 }, rated: true });

    let matched = false;
    socketA.once('queue:matched', () => (matched = true));
    socketB.once('queue:matched', () => (matched = true));

    // Un bullet y una clásica están en colas distintas: nunca se cruzan.
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    expect(matched).toBe(false);

    socketA.emit('queue:leave');
    socketB.emit('queue:leave');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await redis.hget('mm:tickets', one.id)).toBeNull();
  });
});
