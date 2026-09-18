import { expect, test, type Browser, type Page } from '@playwright/test';
import { colorDe, mover } from './ayudas.js';

const TAG = Math.random().toString(36).slice(2, 7);

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@ap.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

async function nueva(browser: Browser) {
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  return contexto.newPage();
}

test('elegir piezas y tablero cambia el tablero de verdad', async ({ page }) => {
  await registrar(page, 'apa');
  await page.goto('/apariencia');

  // Lo elegido se refleja en la página, no sólo en el catálogo.
  const colorInicial = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--board-light').trim(),
  );

  await page.getByRole('button', { name: /Bosque/ }).click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--board-light').trim(),
      ),
    )
    .not.toBe(colorInicial);

  await page.getByRole('button', { name: /Minimal/ }).click();
  await expect(page.getByRole('button', { name: /Minimal/ })).toHaveAttribute('aria-pressed', 'true');
});

test('la apariencia sobrevive a recargar y llega al tablero de la partida', async ({ page }) => {
  const usuario = await registrar(page, 'apb');
  await page.goto('/apariencia');
  await page.getByRole('button', { name: /Océano/ }).click();
  await page.getByRole('button', { name: /Contorno/ }).click();
  await page.waitForTimeout(400);

  /**
   * Recargar es la prueba de que se guardó en el servidor y no en memoria: si
   * viviera sólo en el navegador, esto pasaría igual, pero al menos descarta que
   * se pierda al navegar. La comprobación fuerte es la consulta a la sesión.
   */
  await page.reload();
  const sesion = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  expect(sesion.user.boardTheme).toBe('oceano');
  expect(sesion.user.pieceSet).toBe('contorno');
  expect(sesion.user.username).toBe(usuario);

  // Y el tablero de práctica lo usa, no sólo la pantalla de ajustes.
  await page.goto('/practica');
  await expect(page.getByRole('grid', { name: /Tablero de ajedrez/ })).toBeVisible({ timeout: 30_000 });
  const claro = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--board-light').trim(),
  );
  expect(claro.toLowerCase()).toBe('#dee6ee');
});

test('un desafío se juega con el tiempo elegido, no con uno fijo', async ({ browser }) => {
  const a = await nueva(browser);
  const b = await nueva(browser);
  await registrar(a, 'des_a');
  const nombreB = await registrar(b, 'des_b');

  // Se hacen amigos para poder desafiarse.
  await a.getByLabel('Agregar por nombre de jugador').fill(nombreB);
  await a.getByRole('button', { name: 'Agregar' }).click();
  await b.reload();
  await b.getByRole('button', { name: 'Aceptar' }).click();
  await a.reload();

  // El tiempo deja de ser 3+2: se elige 10+0 (rápida).
  await a.getByLabel('Tiempo de la partida').selectOption('600-0');
  await a.getByLabel('Color con el que jugás').selectOption('white');
  await a.getByRole('button', { name: 'Desafiar' }).first().click();
  await a.waitForURL(/\/desafio\//, { timeout: 20_000 });

  await b.reload();
  await b.getByRole('button', { name: /Aceptar/ }).first().click();
  await b.waitForURL(/\/partida\//, { timeout: 30_000 });
  const gameId = b.url().split('/partida/')[1]!;

  const partida = await b.evaluate(
    (id) => fetch(`/api/games/${id}`).then((r) => r.json()),
    gameId,
  );
  expect(partida.game.timeControl.initialSec).toBe(600);
  expect(partida.game.timeControl.incrementSec).toBe(0);
  // Y el color pedido se respetó.
  expect(partida.game.white.username).toContain('des_a');

  await a.goto(`/partida/${gameId}`);
  expect(await colorDe(a, gameId)).toBe('white');
  await mover(a, 'e2', 'e4');
  await expect(b.getByText('e4', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
});

test('se llega a personalizar desde cualquier pantalla', async ({ page }) => {
  /**
   * El acceso vivía sólo dentro del perfil propio y no lo encontraba nadie: la
   * función estaba hecha y el usuario la pedía como si no existiera.
   */
  await registrar(page, 'apc');
  for (const ruta of ['/', '/torneos', '/ranking']) {
    await page.goto(ruta);
    await expect(page.getByRole('link', { name: 'Personalizar piezas y tablero' })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Personalizar piezas y tablero' }).click();
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible();
});

test('el juego elegido llega al tablero de juego, no sólo al catálogo', async ({ page }) => {
  await registrar(page, 'apd');

  const dibujoDelTablero = () =>
    page.evaluate(() => document.querySelector('[role="grid"] svg path')?.getAttribute('d')?.slice(0, 30) ?? '');

  await page.goto('/apariencia');
  await page.getByRole('button', { name: /Clásicas/ }).click();
  await page.waitForTimeout(400);
  await page.goto('/practica');
  await expect(page.getByRole('grid', { name: /Tablero de ajedrez/ })).toBeVisible({ timeout: 40_000 });
  const clasicas = await dibujoDelTablero();

  await page.goto('/apariencia');
  await page.getByRole('button', { name: /Minimal/ }).click();
  await page.waitForTimeout(400);
  await page.goto('/practica');
  await expect(page.getByRole('grid', { name: /Tablero de ajedrez/ })).toBeVisible({ timeout: 40_000 });
  const minimal = await dibujoDelTablero();

  expect(clasicas).not.toBe('');
  expect(minimal, 'el tablero siguió dibujando las mismas piezas').not.toBe(clasicas);
});
