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

const require = createRequire(import.meta.url);
const origen = dirname(require.resolve('stockfish/package.json'));
const destino = join(process.cwd(), 'public', 'engine');

const archivos = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

await mkdir(destino, { recursive: true });
for (const archivo of archivos) {
  await copyFile(join(origen, 'bin', archivo), join(destino, archivo));
}
console.log(`motor copiado a public/engine/ (${archivos.length} archivos)`);
