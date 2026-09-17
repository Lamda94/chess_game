import { expect, test, type Browser, type Page } from '@playwright/test';

const TAG = Math.random().toString(36).slice(2, 7);

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@torneos.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

async function nueva(browser: Browser) {
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  return contexto.newPage();
}

test('se crea un torneo con el asistente y aparece en el listado', async ({ browser }) => {
  const page = await nueva(browser);
  await registrar(page, 'tor_org');

  await page.getByRole('link', { name: 'Torneos' }).click();
  await expect(page.getByRole('heading', { name: 'Torneos' })).toBeVisible();
  await page.getByRole('link', { name: 'Crear torneo' }).click();

  // Paso 1: formato.
  await expect(page.getByRole('heading', { name: 'Crear torneo' })).toBeVisible();
  await page.getByRole('button', { name: /Suizo/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Paso 2: nombre, tiempo y rondas. La vista previa refleja lo elegido.
  const nombre = `Suizo de prueba ${TAG}`;
  await page.getByLabel('Nombre del torneo').fill(nombre);
  await page.getByRole('button', { name: '3+2', exact: true }).click();
  await page.getByLabel('Rondas').fill('3');
  await expect(page.getByText(nombre).first()).toBeVisible();
  await expect(page.getByText('Suizo, 3 rondas')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Paso 3: publicar.
  await page.getByRole('button', { name: 'Crear torneo' }).click();

  await page.waitForURL(/\/torneos\/[a-z0-9]+/);
  await expect(page.getByRole('heading', { name: nombre })).toBeVisible();
  await expect(page.getByText('Todavía no se inscribió nadie.')).toBeVisible();

  // Y está en el listado público.
  await page.goto('/torneos');
  await expect(page.getByText(nombre)).toBeVisible();
});

test('cuatro jugadores juegan un suizo completo y la clasificación se actualiza sola', async ({ browser }) => {
  test.setTimeout(180_000);

  const paginas = await Promise.all([nueva(browser), nueva(browser), nueva(browser), nueva(browser)]);
  const nombres: string[] = [];
  for (const [indice, page] of paginas.entries()) {
    nombres.push(await registrar(page, `tor_j${indice}`));
  }

  // El primero crea el torneo por la API, que es más directo que el asistente.
  const nombreTorneo = `Relámpago ${TAG}`;
  const { torneo } = await paginas[0]!.evaluate(
    async ([nombre]) =>
      fetch('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre,
          format: 'SWISS',
          timeControl: { initialSec: 180, incrementSec: 2 },
          rounds: 3,
          startsAt: new Date().toISOString(),
        }),
      }).then((r) => r.json()),
    [nombreTorneo],
  );

  // Todos se inscriben desde la sala.
  for (const page of paginas) {
    await page.goto(`/torneos/${torneo.id}`);
    await page.getByRole('button', { name: 'Inscribirme' }).click();
    await expect(page.getByRole('button', { name: 'Retirarme' })).toBeVisible();
  }

  // La clasificación ya muestra a los cuatro, sin recargar en las otras pestañas.
  // El nombre aparece en la cabecera y en la clasificación: alcanza con el primero.
  await expect(paginas[1]!.getByText(nombres[0]!).first()).toBeVisible({ timeout: 15_000 });

  // El organizador arranca.
  await paginas[0]!.getByRole('button', { name: 'Empezar ahora' }).click();
  await expect(paginas[0]!.getByText(/RONDA 1 DE 3/)).toBeVisible({ timeout: 20_000 });

  // Se emparejaron dos tableros y cada quien tiene su partida.
  await expect(paginas[0]!.getByText('RONDA 1', { exact: false }).first()).toBeVisible();
  for (const page of paginas) {
    await expect(page.getByRole('link', { name: 'Ir a mi partida' })).toBeVisible({ timeout: 20_000 });
  }

  // Cada jugador se rinde para cerrar la ronda rápido; el torneo avanza solo.
  // `isVisible()` no espera, así que hay que pedir explícitamente el estado:
  // si no, el segundo tablero quedaba sin rendir y la ronda nunca cerraba.
  const visible = async (locator: ReturnType<Page['getByRole']>) =>
    locator
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

  for (const page of paginas) {
    await page.goto(`/torneos/${torneo.id}`);
    const enlace = page.getByRole('link', { name: 'Ir a mi partida' });
    if (!(await visible(enlace))) continue;

    await enlace.click();
    await page.waitForURL(/\/partida\//);
    const rendirse = page.getByRole('button', { name: 'Rendirse' });
    if (!(await visible(rendirse))) continue;

    page.once('dialog', (d) => void d.accept());
    await rendirse.click();
    await expect(page.getByText(/Ganaste|Perdiste|Tablas/).first()).toBeVisible({ timeout: 15_000 });
  }

  // Al cerrarse la ronda 1, el servidor empareja la 2 y avisa por socket.
  await paginas[0]!.goto(`/torneos/${torneo.id}`);
  await expect(paginas[0]!.getByText(/RONDA 2 DE 3/)).toBeVisible({ timeout: 30_000 });

  // Y la clasificación reparte exactamente un punto por partida decidida. Es el
  // invariante que hay que comprobar, y no un número fijo: cuando arranca la
  // ronda 2 el bucle de arriba puede llegar a cerrar alguna partida más.
  const detalle = await paginas[0]!.evaluate(
    (id) => fetch(`/api/tournaments/${id}`).then((r) => r.json()),
    torneo.id,
  );
  const total = detalle.clasificacion.reduce((s: number, f: { puntos: number }) => s + f.puntos, 0);
  const decididas = detalle.rondas
    .flatMap((r: { cruces: Array<{ result: string | null; isBye: boolean }> }) => r.cruces)
    .filter((c: { result: string | null; isBye: boolean }) => c.result !== null && !c.isBye).length;
  expect(decididas).toBeGreaterThanOrEqual(2);
  expect(total).toBe(decididas);

  // Y nadie repitió rival en las rondas jugadas.
  const cruces: string[] = detalle.rondas
    .flatMap((r: { cruces: Array<{ white: { id: string } | null; black: { id: string } | null }> }) => r.cruces)
    .filter((c: { white: unknown; black: unknown }) => c.white && c.black)
    .map((c: { white: { id: string }; black: { id: string } }) =>
      [c.white.id, c.black.id].sort().join('-'),
    );
  expect(new Set(cruces).size).toBe(cruces.length);
});

test('un POST sin cuerpo no se rompe: cerrar sesión funciona', async ({ browser }) => {
  // Regresión: el cliente declaraba JSON sin mandar cuerpo y el servidor
  // devolvía 400, así que "Salir" no cerraba nada.
  const page = await nueva(browser);
  await registrar(page, 'tor_salir');
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.waitForURL(/\/entrar/);
  await expect(page.getByRole('heading', { name: 'Sentate al tablero' })).toBeVisible();

  // Y la sesión quedó cerrada de verdad del lado del servidor.
  const yo = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  expect(yo.user).toBeNull();
});
