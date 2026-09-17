import { ChessGame } from '@gambito/chess-core';
import {
  type Category,
  type Color,
  type GameOverPayload,
  type GameResult,
  type GameState,
  type MoveView,
  type PlayerView,
  type Termination,
  type TimeControl,
  opposite,
} from '@gambito/shared';
import { prisma } from '../db.js';
import { applyRatedResult, countUnratedGame } from './ratings.js';

/** Lo que el motor necesita para avisar al mundo. Lo implementa la capa de sockets. */
export interface GameBroadcaster {
  moveApplied(gameId: string, payload: Parameters<GameEvents['moveApplied']>[1]): void;
  gameOver(gameId: string, payload: GameOverPayload): void;
  drawOffered(gameId: string, from: Color): void;
  drawDeclined(gameId: string): void;
}

interface GameEvents {
  moveApplied: (
    gameId: string,
    payload: {
      gameId: string;
      move: MoveView;
      turn: Color;
      clocks: Record<Color, number>;
      turnStartedAt: number;
      drawOfferFrom: Color | null;
    },
  ) => void;
}

interface LiveGame {
  id: string;
  category: Category;
  timeControl: TimeControl;
  rated: boolean;
  players: Record<Color, PlayerView>;
  chess: ChessGame;
  moves: MoveView[];
  clocks: Record<Color, number>;
  /** Momento en que empezó a correr el reloj del jugador en turno. */
  turnStartedAt: number | null;
  status: 'ACTIVE' | 'FINISHED';
  drawOfferFrom: Color | null;
  flagTimer: NodeJS.Timeout | null;
}

export type MoveFailure =
  | 'GAME_NOT_FOUND'
  | 'GAME_FINISHED'
  | 'NOT_IN_GAME'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE';

export class GameEngine {
  private readonly games = new Map<string, LiveGame>();
  private broadcaster: GameBroadcaster | null = null;

