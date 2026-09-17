import {
  ESTADO_INICIAL,
  calcularDesempates,
  emparejarRondaSuiza,
  ordenarArena,
  ordenarClasificacion,
  primeraRondaEliminatoria,
  puntuarArena,
  rondasNecesarias,
  siguienteRondaEliminatoria,
  type Participante,
  type ResultadoPorRival,
} from '@gambito/tournament';
import type { Category, GameResult, TimeControl } from '@gambito/shared';
import { prisma } from '../db.js';
import { gameEngine } from '../game/engine.js';

/**
 * Orquestación de torneos.
 *
 * El paquete `@gambito/tournament` sabe *a quién emparejar con quién* y no sabe
 * nada de la base de datos ni de sockets; acá se hace lo otro: leer el estado,
 * crear las partidas, registrar resultados y decidir cuándo cambia la ronda.
 * Esa separación es lo que permite probar los emparejamientos exhaustivamente
 * sin levantar Postgres.
 */

export interface DifusorTorneo {
  clasificacionCambio(tournamentId: string): void;
  rondaEmpezo(tournamentId: string, ronda: number): void;
  torneoTermino(tournamentId: string): void;
}

let difusor: DifusorTorneo | null = null;
export function conectarDifusorTorneo(nuevo: DifusorTorneo): void {
  difusor = nuevo;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

async function participantesDe(tournamentId: string): Promise<Participante[]> {
  const [entradas, cruces] = await Promise.all([
    prisma.tournamentEntry.findMany({
      where: { tournamentId },
      orderBy: { seedRating: 'desc' },
    }),
    prisma.tournamentPairing.findMany({ where: { tournamentId }, orderBy: { round: 'asc' } }),
  ]);

  return entradas.map((entrada) => {
    const rivales: string[] = [];
    const colores: Array<'white' | 'black'> = [];
    let tuvoBye = false;

    for (const cruce of cruces) {
      if (cruce.isBye) {
        if (cruce.byeUserId === entrada.userId) tuvoBye = true;
        continue;
      }
      if (cruce.whiteId === entrada.userId && cruce.blackId) {
        rivales.push(cruce.blackId);
        colores.push('white');
      } else if (cruce.blackId === entrada.userId && cruce.whiteId) {
        rivales.push(cruce.whiteId);
        colores.push('black');
      }
    }

    return {
      userId: entrada.userId,
      rating: entrada.seedRating,
      puntos: entrada.score,
      rivales,
      colores,
      tuvoBye,
      retirado: entrada.withdrawn || entrada.eliminated,
    };
  });
}

/** Clasificación lista para mostrar, con desempates según el formato. */
export async function clasificacionDe(tournamentId: string) {
  const torneo = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { format: true },
  });

  const entradas = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    include: { user: { select: { username: true, avatarUrl: true, country: true } } },
  });

  if (torneo.format === 'ARENA') {
    const orden = ordenarArena(
      entradas.map((e) => ({
        userId: e.userId,
        puntos: e.score,
        partidas: e.games,
        racha: e.streak,
        rating: e.seedRating,
      })),
    );
    return orden.map((fila, indice) => {
      const entrada = entradas.find((e) => e.userId === fila.userId)!;
      return {
        posicion: indice + 1,
        userId: fila.userId,
        username: entrada.user.username,
        avatarUrl: entrada.user.avatarUrl,
        puntos: fila.puntos,
        partidas: fila.partidas,
        racha: fila.racha,
        rating: fila.rating,
        retirado: entrada.withdrawn,
        eliminado: entrada.eliminated,
        desempates: null,
      };
    });
  }

  const cruces = await prisma.tournamentPairing.findMany({ where: { tournamentId } });
  const puntosPorJugador = new Map(entradas.map((e) => [e.userId, e.score]));

  const filas = entradas.map((entrada) => {
    const resultados: ResultadoPorRival[] = [];
    for (const cruce of cruces) {
      if (cruce.isBye || !cruce.result || !cruce.whiteId || !cruce.blackId) continue;
      const esBlancas = cruce.whiteId === entrada.userId;
      const esNegras = cruce.blackId === entrada.userId;
      if (!esBlancas && !esNegras) continue;
      const rivalId = esBlancas ? cruce.blackId : cruce.whiteId;
      const puntos =
        cruce.result === 'DRAW' ? 0.5 : (cruce.result === 'WHITE') === esBlancas ? 1 : 0;
      resultados.push({ rivalId, puntos: puntos as 0 | 0.5 | 1 });
    }
    return {
      userId: entrada.userId,
      puntos: entrada.score,
      rating: entrada.seedRating,
      desempates: calcularDesempates(resultados, puntosPorJugador),
    };
  });

  return ordenarClasificacion(filas).map((fila, indice) => {
    const entrada = entradas.find((e) => e.userId === fila.userId)!;
    return {
      posicion: indice + 1,
      userId: fila.userId,
      username: entrada.user.username,
      avatarUrl: entrada.user.avatarUrl,
      puntos: fila.puntos,
      partidas: entrada.games,
      racha: entrada.streak,
      rating: fila.rating,
      retirado: entrada.withdrawn,
      eliminado: entrada.eliminated,
      desempates: fila.desempates,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Rondas                                                              */
/* ------------------------------------------------------------------ */

async function crearPartidasDeRonda(
  tournamentId: string,
  ronda: number,
  emparejamientos: Array<{ tablero: number; whiteId: string; blackId: string }>,
  byes: string[],
): Promise<void> {
  const torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  const timeControl: TimeControl = {
    initialSec: torneo.initialSec,
    incrementSec: torneo.incrementSec,
  };

  const jugadores = await prisma.user.findMany({
    where: { id: { in: emparejamientos.flatMap((e) => [e.whiteId, e.blackId]) } },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      country: true,
      ratings: { where: { category: torneo.category as Category }, select: { rating: true, gamesPlayed: true } },
    },
  });

  const vista = (id: string) => {
    const usuario = jugadores.find((j) => j.id === id)!;
    return {
      id: usuario.id,
      username: usuario.username ?? 'anónimo',
      rating: usuario.ratings[0]?.rating ?? 1500,
      provisional: (usuario.ratings[0]?.gamesPlayed ?? 0) < 10,
      avatarUrl: usuario.avatarUrl,
      country: usuario.country,
    };
  };

  for (const cruce of emparejamientos) {
    const gameId = await gameEngine.create({
      white: vista(cruce.whiteId),
      black: vista(cruce.blackId),
      category: torneo.category as Category,
      timeControl,
      rated: true,
      tournamentId,
    });
    await prisma.tournamentPairing.create({
      data: {
        tournamentId,
        round: ronda,
        board: cruce.tablero,
        whiteId: cruce.whiteId,
        blackId: cruce.blackId,
        gameId,
      },
    });
  }

  // El bye se resuelve en el acto: no hay partida que esperar.
  let tablero = emparejamientos.length;
  for (const userId of byes) {
    tablero++;
    await prisma.tournamentPairing.create({
      data: { tournamentId, round: ronda, board: tablero, isBye: true, byeUserId: userId },
    });
    await prisma.tournamentEntry.update({
      where: { tournamentId_userId: { tournamentId, userId } },
      data: { score: { increment: torneo.halfPointBye ? 0.5 : 1 } },
    });
  }
}

/** Arranca el torneo y arma la primera ronda. */
export async function comenzarTorneo(tournamentId: string): Promise<void> {
  const torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  if (torneo.status !== 'SCHEDULED') return;

  const participantes = await participantesDe(tournamentId);
  if (participantes.filter((p) => !p.retirado).length < 2) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'CANCELLED', endedAt: new Date() },
    });
    difusor?.torneoTermino(tournamentId);
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      status: 'RUNNING',
      currentRound: 1,
      // En eliminación las rondas las decide el cuadro, no quien lo creó.
      ...(torneo.format === 'KNOCKOUT'
        ? { rounds: rondasNecesarias(participantes.filter((p) => !p.retirado).length) }
        : {}),
    },
  });

  if (torneo.format === 'KNOCKOUT') {
    const ronda = primeraRondaEliminatoria(participantes);
    await crearPartidasDeRonda(tournamentId, 1, ronda.emparejamientos, ronda.byes);
  } else if (torneo.format === 'SWISS') {
    const ronda = emparejarRondaSuiza(participantes);
    await crearPartidasDeRonda(
      tournamentId,
      1,
      ronda.emparejamientos,
      ronda.bye ? [ronda.bye] : [],
    );
  } else {
    // La arena no tiene rondas: se empareja por demanda desde la cola.
    await emparejarArena(tournamentId);
  }

  difusor?.rondaEmpezo(tournamentId, 1);
  difusor?.clasificacionCambio(tournamentId);
}

