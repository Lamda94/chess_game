import { buildServer } from './server.js';
import { createSocketServer } from './socket.js';
import { env } from './env.js';
import { prisma } from './db.js';
import { closeRedis } from './redis.js';
import { gameEngine } from './game/engine.js';
import { matchmaker } from './game/matchmaking.js';

const app = await buildServer();
await app.listen({ port: env.PORT, host: env.HOST });

const io = createSocketServer(app.server);
app.log.info(`sockets escuchando en ${env.PORT}${'/play'}`);

// Después de enganchar los sockets, para que el cierre de una partida reanudada
// pueda avisarles a los jugadores que siguen conectados.
const reanudadas = await gameEngine.resumeActive();
if (reanudadas > 0) app.log.info({ reanudadas }, 'partidas activas retomadas');

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'apagando');
  matchmaker.stop();
  gameEngine.shutdown();
  await io.close();
  await app.close();
  await prisma.$disconnect();
  await closeRedis();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
