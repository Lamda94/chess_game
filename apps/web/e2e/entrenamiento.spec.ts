import { expect, test, type Page } from '@playwright/test';
import { ChessGame, conservaElMate } from '@gambito/chess-core';

const TAG = Math.random().toString(36).slice(2, 7);

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@entren.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

async function mover(page: Page, desde: string, hasta: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${desde},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${hasta},`) }).click();
}

test('una lección se resuelve sobre el tablero y queda completada', async ({ page }) => {
  await registrar(page, 'ent_uno');
  await page.getByRole('link', { name: 'Entrenamiento' }).click();
  await expect(page.getByRole('heading', { name: 'Salón de entrenamiento' })).toBeVisible();

  await page.getByRole('button', { name: 'Cómo se mueve cada pieza' }).click();
  await expect(page.getByText('PASO 1 DE 3')).toBeVisible();

  // Una jugada equivocada no avanza y muestra la pista.
  await mover(page, 'd4', 'd5');
  await expect(page.getByText('Subí por la columna d')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente paso' })).toBeDisabled();

  // La correcta sí.
  await mover(page, 'd4', 'd8');
  await expect(page.getByText('¡Esa es!')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente paso' }).click();

  await expect(page.getByText('PASO 2 DE 3')).toBeVisible();
  await mover(page, 'd4', 'a7');
  await page.getByRole('button', { name: 'Siguiente paso' }).click();

  await expect(page.getByText('PASO 3 DE 3')).toBeVisible();
  await mover(page, 'd4', 'f5');
  await page.getByRole('button', { name: 'Terminar la lección' }).click();

  await expect(page.getByText('LECCIÓN COMPLETADA')).toBeVisible();
  // Y el progreso de la ruta lo refleja.
  await expect(page.getByText('1/3').first()).toBeVisible();
});

test('la coronación dentro de una lección funciona', async ({ page }) => {
  await registrar(page, 'ent_dos');
  await page.goto('/entrenamiento/al-paso-y-coronacion');
  await expect(page.getByText('PASO 1 DE 2')).toBeVisible();

  // Captura al paso.
  await mover(page, 'e5', 'f6');
  await expect(page.getByText('¡Esa es!')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente paso' }).click();

  // Coronación: el selector aparece y hay que elegir dama.
  await mover(page, 'a7', 'a8');
  await expect(page.getByRole('dialog', { name: /coronación/i })).toBeVisible();
  await page.getByRole('button', { name: 'dama blanco' }).click();
  await expect(page.getByText('¡Esa es!')).toBeVisible();
});

test('un puzzle se resuelve de verdad y mueve el rating', async ({ page }) => {
  await registrar(page, 'ent_tres');
  await page.goto('/puzzles');
  await expect(page.getByText('TU RATING DE PUZZLES')).toBeVisible();
  await expect(page.getByText('0 resueltos')).toBeVisible();

  // El puzzle que toca depende del rating, así que la solución se calcula acá
  // con las mismas reglas del juego en vez de hardcodearla.
  const { puzzle } = await page.evaluate(() =>
    fetch('/api/training/puzzles/next').then((r) => r.json()),
  );
  const juego = new ChessGame(puzzle.fen);
  const solucion = juego
    .legalMoves()
    .find((m) => conservaElMate(puzzle.fen, m.uci, puzzle.mateEn));
  expect(solucion, 'el puzzle servido no tiene solución').toBeDefined();

  await mover(page, solucion!.from, solucion!.to);

  if (puzzle.mateEn === 1) {
    await expect(page.getByText('¡Mate! Puzzle resuelto.')).toBeVisible();
    await expect(page.getByText('1 resueltos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Puzzle siguiente' })).toBeVisible();
  } else {
    // En un mate en dos el rival contesta y queda una jugada menos.
    await expect(page.getByText(/El rival se defendió/)).toBeVisible();
  }
});

test('una jugada que suelta el mate se rechaza', async ({ page }) => {
  await registrar(page, 'ent_mal');
  await page.goto('/puzzles');
  await expect(page.getByText('TU RATING DE PUZZLES')).toBeVisible();

  const { puzzle } = await page.evaluate(() =>
    fetch('/api/training/puzzles/next').then((r) => r.json()),
  );
  const juego = new ChessGame(puzzle.fen);
  const mala = juego.legalMoves().find((m) => !conservaElMate(puzzle.fen, m.uci, puzzle.mateEn));
  expect(mala, 'este puzzle no tiene ninguna jugada mala, revisá el set').toBeDefined();

  await mover(page, mala!.from, mala!.to);
  await expect(page.getByText('Esa jugada suelta el mate')).toBeVisible();
  // Y el fallo quedó contado.
  await expect(page.getByText('1 fallados')).toBeVisible();
});

test('el ranking explica por qué está vacío y muestra tu posición', async ({ page }) => {
  await registrar(page, 'ent_rank');
  await page.getByRole('link', { name: 'Ranking' }).click();
  await expect(page.getByRole('heading', { name: 'Tabla de posiciones' })).toBeVisible();
  await expect(page.getByText(/Todavía nadie calibró su rating|Blitz/).first()).toBeVisible();
  // Con cero partidas el jugador aparece al pie como provisorio.
  await expect(page.getByText(/faltan \d+ partidas para entrar/)).toBeVisible();
});

test('la lección no se desborda de su tarjeta', async ({ page }) => {
  await registrar(page, 'ent_layout');
  await page.goto('/entrenamiento/la-clavada');
  await expect(page.getByText('PASO 1 DE 2')).toBeVisible();

  // El texto tiene que quedar dentro de los límites de la sección que lo contiene.
  const tarjeta = page.locator('section').filter({ hasText: 'PASO 1 DE 2' }).first();
  const parrafo = tarjeta.locator('p').first();
  const cajaTarjeta = await tarjeta.boundingBox();
  const cajaTexto = await parrafo.boundingBox();
  expect(cajaTarjeta).not.toBeNull();
  expect(cajaTexto).not.toBeNull();
  expect(cajaTexto!.x + cajaTexto!.width).toBeLessThanOrEqual(cajaTarjeta!.x + cajaTarjeta!.width + 1);

  // Y la página no puede tener barra horizontal.
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(desborde).toBe(false);
});

test('el texto de la lección sigue siendo legible en pantallas angostas', async ({ page }) => {
  await registrar(page, 'ent_ancho');

  /**
   * El corte no puede mirar el ancho de la ventana: a 1280px la ventana pasa
   * cualquier breakpoint, pero la columna del medio comparte la pantalla con la
   * lista de rutas y el panel de logros, y al tablero le quedaban 420px fijos.
   * El texto terminaba en una tira de una palabra por renglón. Se resuelve con
   * una consulta de contenedor, y esto lo verifica donde dolía.
   */
  for (const ancho of [1180, 1280, 1920]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto('/entrenamiento/la-clavada');
    await expect(page.getByText('PASO 1 DE 2')).toBeVisible();

    const tarjeta = page.locator('section').filter({ hasText: 'PASO 1 DE 2' }).first();
    const caja = await tarjeta.locator('p').first().boundingBox();
    expect(caja, `a ${ancho}px no se encontró el texto`).not.toBeNull();
    expect(
      Math.round(caja!.width),
      `a ${ancho}px el texto quedó en ${Math.round(caja!.width)}px de ancho`,
    ).toBeGreaterThan(260);
  }
});
