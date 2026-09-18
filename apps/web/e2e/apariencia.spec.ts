import { expect, test, type Browser, type Page } from '@playwright/test';
import { colorDe, mover } from './ayudas.js';
import { BOARD_THEME_INFO, PIECE_SET_INFO, rutaDePieza } from '@gambito/shared';

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

  await page.getByRole('tab', { name: 'Tablero' }).click();
  await page.getByRole('button', { name: 'Bosque' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--board-light').trim(),
      ),
    )
    .not.toBe(colorInicial);

  await page.getByRole('tab', { name: 'Piezas' }).click();
  await page.getByRole('button', { name: 'Celta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Celta', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('la apariencia sobrevive a recargar y llega al tablero de la partida', async ({ page }) => {
  const usuario = await registrar(page, 'apb');
  await page.goto('/apariencia');
  await page.getByRole('tab', { name: 'Tablero' }).click();
  await page.getByRole('button', { name: 'Océano' }).click();
  await page.getByRole('tab', { name: 'Piezas' }).click();
  await page.getByRole('button', { name: 'Mérida', exact: true }).click();
  await page.waitForTimeout(400);

  /**
   * Recargar es la prueba de que se guardó en el servidor y no en memoria: si
   * viviera sólo en el navegador, esto pasaría igual, pero al menos descarta que
   * se pierda al navegar. La comprobación fuerte es la consulta a la sesión.
   */
  await page.reload();
  const sesion = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  expect(sesion.user.boardTheme).toBe('oceano');
  expect(sesion.user.pieceSet).toBe('merida');
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

  /** De qué juego sale la primera pieza que hay en el tablero. */
  const juegoEnElTablero = () =>
    page.evaluate(() => {
      const img = document.querySelector('[role="grid"] img') as HTMLImageElement | null;
      return img ? new URL(img.src).pathname : '';
    });

  const elegir = async (juego: string) => {
    await page.goto('/apariencia');
    await page.getByRole('button', { name: juego, exact: true }).click();
    await page.waitForTimeout(400);
    await page.goto('/practica');
    await expect(page.getByRole('grid', { name: /Tablero de ajedrez/ })).toBeVisible({ timeout: 40_000 });
    return juegoEnElTablero();
  };

  const clasicas = await elegir('Clásicas');
  const celta = await elegir('Celta');

  expect(clasicas).toContain('/piece/cburnett/');
  expect(celta, 'el tablero siguió usando el juego anterior').toContain('/piece/celtic/');
});

test('cada juego y cada tema del catálogo se puede elegir y se aplica', async ({ page }) => {
  /**
   * Recorre el catálogo entero en vez de un par de ejemplos: el día que se
   * agregue una entrada con un id mal escrito o un color inválido, esto lo
   * atrapa. Son datos, y los datos se rompen en silencio.
   */
  await registrar(page, 'apcat');
  await page.goto('/apariencia');

  await page.getByRole('tab', { name: 'Piezas' }).click();
  for (const info of PIECE_SET_INFO) {
    // `exact`: hay etiquetas que son prefijo de otra —"Pixel" y "Pixel noche"—.
    const opcion = page.getByRole('button', { name: info.label, exact: true });
    await opcion.click();
    await expect(opcion).toHaveAttribute('aria-pressed', 'true');
  }

  await page.getByRole('tab', { name: 'Tablero' }).click();
  for (const info of BOARD_THEME_INFO) {
    await page.getByRole('button', { name: info.label, exact: true }).click();
    // El color del tema tiene que llegar a la variable que usa el tablero.
    await expect
      .poll(async () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--board-light').trim().toLowerCase(),
        ),
      )
      .toBe(info.colores.light.toLowerCase());
  }

  // Y lo último elegido quedó guardado en el servidor.
  const sesion = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  expect(sesion.user.boardTheme).toBe(BOARD_THEME_INFO.at(-1)!.id);
  expect(sesion.user.pieceSet).toBe(PIECE_SET_INFO.at(-1)!.id);
});

test('todas las piezas de todos los juegos se sirven', async ({ page }) => {
  /**
   * Son archivos de terceros copiados al repositorio: si falta uno, el tablero
   * muestra un hueco justo donde iba una pieza. Se piden los doce de cada juego,
   * que es barato y evita descubrirlo en una partida.
   */
  await page.goto('/entrar');
  const faltantes: string[] = [];

  for (const info of PIECE_SET_INFO) {
    for (const tipo of ['p', 'n', 'b', 'r', 'q', 'k']) {
      for (const color of ['white', 'black'] as const) {
        const ruta = rutaDePieza(info.id, tipo, color);
        const respuesta = await page.request.get(ruta);
        if (!respuesta.ok()) faltantes.push(`${ruta} -> ${respuesta.status()}`);
      }
    }
  }

  expect(faltantes, faltantes.slice(0, 5).join(' | ')).toEqual([]);
});

test('las licencias de las piezas se publican junto a ellas', async ({ page }) => {
  // Varias de estas licencias exigen acreditar al autor. Si el archivo no se
  // sirve, el despliegue está incumpliéndolas.
  await page.goto('/entrar');
  const respuesta = await page.request.get('/piece/LICENCIAS.md');
  expect(respuesta.status()).toBe(200);

  const texto = await respuesta.text();
  for (const info of PIECE_SET_INFO) {
    expect(texto, `falta acreditar ${info.id}`).toContain(info.id);
    expect(texto, `falta el autor de ${info.id}`).toContain(info.autor);
  }
});