/**
 * Empareja a quienes están libres en una arena. Se llama al empezar y cada vez
 * que termina una partida, que es lo que hace que la arena no se detenga.
 */
export async function emparejarArena(tournamentId: string): Promise<void> {
  const torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  if (torneo.status !== 'RUNNING') return;
  if (torneo.endedAt && torneo.endedAt.getTime() <= Date.now()) return;

  const entradas = await prisma.tournamentEntry.findMany({
    where: { tournamentId, withdrawn: false },
    orderBy: { score: 'desc' },
  });

  // Quien tenga una partida sin terminar no vuelve a la cola.
  const ocupados = await prisma.tournamentPairing.findMany({
    where: { tournamentId, result: null, isBye: false },
    select: { whiteId: true, blackId: true },
  });
  const jugando = new Set(ocupados.flatMap((o) => [o.whiteId, o.blackId].filter(Boolean) as string[]));

  const libres = entradas.filter((e) => !jugando.has(e.userId));
  if (libres.length < 2) return;

  // Se cruzan de a dos por cercanía de puntaje, que es como quedan ordenados.
  const emparejamientos: Array<{ tablero: number; whiteId: string; blackId: string }> = [];
  const ultimaRonda = torneo.currentRound;
  for (let i = 0; i + 1 < libres.length; i += 2) {
    // Los colores se alternan por paridad para que a la larga se equilibren.
    const invertir = (libres[i]!.games + i) % 2 === 1;
    emparejamientos.push({
      tablero: emparejamientos.length + 1,
      whiteId: invertir ? libres[i + 1]!.userId : libres[i]!.userId,
      blackId: invertir ? libres[i]!.userId : libres[i + 1]!.userId,
    });
  }
  if (emparejamientos.length === 0) return;

  // Cada tanda de arena se guarda como una "ronda" nueva para no chocar con la
  // clave única de tablero por ronda.
  const siguienteRonda = ultimaRonda + 1;
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { currentRound: siguienteRonda },
  });
  await crearPartidasDeRonda(tournamentId, siguienteRonda, emparejamientos, []);
}

