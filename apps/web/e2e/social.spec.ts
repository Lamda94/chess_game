import { expect, test, type Browser, type Page } from '@playwright/test';

const TAG = Math.random().toString(36).slice(2, 7);

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@social.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

async function nueva(browser: Browser) {
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  return contexto.newPage();
}

test('dos personas se agregan como amigos', async ({ browser }) => {
  const a = await nueva(browser);
  const b = await nueva(browser);
  const nombreA = await registrar(a, 'soc_a');
  const nombreB = await registrar(b, 'soc_b');

  await expect(a.getByText('Todavía no agregaste a nadie.')).toBeVisible();
  await a.getByLabel('Agregar por nombre de jugador').fill(nombreB);
  await a.getByRole('button', { name: 'Agregar' }).click();
  await expect(a.getByText(/1 pedido esperando respuesta/)).toBeVisible();

  // B ve el pedido y lo acepta.
  await b.reload();
  await expect(b.getByText('TE QUIEREN AGREGAR')).toBeVisible({ timeout: 15_000 });
  await b.getByRole('button', { name: 'Aceptar' }).click();
  await expect(b.getByRole('button', { name: 'Desafiar' })).toBeVisible();

  // Y A también lo tiene en su lista.
  await a.reload();
  await expect(a.getByText(nombreB).first()).toBeVisible();
  await expect(a.getByRole('button', { name: 'Desafiar' })).toBeVisible();
  expect(nombreA).toBeTruthy();
});

test('un desafío por enlace arranca una partida entre los dos', async ({ browser }) => {
  const a = await nueva(browser);
  const b = await nueva(browser);
  await registrar(a, 'des_a');
  await registrar(b, 'des_b');

  // Desafío abierto: sin destinatario, lo toma quien abra el enlace.
  const { desafio } = await a.evaluate(() =>
    fetch('/api/challenges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControl: { initialSec: 180, incrementSec: 2 }, rated: true }),
    }).then((r) => r.json()),
  );

  // Quien lo creó ve el enlace, no el botón de aceptar.
  await a.goto(`/desafio/${desafio.id}`);
  await expect(a.getByRole('heading', { name: 'Tu desafío está listo' })).toBeVisible();
  await expect(a.getByRole('button', { name: 'Aceptar y jugar' })).toHaveCount(0);

  // El otro abre el mismo enlace y acepta.
  await b.goto(`/desafio/${desafio.id}`);
  await expect(b.getByRole('heading', { name: /te desafía/ })).toBeVisible();
  await b.getByRole('button', { name: 'Aceptar y jugar' }).click();
  await b.waitForURL(/\/partida\//);
  await expect(b.getByRole('grid', { name: /Tablero de ajedrez/ })).toBeVisible();

  // Y quien desafió también termina en la partida.
  await a.reload();
  await expect(a.getByRole('link', { name: 'Ir a la partida' })).toBeVisible({ timeout: 15_000 });
});

test('una partida ajena se puede espectar sin poder mover', async ({ browser }) => {
  const a = await nueva(browser);
  const b = await nueva(browser);
  const espectador = await nueva(browser);
  await registrar(a, 'esp_a');
  await registrar(b, 'esp_b');
  await registrar(espectador, 'esp_c');

  await a.getByRole('button', { name: '3+2', exact: true }).click();
  await b.getByRole('button', { name: '3+2', exact: true }).click();
  await a.waitForURL(/\/partida\//, { timeout: 30_000 });
  const gameId = a.url().split('/partida/')[1]!;

  // El espectador entra por el lobby, desde "partidas en vivo".
  await espectador.goto('/');
  await expect(espectador.getByText(/vs /).first()).toBeVisible({ timeout: 20_000 });
  await espectador.goto(`/partida/${gameId}`);
  await expect(espectador.getByRole('grid', { name: /Tablero de ajedrez/ })).toBeVisible();

  // Ve la partida pero no tiene botones de jugador ni chat.
  await expect(espectador.getByRole('button', { name: 'Rendirse' })).toHaveCount(0);
  await expect(espectador.getByText('CHAT')).toHaveCount(0);

  // Y tocar el tablero no mueve nada.
  await espectador.getByRole('gridcell', { name: /^e2,/ }).click();
  await espectador.getByRole('gridcell', { name: /^e4,/ }).click();
  await espectador.waitForTimeout(500);
  await expect(espectador.getByText('Todavía no se jugó nada.')).toBeVisible();
});

test('el tablero se recorre con las flechas del teclado', async ({ browser }) => {
  const page = await nueva(browser);
  await registrar(page, 'tec_a');
  await page.goto('/entrenamiento/como-se-mueven');
  await expect(page.getByText('PASO 1 DE 3')).toBeVisible();

  // La primera casilla es la única que entra en el orden de tabulación.
  await page.getByRole('gridcell', { name: /^a8,/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('gridcell', { name: /^b8,/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('gridcell', { name: /^b7,/ })).toBeFocused();

  // Y no se sale del tablero por el borde.
  await page.getByRole('gridcell', { name: /^a8,/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('gridcell', { name: /^a8,/ })).toBeFocused();

  // Con Enter se juega: se toma la torre de d4 y se la lleva a d8.
  await page.getByRole('gridcell', { name: /^d4,/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('gridcell', { name: /^d8,/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('¡Esa es!')).toBeVisible();
});

test('la app se declara instalable', async ({ page }) => {
  await page.goto('/entrar');
  const manifiesto = await page.getAttribute('link[rel="manifest"]', 'href');
  expect(manifiesto).toBe('/manifest.webmanifest');

  const respuesta = await page.request.get('/manifest.webmanifest');
  expect(respuesta.status()).toBe(200);
  const datos = await respuesta.json();
  expect(datos.name).toBe('Gambito');
  expect(datos.display).toBe('standalone');
  expect(datos.icons.length).toBeGreaterThan(0);

  // Los iconos que declara tienen que existir de verdad.
  for (const icono of datos.icons) {
    const archivo = await page.request.get(icono.src);
    expect(archivo.status(), icono.src).toBe(200);
  }
});
