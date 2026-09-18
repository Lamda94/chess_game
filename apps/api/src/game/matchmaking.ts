import {
  type Category,
  type PlayerView,
  type TimeControl,
  categoryFor,
  formatTimeControl,
} from '@gambito/shared';
import { prisma } from '../db.js';
import { redis } from '../redis.js';
import { gameEngine } from './engine.js';

/** Ventana de rating inicial y máxima, y cada cuánto se ensancha. */
const WINDOW_START = 50;
const WINDOW_STEP = 50;
const WINDOW_MAX = 400;
const WIDEN_EVERY_MS = 5_000;
const SWEEP_MS = 1_000;
const LOCK_TTL_MS = 3_000;

export interface QueueTicket {
  userId: string;
  rating: number;
  joinedAt: number;
}

export interface MatchFound {
  gameId: string;
  white: PlayerView;
  black: PlayerView;
}

function queueKey(category: Category, tc: TimeControl, rated: boolean): string {
  return `mm:${category}:${formatTimeControl(tc)}:${rated ? 'rated' : 'casual'}`;
}

function windowFor(joinedAt: number, now: number): number {
  const steps = Math.floor((now - joinedAt) / WIDEN_EVERY_MS);
  return Math.min(WINDOW_MAX, WINDOW_START + steps * WINDOW_STEP);
}

/**
 * Cola de emparejamiento sobre Redis. Vive fuera del proceso a propósito: si mañana
 * hay dos instancias de la API, los jugadores de una pueden emparejarse con los de
 * la otra sin cambiar nada.
 */
export class Matchmaker {
  private sweeper: NodeJS.Timeout | null = null;
  private onMatch: ((match: MatchFound) => void) | null = null;

  setMatchHandler(handler: (match: MatchFound) => void): void {
    this.onMatch = handler;
  }

  start(): void {
    if (this.sweeper) return;
    // Un barrido periódico es lo que hace que las ventanas se ensanchen solas,
    // incluso si nadie nuevo entra a la cola.
    this.sweeper = setInterval(() => {
      void this.sweepAll();
    }, SWEEP_MS);
    this.sweeper.unref?.();
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
  }

  async join(params: {
    userId: string;
    rating: number;
    timeControl: TimeControl;
    rated: boolean;
  }): Promise<{ category: Category; key: string }> {
    const category = categoryFor(params.timeControl);
    const key = queueKey(category, params.timeControl, params.rated);
    const now = Date.now();

    await this.leave(params.userId);
    await redis
      .multi()
      .zadd(key, params.rating, params.userId)
      .hset(`${key}:joined`, params.userId, String(now))
      .hset(
        'mm:tickets',
        params.userId,
        JSON.stringify({ key, category, timeControl: params.timeControl, rated: params.rated }),
      )
      .exec();

    await this.trySweep(key);
    return { category, key };
  }

  async leave(userId: string): Promise<void> {
    const raw = await redis.hget('mm:tickets', userId);
    if (!raw) return;
    const ticket = JSON.parse(raw) as { key: string };
    await redis
      .multi()
      .zrem(ticket.key, userId)
      .hdel(`${ticket.key}:joined`, userId)
      .hdel('mm:tickets', userId)
      .exec();
  }

  /** Estado de la cola para un jugador, que es lo que se muestra mientras espera. */
  async statusOf(userId: string): Promise<{
    category: Category;
    timeControl: TimeControl;
    waitingMs: number;
    ratingRange: { min: number; max: number };
    queued: number;
  } | null> {
    const raw = await redis.hget('mm:tickets', userId);
    if (!raw) return null;
    const ticket = JSON.parse(raw) as {
      key: string;
      category: Category;
      timeControl: TimeControl;
    };
    const [joinedRaw, score, queued] = await Promise.all([
      redis.hget(`${ticket.key}:joined`, userId),
      redis.zscore(ticket.key, userId),
      redis.zcard(ticket.key),
    ]);
    if (!joinedRaw || score === null) return null;

    const joinedAt = Number(joinedRaw);
    const rating = Number(score);
    const window = windowFor(joinedAt, Date.now());
    return {
      category: ticket.category,
      timeControl: ticket.timeControl,
      waitingMs: Date.now() - joinedAt,
      ratingRange: { min: rating - window, max: rating + window },
      queued,
    };
  }

