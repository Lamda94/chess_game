import { expect, test, type Browser, type Page } from '@playwright/test';

/** Recorrido de captura: no verifica nada nuevo, sólo retrata la app funcionando. */

const TAG = Math.random().toString(36).slice(2, 7);
const OUT = 'e2e/recorrido';

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@tour.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

async function nuevaPagina(browser: Browser, ancho: number, alto: number, tema: 'dark' | 'light') {
  const contexto = await browser.newContext({
    viewport: { width: ancho, height: alto },
    colorScheme: tema,
    deviceScaleFactor: 2,
  });
  return contexto.newPage();
}

test('recorrido de escritorio', async ({ browser }) => {
  const a = await nuevaPagina(browser, 1440, 900, 'dark');
  const b = await nuevaPagina(browser, 1440, 900, 'dark');

  await a.goto('/entrar');
  await expect(a.getByRole('heading', { name: 'Sentate al tablero' })).toBeVisible();
  await a.screenshot({ path: `${OUT}/1-entrar.png` });

  await registrar(a, 'tour_uno');
  await a.screenshot({ path: `${OUT}/2-lobby.png` });
  await registrar(b, 'tour_dos');

  await a.getByRole('button', { name: '3+2', exact: true }).click();
  await expect(a.getByRole('heading', { name: 'Buscando rival' })).toBeVisible();
  await a.waitForTimeout(1200);
  await a.screenshot({ path: `${OUT}/3-buscando.png` });

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
    await page.waitForTimeout(250);
  };

  for (const [quien, desde, hasta] of [
    [blancas, 'e2', 'e4'], [negras, 'c7', 'c5'],
    [blancas, 'g1', 'f3'], [negras, 'd7', 'd6'],
    [blancas, 'd2', 'd4'], [negras, 'c5', 'd4'],
    [blancas, 'f3', 'd4'], [negras, 'g8', 'f6'],
    [blancas, 'b1', 'c3'], [negras, 'g7', 'g6'],
  ] as Array<[Page, string, string]>) {
    await mover(quien, desde, hasta);
  }

  // Con una pieza tomada se ven los puntos de jugada legal, que es lo que hay que mostrar.
  await blancas.getByRole('gridcell', { name: /^c1,/ }).click();
  await blancas.waitForTimeout(250);
  await blancas.screenshot({ path: `${OUT}/4-partida.png` });
  await negras.screenshot({ path: `${OUT}/5-partida-negras.png` });

  await blancas.keyboard.press('Escape');
  negras.once('dialog', (d) => void d.accept());
  await negras.getByRole('button', { name: 'Rendirse' }).click();
  await expect(blancas.getByRole('heading', { name: 'Ganaste' })).toBeVisible({ timeout: 15_000 });
  await blancas.screenshot({ path: `${OUT}/6-fin.png` });

  // Tema claro sobre el mismo lobby.
  const claro = await nuevaPagina(browser, 1440, 900, 'light');
  await registrar(claro, 'tour_claro');
  await claro.screenshot({ path: `${OUT}/7-lobby-claro.png` });
});

