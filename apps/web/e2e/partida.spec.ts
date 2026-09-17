import { expect, test, type Page } from '@playwright/test';

const TAG = Math.random().toString(36).slice(2, 7);
const SHOTS = 'e2e/capturas';

async function registrar(page: Page, nombre: string): Promise<string> {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@e2e.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo|Crear cuenta$/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

/** Pregunta al servidor de qué color juega esta pestaña. */
async function colorDe(page: Page, gameId: string): Promise<'white' | 'black'> {
  return page.evaluate(async (id) => {
    const [yo, partida] = await Promise.all([
      fetch('/api/auth/me').then((r) => r.json()),
      fetch(`/api/games/${id}`).then((r) => r.json()),
    ]);
    return partida.game.white.id === yo.user.id ? 'white' : 'black';
  }, gameId);
}

async function mover(page: Page, desde: string, hasta: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${desde},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${hasta},`) }).click();
}

test('dos jugadores se emparejan y juegan una partida real', async ({ browser }) => {
  const contextoA = await browser.newContext();
  const contextoB = await browser.newContext();
  const paginaA = await contextoA.newPage();
  const paginaB = await contextoB.newPage();

  // Pantalla de entrada, que es la raíz del sitio.
  await paginaA.goto('/entrar');
  await expect(paginaA.getByRole('heading', { name: 'Sentate al tablero' })).toBeVisible();
  await paginaA.screenshot({ path: `${SHOTS}/01-entrar.png`, fullPage: true });

  await registrar(paginaA, 'e2e_uno');
  await paginaA.screenshot({ path: `${SHOTS}/02-lobby.png`, fullPage: true });
  await registrar(paginaB, 'e2e_dos');

  // Los dos piden blitz 3+2 y el servidor los cruza.
  await paginaA.getByRole('button', { name: '3+2', exact: true }).click();
  await expect(paginaA.getByRole('heading', { name: 'Buscando rival' })).toBeVisible();
  await paginaA.screenshot({ path: `${SHOTS}/03-buscando.png` });

  await paginaB.getByRole('button', { name: '3+2', exact: true }).click();

  await paginaA.waitForURL(/\/partida\//, { timeout: 30_000 });
  await paginaB.waitForURL(/\/partida\//, { timeout: 30_000 });

  const gameId = paginaA.url().split('/partida/')[1]!;
  expect(paginaB.url()).toContain(gameId);

  const colorA = await colorDe(paginaA, gameId);
  const blancas = colorA === 'white' ? paginaA : paginaB;
  const negras = colorA === 'white' ? paginaB : paginaA;

  await expect(blancas.getByRole('grid', { name: 'Tablero de ajedrez' })).toBeVisible();
  await blancas.screenshot({ path: `${SHOTS}/04-partida-blancas.png` });

  /**
   * Apertura española: cinco jugadas que ejercitan peón, caballo y alfil.
   *
   * Se espera a que cada una aparezca en la pantalla del rival antes de jugar la
   * siguiente. No es cortesía: quien mueve necesita ver el tablero actualizado
   * para que su clic sea legal. Encadenarlas sin esperar funcionaba sólo contra
   * un servidor local — contra un despliegue real, con el ida y vuelta de la
   * red de por medio, el clic caía sobre un tablero viejo y la jugada ni
   * siquiera se enviaba.
   */
  const apertura = [
    { pagina: () => blancas, desde: 'e2', hasta: 'e4', san: 'e4' },
    { pagina: () => negras, desde: 'e7', hasta: 'e5', san: 'e5' },
    { pagina: () => blancas, desde: 'g1', hasta: 'f3', san: 'Nf3' },
    { pagina: () => negras, desde: 'b8', hasta: 'c6', san: 'Nc6' },
    { pagina: () => blancas, desde: 'f1', hasta: 'b5', san: 'Bb5' },
  ] as const;

  for (const jugada of apertura) {
    await mover(jugada.pagina(), jugada.desde, jugada.hasta);
    // Aparece en los dos tableros: el que mueve y el que espera.
    await expect(blancas.getByText(jugada.san, { exact: true }).first()).toBeVisible();
    await expect(negras.getByText(jugada.san, { exact: true }).first()).toBeVisible();
  }

  await blancas.screenshot({ path: `${SHOTS}/05-espanola-blancas.png` });
  await negras.screenshot({ path: `${SHOTS}/06-espanola-negras.png` });

  // El reloj del que tiene el turno corre; el del otro está quieto.
  const relojes = await negras.locator('[role="timer"]').allTextContents();
  expect(relojes).toHaveLength(2);
  expect(relojes.every((t) => /^\d{2}:\d{2}$|^\d:\d{2}\.\d$/.test(t))).toBe(true);

  // Rendirse cierra la partida para los dos.
  negras.once('dialog', (dialog) => void dialog.accept());
  await negras.getByRole('button', { name: 'Rendirse' }).click();
  await expect(blancas.getByRole('heading', { name: 'Ganaste' })).toBeVisible({ timeout: 15_000 });
  await expect(negras.getByRole('heading', { name: 'Perdiste' })).toBeVisible();
  await blancas.screenshot({ path: `${SHOTS}/07-fin.png` });

  await contextoA.close();
  await contextoB.close();
});

test('el tema claro no rompe ninguna pantalla', async ({ page }) => {
  // La pantalla de entrada está fuera del shell: tiene que respetar el tema igual.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/entrar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: `${SHOTS}/09-entrar-claro.png`, fullPage: true });

  await registrar(page, 'e2e_tema');

  // La etiqueta del botón nombra la acción, no el estado, así que depende del tema
  // con el que arrancó el navegador. Se busca por cualquiera de las dos.
  const alternar = page.getByRole('button', { name: /Cambiar a tema (claro|oscuro)/ });
  const inicial = await page.locator('html').getAttribute('data-theme');
  if (inicial !== 'light') await alternar.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: `${SHOTS}/08-lobby-claro.png`, fullPage: true });

  await alternar.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
