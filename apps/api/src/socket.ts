import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
  type SocketErrorCode,
  PLAY_NAMESPACE,
  chatSendSchema,
  drawResponseSchema,
  gameIdSchema,
  gameMoveSchema,
  gameRoom,
  watchRoom,
  queueJoinSchema,
  categoryFor,
  tournamentIdSchema,
  tournamentRoom,
} from '@gambito/shared';
import { prisma } from './db.js';
import { env } from './env.js';
import { pubClient, subClient } from './redis.js';
import { ACCESS_COOKIE } from './auth/session.js';
import { verifyAccessToken } from './auth/tokens.js';
import { gameEngine } from './game/engine.js';
import { matchmaker } from './game/matchmaking.js';
import { conectarDifusorTorneo } from './tournament/motor.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/** Parser mínimo de cabecera Cookie: alcanza para sacar un valor por nombre. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function createSocketServer(httpServer: HttpServer): IO {
  const io: IO = new Server(httpServer, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    // Las cookies httpOnly viajan solas en el handshake, así que no hace falta
    // pasar el token por query string (donde quedaría en los logs).
    transports: ['websocket', 'polling'],
  });
  io.adapter(createAdapter(pubClient, subClient));

  const play = io.of(PLAY_NAMESPACE);

  play.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
    const claims = token ? await verifyAccessToken(token) : null;
    if (!claims || !claims.username) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    // Una suspensión tiene que cortar el juego en curso, no esperar a que venza
    // el token: por eso se consulta el estado de la cuenta en cada conexión.
    const cuenta = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { suspendedAt: true },
    });
    if (!cuenta || cuenta.suspendedAt) {
      next(new Error('ACCOUNT_SUSPENDED'));
      return;
    }

    socket.data.userId = claims.sub;
    socket.data.username = claims.username;
    next();
  });

  const fail = (socket: { emit: ServerToClientEvents['error'] extends never ? never : any }, code: SocketErrorCode, message: string) => {
    socket.emit('error', { code, message });
  };

  play.on('connection', (socket) => {
    const { userId } = socket.data;
    void socket.join(userRoom(userId));

    socket.on('queue:join', async (raw) => {
      const parsed = queueJoinSchema.safeParse(raw);
      if (!parsed.success) return fail(socket, 'INVALID_INPUT', 'Control de tiempo inválido.');

      const category = categoryFor(parsed.data.timeControl);
      const rating = await prisma.rating.findUnique({
        where: { userId_category: { userId, category } },
        select: { rating: true },
      });

      await matchmaker.join({
        userId,
        rating: rating?.rating ?? 1500,
        timeControl: parsed.data.timeControl,
        rated: parsed.data.rated,
      });

      const status = await matchmaker.statusOf(userId);
      if (status) socket.emit('queue:status', status);
    });

    socket.on('queue:leave', async () => {
      await matchmaker.leave(userId);
    });

    socket.on('game:sync', async (raw) => {
      const parsed = gameIdSchema.safeParse(raw);
      if (!parsed.success) return fail(socket, 'INVALID_INPUT', 'Partida inválida.');

      const state = await gameEngine.stateOf(parsed.data.gameId);
      if (!state) return fail(socket, 'GAME_NOT_FOUND', 'Esa partida no existe.');

      // Todos —jugadores y espectadores— entran a la sala pública, que es la que
      // reparte las jugadas. A la privada, con el chat y las tablas, sólo los
      // dos que juegan.
      const isPlayer = state.white.id === userId || state.black.id === userId;

      // Al pasar de una partida a otra hay que soltar la anterior, o se seguirían
      // recibiendo sus jugadas.
      const anterior = socket.data.watching;
      if (anterior && anterior !== state.id) {
        void socket.leave(watchRoom(anterior));
        void socket.leave(gameRoom(anterior));
      }
      socket.data.watching = state.id;

      void socket.join(watchRoom(state.id));
      if (isPlayer) void socket.join(gameRoom(state.id));
      socket.emit('game:state', state);
    });

    socket.on('game:move', async (raw) => {
      const parsed = gameMoveSchema.safeParse(raw);
      if (!parsed.success) return fail(socket, 'INVALID_INPUT', 'Jugada mal formada.');

      const result = await gameEngine.move(parsed.data.gameId, userId, parsed.data.uci);
      if (!result.ok) {
        const messages: Record<string, string> = {
          GAME_NOT_FOUND: 'Esa partida no existe.',
          GAME_FINISHED: 'La partida ya terminó.',
          NOT_IN_GAME: 'No estás jugando esta partida.',
          NOT_YOUR_TURN: 'No es tu turno.',
          ILLEGAL_MOVE: 'Esa jugada no es legal.',
        };
        fail(socket, result.reason, messages[result.reason] ?? 'No se pudo aplicar la jugada.');
        // Devolvemos el estado real para que el tablero se corrija solo.
        const state = await gameEngine.stateOf(parsed.data.gameId);
        if (state) socket.emit('game:state', state);
      }
    });

    socket.on('game:resign', async (raw) => {
      const parsed = gameIdSchema.safeParse(raw);
      if (!parsed.success) return;
      await gameEngine.resign(parsed.data.gameId, userId);
    });

    socket.on('game:offerDraw', async (raw) => {
      const parsed = gameIdSchema.safeParse(raw);
      if (!parsed.success) return;
      await gameEngine.offerDraw(parsed.data.gameId, userId);
    });

    socket.on('game:respondDraw', async (raw) => {
      const parsed = drawResponseSchema.safeParse(raw);
      if (!parsed.success) return;
      await gameEngine.respondDraw(parsed.data.gameId, userId, parsed.data.accept);
    });

    socket.on('chat:send', async (raw) => {
      const parsed = chatSendSchema.safeParse(raw);
      if (!parsed.success) return fail(socket, 'INVALID_INPUT', 'Mensaje inválido.');

      const state = await gameEngine.stateOf(parsed.data.gameId);
      if (!state) return fail(socket, 'GAME_NOT_FOUND', 'Esa partida no existe.');
      if (state.white.id !== userId && state.black.id !== userId) {
        return fail(socket, 'NOT_IN_GAME', 'Sólo los jugadores pueden escribir.');
      }

      const row = await prisma.chatMessage.create({
        data: { gameId: parsed.data.gameId, userId, body: parsed.data.body },
        select: { id: true, at: true },
      });
      play.to(gameRoom(parsed.data.gameId)).emit('chat:message', {
        id: row.id,
        gameId: parsed.data.gameId,
        from: socket.data.username,
        body: parsed.data.body,
        at: row.at.getTime(),
      });
    });

    // Espectar un torneo: sólo hay que entrar a su sala para recibir los avisos.
    socket.on('tournament:watch', (raw) => {
      const parsed = tournamentIdSchema.safeParse(raw);
      if (!parsed.success) return;
      void socket.join(tournamentRoom(parsed.data.tournamentId));
    });

    socket.on('tournament:unwatch', (raw) => {
      const parsed = tournamentIdSchema.safeParse(raw);
      if (!parsed.success) return;
      void socket.leave(tournamentRoom(parsed.data.tournamentId));
    });

    socket.on('disconnect', async () => {
      // Salir de la cola al desconectarse evita emparejar contra un fantasma.
      // La partida en curso NO se toca: el jugador puede reconectar.
      await matchmaker.leave(userId);
      // updateMany y no update: si la cuenta ya no existe esto no es un error,
      // es simplemente una fila que no coincide.
      await prisma.user.updateMany({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      });
    });
  });

  /* ---------------------------------------------------------------- */
  /* Puentes entre el motor / la cola y los sockets                     */
  /* ---------------------------------------------------------------- */

  gameEngine.setBroadcaster({
    moveApplied: (gameId, payload) => {
      play.to(watchRoom(gameId)).emit('game:moveApplied', payload);
    },
    gameOver: (gameId, payload) => {
      play.to(watchRoom(gameId)).emit('game:over', payload);
    },
    drawOffered: (gameId, from) => {
      play.to(gameRoom(gameId)).emit('game:drawOffered', { gameId, from });
    },
    drawDeclined: (gameId) => {
      play.to(gameRoom(gameId)).emit('game:drawDeclined', { gameId });
    },
  });

  conectarDifusorTorneo({
    clasificacionCambio: (tournamentId) => {
      play.to(tournamentRoom(tournamentId)).emit('tournament:update', {
        tournamentId,
        motivo: 'clasificacion',
      });
    },
    rondaEmpezo: (tournamentId, ronda) => {
      play.to(tournamentRoom(tournamentId)).emit('tournament:update', {
        tournamentId,
        motivo: 'ronda',
        ronda,
      });
    },
    torneoTermino: (tournamentId) => {
      play.to(tournamentRoom(tournamentId)).emit('tournament:update', {
        tournamentId,
        motivo: 'fin',
      });
    },
  });

  matchmaker.setMatchHandler(({ gameId, white, black }) => {
    play.to(userRoom(white.id)).emit('queue:matched', { gameId, color: 'white' });
    play.to(userRoom(black.id)).emit('queue:matched', { gameId, color: 'black' });
  });
  matchmaker.start();

  // Latido de la cola: mantiene vivo el contador y el rango en la pantalla de espera.
  const ticker = setInterval(() => {
    void (async () => {
      const sockets = await play.fetchSockets();
      for (const socket of sockets) {
        const status = await matchmaker.statusOf(socket.data.userId);
        if (status) socket.emit('queue:status', status);
      }
    })();
  }, 1_000);
  ticker.unref?.();

  return io;
}