test('recorrido de la sala de práctica', async ({ browser }) => {
  const page = await nuevaPagina(browser, 1440, 900, 'dark');
  await registrar(page, 'tour_prac');
  await page.goto('/practica');
  await expect(page.getByRole('heading', { name: 'Práctica contra la IA' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Cargando el motor…')).toBeHidden({ timeout: 60_000 });

  // Una apertura corta para que la captura muestre notación, evaluación y pista.
  for (const [desde, hasta] of [['e2', 'e4'], ['g1', 'f3'], ['f1', 'c4']] as Array<[string, string]>) {
    await page.getByRole('gridcell', { name: new RegExp(`^${desde},`) }).click();
    await page.getByRole('gridcell', { name: new RegExp(`^${hasta},`) }).click();
    await expect(page.getByText('Tu turno')).toBeVisible({ timeout: 30_000 });
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/11-practica.png` });
});

test('recorrido de perfil y análisis', async ({ browser }) => {
  const a = await nuevaPagina(browser, 1440, 1000, 'dark');
  const b = await nuevaPagina(browser, 1440, 1000, 'dark');
  const nombreA = await registrar(a, 'tour_perf');
  await registrar(b, 'tour_riv2');

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
  await mover(blancas, 'e2', 'e4');
  await mover(negras, 'e7', 'e5');
  await mover(blancas, 'f1', 'c4');
  await mover(negras, 'b8', 'c6');
  await mover(blancas, 'd1', 'h5');
  await mover(negras, 'g8', 'f6');
  await mover(blancas, 'h5', 'f7');
  await expect(blancas.getByRole('heading', { name: 'Ganaste' })).toBeVisible({ timeout: 15_000 });
  await blancas.screenshot({ path: `${OUT}/12-fin-con-rating.png` });

  await blancas.getByRole('link', { name: 'Analizar partida' }).click();
  await expect(blancas.getByText('RESUMEN')).toBeVisible({ timeout: 90_000 });
  await blancas.getByRole('button', { name: 'Jugada siguiente' }).click();
  await blancas.getByRole('button', { name: 'Jugada siguiente' }).click();
  await blancas.getByRole('button', { name: 'Jugada siguiente' }).click();
  await blancas.getByRole('button', { name: 'Jugada siguiente' }).click();
  await blancas.getByRole('button', { name: 'Jugada siguiente' }).click();
  await blancas.getByRole('button', { name: 'Jugada siguiente' }).click();
  await blancas.waitForTimeout(400);
  await blancas.screenshot({ path: `${OUT}/13-analisis.png` });

  const perfil = colorA === 'white' ? a : b;
  await perfil.goto(`/perfil/${colorA === 'white' ? nombreA : (await perfil.evaluate(() => fetch('/api/auth/me').then((r) => r.json()).then((d) => d.user.username)))}`);
  await expect(perfil.getByRole('heading', { level: 1 })).toBeVisible();
  await perfil.waitForTimeout(500);
  await perfil.screenshot({ path: `${OUT}/14-perfil.png`, fullPage: true });
});

test('recorrido del salón y los puzzles', async ({ browser }) => {
  const page = await nuevaPagina(browser, 1440, 1000, 'dark');
  await registrar(page, 'tour_entr');

  await page.goto('/entrenamiento/la-clavada');
  await expect(page.getByText('PASO 1 DE 2')).toBeVisible();
  await page.getByRole('gridcell', { name: /^e4,/ }).click();
  await page.getByRole('gridcell', { name: /^e5,/ }).click();
  await expect(page.getByText('¡Esa es!')).toBeVisible();
  await page.screenshot({ path: `${OUT}/15-entrenamiento.png`, fullPage: true });

  await page.goto('/puzzles');
  await expect(page.getByText('TU RATING DE PUZZLES')).toBeVisible();
  await page.getByRole('button', { name: 'Ver pista' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/16-puzzles.png` });

  await page.goto('/ranking');
  await expect(page.getByRole('heading', { name: 'Tabla de posiciones' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/17-ranking.png`, fullPage: true });
});

test('recorrido en teléfono', async ({ browser }) => {
  const movil = await nuevaPagina(browser, 390, 844, 'dark');
  const rival = await nuevaPagina(browser, 1280, 800, 'dark');

  await movil.goto('/entrar');
  await movil.screenshot({ path: `${OUT}/8-movil-entrar.png` });

  await registrar(movil, 'tour_mov');
  await movil.screenshot({ path: `${OUT}/9-movil-lobby.png` });
  await registrar(rival, 'tour_riv');

  await movil.getByRole('button', { name: '3+2', exact: true }).click();
  await rival.getByRole('button', { name: '3+2', exact: true }).click();
  await movil.waitForURL(/\/partida\//, { timeout: 30_000 });
  await rival.waitForURL(/\/partida\//, { timeout: 30_000 });
  await movil.waitForTimeout(800);
  await movil.screenshot({ path: `${OUT}/10-movil-partida.png` });
});