  private async sweepAll(): Promise<void> {
    /**
     * Sólo las colas. En Redis el `*` del patrón cruza los dos puntos, así que
     * `mm:*:*:*` también atrapaba los auxiliares —`:joined` y, sobre todo, el
     * candado— y al hacerles `ZRANGE` la respuesta era WRONGTYPE: una excepción
     * sin capturar en una tarea de fondo, que tumbaba el proceso entero.
     *
     * Por eso ahora se descartan por sufijo y el candado vive bajo otro prefijo,
     * donde ningún patrón de colas puede alcanzarlo.
     */
    const keys = await redis.keys('mm:*:*:*');
    const queues = keys.filter(
      (k) => !k.endsWith(':joined') && !k.endsWith(':lock') && k !== 'mm:tickets',
    );

    for (const key of queues) {
      try {
        await this.trySweep(key);
      } catch (error) {
        // Una cola con datos raros no puede llevarse puesto el emparejamiento de
        // todas las demás, ni el servidor.
        console.error('[matchmaking] falló el barrido de', key, error);
      }
    }
  }

  /**
   * Empareja dentro de una cola. Toma un lock porque dos instancias barriendo a la
   * vez podrían sacar al mismo jugador para dos partidas distintas.
   */
  private async trySweep(key: string): Promise<void> {
    // Fuera del espacio de nombres de las colas, para que un barrido no lo
    // confunda con una de ellas.
    const lockKey = `mmlock:${key}`;
    const acquired = await redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');
    if (!acquired) return;

    try {
      const [flat, joinedMap] = await Promise.all([
        redis.zrange(key, 0, -1, 'WITHSCORES'),
        redis.hgetall(`${key}:joined`),
      ]);

      const tickets: QueueTicket[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        const userId = flat[i];
        const score = flat[i + 1];
        if (!userId || score === undefined) continue;
        const joinedAt = Number(joinedMap[userId] ?? Date.now());
        tickets.push({ userId, rating: Number(score), joinedAt });
      }
      if (tickets.length < 2) return;

      // El que más esperó tiene prioridad: es lo que hace que la cola sea justa.
      tickets.sort((a, b) => a.joinedAt - b.joinedAt);
      const now = Date.now();
      const taken = new Set<string>();

      for (const ticket of tickets) {
        if (taken.has(ticket.userId)) continue;
        const myWindow = windowFor(ticket.joinedAt, now);

        const partner = tickets.find((other) => {
          if (other.userId === ticket.userId || taken.has(other.userId)) return false;
          const diff = Math.abs(other.rating - ticket.rating);
          // Ambas ventanas tienen que aceptar al otro, si no el emparejamiento
          // sería injusto para el que lleva menos tiempo esperando.
          return diff <= myWindow && diff <= windowFor(other.joinedAt, now);
        });
        if (!partner) continue;

        taken.add(ticket.userId);
        taken.add(partner.userId);
        await this.pair(key, ticket, partner);
      }
    } finally {
      await redis.del(lockKey);
    }
  }

  private async pair(key: string, a: QueueTicket, b: QueueTicket): Promise<void> {
    const raw = await redis.hget('mm:tickets', a.userId);
    if (!raw) return;
    const ticket = JSON.parse(raw) as {
      category: Category;
      timeControl: TimeControl;
      rated: boolean;
    };

    await redis
      .multi()
      .zrem(key, a.userId, b.userId)
      .hdel(`${key}:joined`, a.userId, b.userId)
      .hdel('mm:tickets', a.userId, b.userId)
      .exec();

    const users = await prisma.user.findMany({
      where: { id: { in: [a.userId, b.userId] } },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        country: true,
        ratings: { where: { category: ticket.category }, select: { rating: true, gamesPlayed: true } },
      },
    });
    if (users.length !== 2) return;

    const toPlayer = (id: string, fallbackRating: number): PlayerView => {
      const user = users.find((u) => u.id === id)!;
      const rating = user.ratings[0];
      return {
        id: user.id,
        username: user.username ?? 'anónimo',
        rating: rating?.rating ?? fallbackRating,
        provisional: (rating?.gamesPlayed ?? 0) < 10,
        avatarUrl: user.avatarUrl,
        country: user.country,
      };
    };

    // Sorteo de colores: nadie elige, para que no haya ventaja sistemática.
    const whiteFirst = Math.random() < 0.5;
    const white = toPlayer(whiteFirst ? a.userId : b.userId, whiteFirst ? a.rating : b.rating);
    const black = toPlayer(whiteFirst ? b.userId : a.userId, whiteFirst ? b.rating : a.rating);

    const gameId = await gameEngine.create({
      white,
      black,
      category: ticket.category,
      timeControl: ticket.timeControl,
      rated: ticket.rated,
    });

    this.onMatch?.({ gameId, white, black });
  }
}

export const matchmaker = new Matchmaker();