/* ------------------------------------------------------------------ */
/* Resultados                                                          */
/* ------------------------------------------------------------------ */

/** Registra el resultado de una partida de torneo y decide qué sigue. */
export async function registrarResultado(gameId: string, resultado: GameResult): Promise<void> {
  const cruce = await prisma.tournamentPairing.findUnique({
    where: { gameId },
    include: { tournament: true },
  });
  if (!cruce || cruce.result || !cruce.whiteId || !cruce.blackId) return;

  await prisma.tournamentPairing.update({ where: { id: cruce.id }, data: { result: resultado } });

  const torneo = cruce.tournament;
  const blancas = cruce.whiteId;
  const negras = cruce.blackId;

  if (torneo.format === 'ARENA') {
    for (const [userId, propio] of [
      [blancas, resultado === 'DRAW' ? 'draw' : resultado === 'WHITE' ? 'win' : 'loss'],
      [negras, resultado === 'DRAW' ? 'draw' : resultado === 'BLACK' ? 'win' : 'loss'],
    ] as Array<[string, 'win' | 'draw' | 'loss']>) {
      const entrada = await prisma.tournamentEntry.findUniqueOrThrow({
        where: { tournamentId_userId: { tournamentId: torneo.id, userId } },
      });
      const siguiente = puntuarArena(
        { ...ESTADO_INICIAL, puntos: entrada.score, racha: entrada.streak, partidas: entrada.games },
        propio,
      );
      await prisma.tournamentEntry.update({
        where: { id: entrada.id },
        data: { score: siguiente.puntos, streak: siguiente.racha, games: siguiente.partidas },
      });
    }
  } else {
    const puntosBlancas = resultado === 'DRAW' ? 0.5 : resultado === 'WHITE' ? 1 : 0;
    await prisma.tournamentEntry.update({
      where: { tournamentId_userId: { tournamentId: torneo.id, userId: blancas } },
      data: { score: { increment: puntosBlancas }, games: { increment: 1 } },
    });
    await prisma.tournamentEntry.update({
      where: { tournamentId_userId: { tournamentId: torneo.id, userId: negras } },
      data: { score: { increment: 1 - puntosBlancas }, games: { increment: 1 } },
    });

    if (torneo.format === 'KNOCKOUT' && resultado !== 'DRAW') {
      const eliminado = resultado === 'WHITE' ? negras : blancas;
      await prisma.tournamentEntry.update({
        where: { tournamentId_userId: { tournamentId: torneo.id, userId: eliminado } },
        data: { eliminated: true },
      });
    }
  }

  difusor?.clasificacionCambio(torneo.id);

  if (torneo.format === 'ARENA') {
    await emparejarArena(torneo.id);
    return;
  }

  await avanzarSiTerminoLaRonda(torneo.id);
}