  setBroadcaster(broadcaster: GameBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /* ------------------------------------------------------------------ */
  /* Ciclo de vida                                                       */
  /* ------------------------------------------------------------------ */

  async create(params: {
    white: PlayerView;
    black: PlayerView;
    category: Category;
    timeControl: TimeControl;
    rated: boolean;
    /** Cuando la partida forma parte de un torneo. */
    tournamentId?: string;
  }): Promise<string> {
    const row = await prisma.game.create({
      data: {
        whiteId: params.white.id,
        blackId: params.black.id,
        category: params.category,
        initialSec: params.timeControl.initialSec,
        incrementSec: params.timeControl.incrementSec,
        rated: params.rated,
        status: 'ACTIVE',
        whiteRatingBefore: params.white.rating,
        blackRatingBefore: params.black.rating,
        tournamentId: params.tournamentId ?? null,
      },
      select: { id: true },
    });

    const initialMs = params.timeControl.initialSec * 1000;
    const game: LiveGame = {
      id: row.id,
      category: params.category,
      timeControl: params.timeControl,
      rated: params.rated,
      players: { white: params.white, black: params.black },
      chess: new ChessGame(),
      moves: [],
      clocks: { white: initialMs, black: initialMs },
      turnStartedAt: Date.now(),
      status: 'ACTIVE',
      drawOfferFrom: null,
      flagTimer: null,
    };
    this.games.set(row.id, game);
    this.armFlagTimer(game);
    return row.id;
  }

  /**
   * Devuelve la partida viva, rehidratándola desde la base si el proceso se
   * reinició. Sin esto, un deploy en mitad de una partida la perdería.
   */
  async get(gameId: string): Promise<LiveGame | null> {
    const cached = this.games.get(gameId);
    if (cached) return cached;

    const row = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        moves: { orderBy: { ply: 'asc' } },
        white: { select: { id: true, username: true, avatarUrl: true, country: true } },
        black: { select: { id: true, username: true, avatarUrl: true, country: true } },
      },
    });
    if (!row) return null;

    const chess = new ChessGame();
    const moves: MoveView[] = [];
    for (const move of row.moves) {
      chess.move(move.uci);
      moves.push({
        ply: move.ply,
        san: move.san,
        uci: move.uci,
        fenAfter: move.fenAfter,
        clockMsAfter: move.clockMsAfter,
      });
    }

    const initialMs = row.initialSec * 1000;
    const lastWhite = [...moves].reverse().find((m) => m.ply % 2 === 1);
    const lastBlack = [...moves].reverse().find((m) => m.ply % 2 === 0);

    const toPlayer = (
      user: { id: string; username: string | null; avatarUrl: string | null; country: string | null },
      rating: number | null,
    ): PlayerView => ({
      id: user.id,
      username: user.username ?? 'anónimo',
      rating: rating ?? 1500,
      provisional: false,
      avatarUrl: user.avatarUrl,
      country: user.country,
    });

    const game: LiveGame = {
      id: row.id,
      category: row.category,
      timeControl: { initialSec: row.initialSec, incrementSec: row.incrementSec },
      rated: row.rated,
      players: {
        white: toPlayer(row.white, row.whiteRatingBefore),
        black: toPlayer(row.black, row.blackRatingBefore),
      },
      chess,
      moves,
      clocks: {
        white: lastWhite?.clockMsAfter ?? initialMs,
        black: lastBlack?.clockMsAfter ?? initialMs,
      },
      turnStartedAt: row.status === 'ACTIVE' ? Date.now() : null,
      status: row.status === 'FINISHED' ? 'FINISHED' : 'ACTIVE',
      drawOfferFrom: null,
      flagTimer: null,
    };

    this.games.set(gameId, game);
    if (game.status === 'ACTIVE') this.armFlagTimer(game);
    return game;
  }

  colorOf(game: LiveGame, userId: string): Color | null {
    if (game.players.white.id === userId) return 'white';
    if (game.players.black.id === userId) return 'black';
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Relojes                                                             */
  /* ------------------------------------------------------------------ */

  /** Milisegundos que le quedan a cada uno *ahora*, descontando el turno en curso. */
  private liveClocks(game: LiveGame): Record<Color, number> {
    const clocks = { ...game.clocks };
    if (game.status === 'ACTIVE' && game.turnStartedAt !== null) {
      const turn = game.chess.turn();
      clocks[turn] = Math.max(0, clocks[turn] - (Date.now() - game.turnStartedAt));
    }
    return clocks;
  }

  private armFlagTimer(game: LiveGame): void {
    if (game.flagTimer) clearTimeout(game.flagTimer);
    if (game.status !== 'ACTIVE' || game.turnStartedAt === null) return;
    const turn = game.chess.turn();
    const remaining = game.clocks[turn];
    game.flagTimer = setTimeout(() => {
      void this.flag(game.id);
    }, Math.max(0, remaining) + 50);
  }

  /** Caída de bandera: la dispara el servidor, nunca el cliente. */
  private async flag(gameId: string): Promise<void> {
    const game = this.games.get(gameId);
    if (!game || game.status !== 'ACTIVE') return;
    const turn = game.chess.turn();
    if (this.liveClocks(game)[turn] > 0) {
      // Llegó antes de tiempo (por ejemplo tras una rehidratación); rearmamos.
      this.armFlagTimer(game);
      return;
    }
    await this.finish(game, turn === 'white' ? 'BLACK' : 'WHITE', 'TIMEOUT');
  }

  /* ------------------------------------------------------------------ */
  /* Jugadas                                                             */
  /* ------------------------------------------------------------------ */

  async move(
    gameId: string,
    userId: string,
    uci: string,
  ): Promise<{ ok: true } | { ok: false; reason: MoveFailure }> {
    const game = await this.get(gameId);
    if (!game) return { ok: false, reason: 'GAME_NOT_FOUND' };
    if (game.status !== 'ACTIVE') return { ok: false, reason: 'GAME_FINISHED' };

    const color = this.colorOf(game, userId);
    if (!color) return { ok: false, reason: 'NOT_IN_GAME' };
    if (game.chess.turn() !== color) return { ok: false, reason: 'NOT_YOUR_TURN' };

    const now = Date.now();
    const elapsed = game.turnStartedAt === null ? 0 : now - game.turnStartedAt;

    // Si se le acabó el tiempo antes de que llegara la jugada, gana el rival.
    if (game.clocks[color] - elapsed <= 0) {
      game.clocks[color] = 0;
      await this.finish(game, color === 'white' ? 'BLACK' : 'WHITE', 'TIMEOUT');
      return { ok: false, reason: 'GAME_FINISHED' };
    }

    const applied = game.chess.move(uci);
    if (!applied) return { ok: false, reason: 'ILLEGAL_MOVE' };

    game.clocks[color] = game.clocks[color] - elapsed + game.timeControl.incrementSec * 1000;
    game.turnStartedAt = now;
    game.drawOfferFrom = null;

    const move: MoveView = {
      ply: game.moves.length + 1,
      san: applied.san,
      uci: applied.uci,
      fenAfter: game.chess.fen(),
      clockMsAfter: Math.round(game.clocks[color]),
    };
    game.moves.push(move);

    await prisma.move.create({
      data: {
        gameId: game.id,
        ply: move.ply,
        san: move.san,
        uci: move.uci,
        fenAfter: move.fenAfter,
        clockMsAfter: move.clockMsAfter,
      },
    });

    this.broadcaster?.moveApplied(game.id, {
      gameId: game.id,
      move,
      turn: game.chess.turn(),
      clocks: this.liveClocks(game),
      turnStartedAt: now,
      drawOfferFrom: null,
    });

    const outcome = game.chess.outcome();
    if (outcome) {
      const result: GameResult =
        outcome.winner === null ? 'DRAW' : outcome.winner === 'white' ? 'WHITE' : 'BLACK';
      await this.finish(game, result, outcome.termination);
    } else {
      this.armFlagTimer(game);
    }

    return { ok: true };
  }

  /* ------------------------------------------------------------------ */
  /* Rendición y tablas                                                  */
  /* ------------------------------------------------------------------ */

  async resign(gameId: string, userId: string): Promise<boolean> {
    const game = await this.get(gameId);
    if (!game || game.status !== 'ACTIVE') return false;
    const color = this.colorOf(game, userId);
    if (!color) return false;
    await this.finish(game, color === 'white' ? 'BLACK' : 'WHITE', 'RESIGNATION');
    return true;
  }

  async offerDraw(gameId: string, userId: string): Promise<boolean> {
    const game = await this.get(gameId);
    if (!game || game.status !== 'ACTIVE') return false;
    const color = this.colorOf(game, userId);
    if (!color || game.drawOfferFrom === color) return false;

    // Si el rival ya había ofrecido, aceptar la oferta cruzada es tablas.
    if (game.drawOfferFrom === opposite(color)) {
      await this.finish(game, 'DRAW', 'AGREEMENT');
      return true;
    }
    game.drawOfferFrom = color;
    this.broadcaster?.drawOffered(game.id, color);
    return true;
  }

  async respondDraw(gameId: string, userId: string, accept: boolean): Promise<boolean> {
    const game = await this.get(gameId);
    if (!game || game.status !== 'ACTIVE' || !game.drawOfferFrom) return false;
    const color = this.colorOf(game, userId);
    if (!color || game.drawOfferFrom === color) return false;

    if (accept) {
      await this.finish(game, 'DRAW', 'AGREEMENT');
    } else {
      game.drawOfferFrom = null;
      this.broadcaster?.drawDeclined(game.id);
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Cierre                                                              */
  /* ------------------------------------------------------------------ */

  private async finish(
    game: LiveGame,
    result: GameResult,
    termination: Termination,
  ): Promise<void> {
    if (game.status === 'FINISHED') return;
    game.status = 'FINISHED';
    if (game.flagTimer) clearTimeout(game.flagTimer);
    game.flagTimer = null;
    game.turnStartedAt = null;
    game.drawOfferFrom = null;

    game.chess.setHeaders({
      Event: 'Partida de Gambito',
      Site: 'Gambito',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: game.players.white.username,
      Black: game.players.black.username,
      Result: result === 'DRAW' ? '1/2-1/2' : result === 'WHITE' ? '1-0' : '0-1',
      TimeControl: `${game.timeControl.initialSec}+${game.timeControl.incrementSec}`,
      Termination: termination,
    });
    const pgn = game.chess.pgn();
    const finalFen = game.chess.fen();

    // El rating se mueve antes de guardar la partida, para dejar registrado en la
    // misma fila con cuánto entró y con cuánto salió cada jugador.
    const change = game.rated
      ? await applyRatedResult({
          whiteId: game.players.white.id,
          blackId: game.players.black.id,
          category: game.category,
          result,
        })
      : null;

    if (!game.rated) {
      await countUnratedGame([game.players.white.id, game.players.black.id], game.category);
    }

    await prisma.game.update({
      where: { id: game.id },
      data: {
        status: 'FINISHED',
        result,
        termination,
        pgn,
        finalFen,
        endedAt: new Date(),
        ...(change
          ? {
              whiteRatingBefore: change.before.white,
              blackRatingBefore: change.before.black,
              whiteRatingAfter: change.after.white,
              blackRatingAfter: change.after.black,
            }
          : {}),
      },
    });

    // El torneo se entera después de que la partida quedó guardada: así la
    // clasificación nunca se calcula sobre un resultado a medio escribir.
    // Importación diferida porque el motor de torneos importa este módulo: el
    // ciclo se rompe resolviéndolo recién cuando hace falta. El error se registra
    // en vez de tragarse — un torneo que no avanza sin dejar rastro es peor que
    // uno que falla ruidosamente.
    try {
      const { registrarResultado } = await import('../tournament/motor.js');
      await registrarResultado(game.id, result);
    } catch (error) {
      console.error('[torneo] no se pudo registrar el resultado', game.id, error);
    }

    this.broadcaster?.gameOver(game.id, {
      gameId: game.id,
      result,
      termination,
      finalFen,
      pgn,
      ratingDelta: change?.delta ?? null,
      ratingAfter: change?.after ?? null,
    });

    // Se mantiene un rato en memoria para que la pantalla de fin pueda sincronizar.
    setTimeout(() => this.games.delete(game.id), 60_000).unref?.();
  }

  /* ------------------------------------------------------------------ */
  /* Lectura                                                             */
  /* ------------------------------------------------------------------ */

  async stateOf(gameId: string): Promise<GameState | null> {
    const game = await this.get(gameId);
    if (!game) return null;
    const row =
      game.status === 'FINISHED'
        ? await prisma.game.findUnique({
            where: { id: gameId },
            select: { result: true, termination: true },
          })
        : null;

    return {
      id: game.id,
      category: game.category,
      timeControl: game.timeControl,
      rated: game.rated,
      white: game.players.white,
      black: game.players.black,
      fen: game.chess.fen(),
      moves: game.moves,
      turn: game.chess.turn(),
      clocks: this.liveClocks(game),
      turnStartedAt: game.turnStartedAt,
      status: game.status,
      result: row?.result ?? null,
      termination: row?.termination ?? null,
      drawOfferFrom: game.drawOfferFrom,
    };
  }

  /**
   * Vuelve a tomar las partidas que quedaron activas de una ejecución anterior.
   * Sin esto, una partida cuyo proceso murió se queda `ACTIVE` para siempre: su
   * reloj no corre, nadie la cierra y sigue apareciendo en "partidas en vivo".
   * Al rehidratarlas se rearma el temporizador y caen por tiempo como corresponde.
   */
  async resumeActive(limit = 500): Promise<number> {
    const rows = await prisma.game.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: { id: true },
    });
    let resumed = 0;
    for (const row of rows) {
      if (await this.get(row.id)) resumed++;
    }
    return resumed;
  }

  /** Corta todos los relojes: se usa al apagar el proceso. */
  shutdown(): void {
    for (const game of this.games.values()) {
      if (game.flagTimer) clearTimeout(game.flagTimer);
    }
    this.games.clear();
  }
}

export const gameEngine = new GameEngine();
