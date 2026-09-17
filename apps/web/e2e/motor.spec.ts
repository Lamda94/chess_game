import { expect, test } from '@playwright/test';

/**
 * El motor corre dentro del navegador, así que la única verificación honesta es
 * levantarlo ahí y pedirle una jugada de verdad.
 */
test('Stockfish arranca en el navegador y contesta una jugada', async ({ page }) => {
  await page.goto('/entrar');

  const resultado = await page.evaluate(async () => {
    const worker = new Worker('/engine/stockfish-19-lite-single.js');
    const lineas: string[] = [];

    const esperar = (predicado: (l: string) => boolean, ms: number) =>
      new Promise<string>((resolve, reject) => {
        const limite = setTimeout(() => reject(new Error('tiempo agotado')), ms);
        const handler = (evento: MessageEvent) => {
          const linea = String(evento.data);
          lineas.push(linea);
          if (predicado(linea)) {
            clearTimeout(limite);
            worker.removeEventListener('message', handler);
            resolve(linea);
          }
        };
        worker.addEventListener('message', handler);
      });

    worker.postMessage('uci');
    const uciok = await esperar((l) => l === 'uciok', 40_000);

    worker.postMessage('isready');
    await esperar((l) => l === 'readyok', 20_000);

    // Mate en uno: Dh5xf7. Si el motor funciona, no hay otra jugada razonable.
    worker.postMessage('position fen r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4');
    worker.postMessage('go depth 10');
    const bestmove = await esperar((l) => l.startsWith('bestmove'), 30_000);

    // Y una posición normal con evaluación.
    worker.postMessage('position startpos moves e2e4');
    worker.postMessage('go depth 12');
    const segunda = await esperar((l) => l.startsWith('bestmove'), 30_000);

    worker.postMessage('quit');
    return {
      uciok,
      bestmove,
      segunda,
      tieneNombre: lineas.some((l) => l.startsWith('id name')),
      tieneEval: lineas.some((l) => l.includes('score')),
    };
  });

  expect(resultado.uciok).toBe('uciok');
  expect(resultado.tieneNombre).toBe(true);
  expect(resultado.tieneEval).toBe(true);
  // La posición era mate: el motor no tiene jugadas.
  expect(resultado.bestmove).toContain('bestmove');
  expect(resultado.segunda).toMatch(/^bestmove [a-h][1-8][a-h][1-8]/);
});

test('la licencia del motor se sirve y el aviso la enlaza', async ({ page }) => {
  // La GPL exige acompañar el binario con su licencia: tiene que estar servida.
  const respuesta = await page.request.get('/engine/LICENSE-stockfish.txt');
  expect(respuesta.status()).toBe(200);
  expect(await respuesta.text()).toContain('GNU GENERAL PUBLIC LICENSE');
});

test('la oferta de código fuente está en el login y dentro de la app', async ({ page }) => {
  /**
   * El artículo 13 de la AGPLv3 obliga a que quien usa el programa por red pueda
   * llegar al código de la versión que está usando. Si este enlace desaparece,
   * el sitio incumple su propia licencia: por eso está en una prueba y no
   * solamente en el README.
   */
  await page.goto('/entrar');
  const fuenteAnonima = page.getByRole('link', { name: 'Código fuente' });
  await expect(fuenteAnonima).toBeVisible();
  await expect(fuenteAnonima).toHaveAttribute('href', /^https?:\/\/.+/);
  await expect(page.getByRole('link', { name: 'AGPLv3' })).toBeVisible();

  // Y también con la sesión iniciada, que es el resto de la navegación.
  const usuario = `agpl_${Math.random().toString(36).slice(2, 7)}`;
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@agpl.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Código fuente' })).toBeVisible();
});

test('la licencia AGPL se versiona entera y es la oficial', async () => {
  const { readFileSync } = await import('node:fs');
  const texto = readFileSync(new URL('../../../LICENSE', import.meta.url), 'utf8');

  expect(texto).toContain('GNU AFFERO GENERAL PUBLIC LICENSE');
  expect(texto).toContain('Version 3, 19 November 2007');
  // El artículo 13 es el que distingue la AGPL de la GPL y el motivo de elegirla.
  expect(texto).toContain('13. Remote Network Interaction');
  // Truncar la licencia la invalida: tiene que estar completa.
  expect(texto.split('\n').length).toBeGreaterThan(600);
});