/** Si ya no queda ninguna partida en juego, arma la ronda siguiente o cierra. */
export async function avanzarSiTerminoLaRonda(tournamentId: string): Promise<void> {
  const torneo = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  if (torneo.status !== 'RUNNING') return;

  const pendientes = await prisma.tournamentPairing.count({
    where: { tournamentId, round: torneo.currentRound, isBye: false, result: null },
  });
  if (pendientes > 0) return;

  const participantes = await participantesDe(tournamentId);
  const siguienteRonda = torneo.currentRound + 1;

  const seTermino =
    (torneo.rounds !== null && siguienteRonda > torneo.rounds) ||
    participantes.filter((p) => !p.retirado).length < 2;

  if (seTermino) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'FINISHED', endedAt: new Date() },
    });
    difusor?.torneoTermino(tournamentId);
    difusor?.clasificacionCambio(tournamentId);
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { currentRound: siguienteRonda },
  });

  if (torneo.format === 'KNOCKOUT') {
    // Pasan los ganadores, en el orden de los tableros: así el cuadro se respeta.
    const cruces = await prisma.tournamentPairing.findMany({
      where: { tournamentId, round: torneo.currentRound },
      orderBy: { board: 'asc' },
    });
    const sobrevivientes: string[] = [];
    for (const cruce of cruces) {
      if (cruce.isBye && cruce.byeUserId) sobrevivientes.push(cruce.byeUserId);
      else if (cruce.result === 'WHITE' && cruce.whiteId) sobrevivientes.push(cruce.whiteId);
      else if (cruce.result === 'BLACK' && cruce.blackId) sobrevivientes.push(cruce.blackId);
      else if (cruce.result === 'DRAW' && cruce.whiteId && cruce.blackId) {
        // Sin desempate configurado, las tablas las pasa el mejor sembrado.
        const entradas = await prisma.tournamentEntry.findMany({
          where: { tournamentId, userId: { in: [cruce.whiteId, cruce.blackId] } },
          orderBy: { seedRating: 'desc' },
        });
        if (entradas[0]) sobrevivientes.push(entradas[0].userId);
      }
    }
    const ronda = siguienteRondaEliminatoria(sobrevivientes, siguienteRonda);
    await crearPartidasDeRonda(tournamentId, siguienteRonda, ronda.emparejamientos, ronda.byes);
  } else {
    const ronda = emparejarRondaSuiza(participantes);
    if (ronda.emparejamientos.length === 0) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'FINISHED', endedAt: new Date() },
      });
      difusor?.torneoTermino(tournamentId);
      return;
    }
    await crearPartidasDeRonda(
      tournamentId,
      siguienteRonda,
      ronda.emparejamientos,
      ronda.bye ? [ronda.bye] : [],
    );
  }

  difusor?.rondaEmpezo(tournamentId, siguienteRonda);
  difusor?.clasificacionCambio(tournamentId);
}
