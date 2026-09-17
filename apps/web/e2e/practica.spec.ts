import { expect, test, type Page } from '@playwright/test';

const TAG = Math.random().toString(36).slice(2, 7);

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@practica.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
}

/**
 * La sala se carga en un trozo aparte, así que primero hay que esperar a que la
 * página exista y recién después a que el motor termine de arrancar. Comprobar
 * sólo el aviso del motor pasaba de largo: todavía no estaba ni montado.
 */
async function esperarMotor(page: Page) {
  await expect(page.getByRole('heading', { name: 'Práctica contra la IA' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Cargando el motor…')).toBeHidden({ timeout: 60_000 });
}

async function mover(page: Page, desde: string, hasta: string) {
  await page.getByRole('gridcell', { name: new RegExp(`^${desde},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${hasta},`) }).click();
}

test('la IA contesta las jugadas del jugador', async ({ page }) => {
  await registrar(page, 'prac_uno');
  await page.getByRole('link', { name: 'Practicar contra la IA' }).click();

  await esperarMotor(page);

  await expect(page.getByText('Todavía no se jugó nada.')).toBeVisible();
  await mover(page, 'e2', 'e4');

  // Cuando vuelve a decir "Tu turno" es porque la IA ya contestó.
  await expect(page.getByText('Juega la IA')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Tu turno')).toBeVisible({ timeout: 30_000 });

  // Y la primera línea de la notación tiene las dos jugadas, sin el hueco "…".
  const primeraLinea = page.getByRole('main').locator('div').filter({ hasText: /^1\.e4/ }).last();
  await expect(primeraLinea).toBeVisible();
  await expect(primeraLinea).not.toContainText('…');
});

test('la notación no duplica jugadas', async ({ page }) => {
  await registrar(page, 'prac_not');
  await page.goto('/practica');
  await esperarMotor(page);

  for (const [desde, hasta] of [['e2', 'e4'], ['g1', 'f3'], ['f1', 'c4']] as Array<[string, string]>) {
    await mover(page, desde, hasta);
    await expect(page.getByText('Tu turno')).toBeVisible({ timeout: 30_000 });
  }

  // Tres jugadas propias más tres de la IA son tres líneas numeradas, no seis.
  const numeros = page.getByRole('main').getByText(/^[0-9]+\.$/);
  await expect(numeros).toHaveCount(3);
  // Y en una línea, la columna blanca y la negra no pueden ser la misma jugada.
  const primera = (await numeros.first().locator('..').innerText()).split('\n');
  expect(primera[1]).not.toBe(primera[2]);
});

test('la pista propone una jugada y deshacer retrocede', async ({ page }) => {
  await registrar(page, 'prac_dos');
  await page.goto('/practica');
  await esperarMotor(page);

  // La pista aparece sola porque viene activada.
  await expect(page.getByText('PISTA')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('El motor jugaría')).toBeVisible();

  await mover(page, 'd2', 'd4');
  await expect(page.getByText('Tu turno')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Deshacer' }).click();
  // Vuelve a la posición inicial: la lista de jugadas queda vacía.
  await expect(page.getByText('Todavía no se jugó nada.')).toBeVisible();
});

test('el hándicap le saca material a la IA', async ({ page }) => {
  await registrar(page, 'prac_tres');
  await page.goto('/practica');
  await esperarMotor(page);

  await page.getByLabel('Hándicap de material').selectOption('dama');
  await page.getByRole('button', { name: 'Nueva partida de práctica' }).click();

  // El jugador conserva su dama en d1; la IA ya no tiene la suya en d8.
  await expect(page.getByRole('gridcell', { name: 'd1, dama blanco' })).toBeVisible();
  await expect(page.getByRole('gridcell', { name: 'd8, vacía' })).toBeVisible();
});
