import { expect, test, type Browser, type Page } from '@playwright/test';

const TAG = Math.random().toString(36).slice(2, 7);

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@analisis.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
}

async function nueva(browser: Browser) {
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return contexto.newPage();
}

test('el visor recorre la partida y la analiza', async ({ browser }) => {
  const a = await nueva(browser);
  const b = await nueva(browser);
  await registrar(a, 'anal_uno');
  await registrar(b, 'anal_dos');

  await a.getByRole('button', { name: '3+2', exact: true }).click();
  await b.getByRole('button', { name: '3+2', exact: true }).click();
  await a.waitForURL(/\/partida\//, { timeout: 30_000 });
  await b.waitForURL(/\/partida\//, { timeout: 30_000 });

  const gameId = a.url().split('/partida/')[1]!;
  const colorA = await a.evaluate(async (id) => {
    const [yo, partida] = await Promise.all([
      fetch('/api/auth/me').then((r) => r.json()),
      fetch(`/api/games/${id}`).then((r) => r.json()),
    ]);
    return partida.game.white.id === yo.user.id ? 'white' : 'black';
  }, gameId);
  const blancas = colorA === 'white' ? a : b;
  const negras = colorA === 'white' ? b : a;

  const mover = async (page: Page, desde: string, hasta: string) => {
    await page.getByRole('gridcell', { name: new RegExp(`^${desde},`) }).click();
    await page.getByRole('gridcell', { name: new RegExp(`^${hasta},`) }).click();
    await page.waitForTimeout(200);
  };

  // Mate del pastor: incluye una jugada claramente mala de las negras (g8f6),
  // así que el análisis tiene algo concreto que señalar.
  await mover(blancas, 'e2', 'e4');
  await mover(negras, 'e7', 'e5');
  await mover(blancas, 'f1', 'c4');
  await mover(negras, 'b8', 'c6');
  await mover(blancas, 'd1', 'h5');
  await mover(negras, 'g8', 'f6');
  await mover(blancas, 'h5', 'f7');

  await expect(blancas.getByRole('heading', { name: 'Ganaste' })).toBeVisible({ timeout: 15_000 });
  await blancas.getByRole('link', { name: 'Analizar partida' }).click();

  await blancas.waitForURL(/\/analisis\//);
  await expect(blancas.getByText('Apertura de alfil')).toBeVisible({ timeout: 20_000 });

  // El análisis recorre las siete jugadas y termina.
  await expect(blancas.getByText('RESUMEN')).toBeVisible({ timeout: 90_000 });

  // Navegación: avanzar muestra la jugada y su clasificación.
  await blancas.getByRole('button', { name: 'Jugada siguiente' }).click();
  await expect(blancas.getByText('1 / 7')).toBeVisible();

  await blancas.getByRole('button', { name: 'Última jugada' }).click();
  await expect(blancas.getByText('7 / 7')).toBeVisible();
  // La última jugada fue el mate. Aparece dos veces —en la lista y en el panel—,
  // así que alcanza con comprobar la primera.
  await expect(blancas.getByText('Qxf7#').first()).toBeVisible();

  // El teclado también navega.
  await blancas.keyboard.press('Home');
  await expect(blancas.getByText('0 / 7')).toBeVisible();
  await blancas.keyboard.press('ArrowRight');
  await expect(blancas.getByText('1 / 7')).toBeVisible();

  // Y el motor marcó al menos un error entre las jugadas negras.
  const resumen = blancas.getByText('RESUMEN').locator('..');
  await expect(resumen).toContainText(/Error|Imprecisión/);
});
