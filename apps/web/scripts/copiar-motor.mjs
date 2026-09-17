/**
 * Copia el motor a public/engine/ antes de arrancar o compilar.
 *
 * Los .wasm no se versionan: son 1,7 MB de binario que ya viven en node_modules.
 * Se elige la variante "lite-single" a propósito — la multihilo necesita
 * SharedArrayBuffer, que obliga a servir la app con cabeceras COOP/COEP y eso
 * rompería la carga de las fuentes de Google. La lite alcanza de sobra para una
 * sala de práctica.
 */
import { createRequire } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const origen = dirname(require.resolve('stockfish/package.json'));
// Relativo al script y no a process.cwd(): llamarlo desde la raíz del monorepo
// creaba un public/engine suelto ahí en vez de escribir en apps/web.
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'engine');

/**
 * Stockfish es GPLv3 y se entrega al navegador de cada visitante, así que la
 * licencia viaja junto al binario: la GPL exige acompañar la copia con su texto
 * y con una oferta de la fuente. El aviso con el enlace al repositorio está en
 * la interfaz, en `src/components/AvisoMotor.tsx`.
 */
const archivos = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];
const licencias = [['Copying.txt', 'LICENSE-stockfish.txt']];

await mkdir(destino, { recursive: true });
for (const archivo of archivos) {
  await copyFile(join(origen, 'bin', archivo), join(destino, archivo));
}
for (const [desde, hasta] of licencias) {
  await copyFile(join(origen, desde), join(destino, hasta));
}
console.log(`motor copiado a public/engine/ (${archivos.length} archivos + licencia)`);
