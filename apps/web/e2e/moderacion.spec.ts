import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

/**
 * El panel de moderación desde el navegador.
 *
 * Lo que se verifica acá es lo que la API no puede: que el enlace sólo aparezca
 * para quien tiene el rol, y que la ruta siga protegida si alguien la escribe a
 * mano. La lógica de suspensión se prueba en `moderacion.test.ts`.
 */

const TAG = Math.random().toString(36).slice(2, 7);

/**
 * El rol no se puede cambiar desde la aplicación —a propósito: nadie se asciende
 * a moderador por la API—, así que el dato de partida se prepara contra la base
 * directamente. El paquete web no depende de Prisma y no vale la pena que lo
 * haga sólo para esto.
 */
function sql(consulta: string): void {
  execFileSync(
    'docker',
    ['exec', '-i', 'gambito-postgres', 'psql', '-U', 'gambito', '-d', 'gambito', '-c', consulta],
    { stdio: 'pipe' },
  );
}

test.afterAll(() => {
  sql(`DELETE FROM "User" WHERE "usernameLower" LIKE '%${TAG}%'`);
});

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@moder.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

test('un jugador común no ve el panel ni entrando por la URL', async ({ page }) => {
  await registrar(page, 'mod_raso');

  await expect(page.getByRole('link', { name: 'Moderación' })).toHaveCount(0);

  await page.goto('/moderacion');
  await expect(page.getByRole('heading', { name: 'Moderación' })).toBeVisible();
  // La página carga, pero la API le niega los datos y no ve ninguna cuenta.
  await expect(page.getByText('Ninguna cuenta coincide.')).toBeVisible({ timeout: 15_000 });
});

test('un moderador suspende una cuenta y la deja afuera', async ({ page, browser }) => {
  const moderador = await registrar(page, 'mod_jefe');
  sql(`UPDATE "User" SET role = 'MODERATOR' WHERE "usernameLower" = '${moderador.toLowerCase()}'`);

  const otra = await browser.newContext();
  const victima = await otra.newPage();
  const nombreVictima = await registrar(victima, 'mod_reo');

  // El enlace aparece recién cuando la sesión se refresca con el rol nuevo.
  await page.reload();
  await page.getByRole('link', { name: 'Moderación' }).click();

  await page.getByLabel('Buscar por nombre de jugador').fill(nombreVictima);
  const fila = page.getByTestId(`cuenta-${nombreVictima}`);
  await expect(fila).toBeVisible({ timeout: 15_000 });

  await fila.getByLabel('Motivo').fill('Uso de motor en partidas clasificatorias');
  await fila.getByRole('button', { name: 'Suspender' }).click();
  await expect(fila.getByText('SUSPENDIDA')).toBeVisible({ timeout: 15_000 });

  // Y la cuenta ya no puede volver a entrar.
  await victima.goto('/entrar');
  await victima.getByRole('tab', { name: 'Entrar' }).click();
  await victima.getByLabel('Correo o nombre de jugador').fill(nombreVictima);
  await victima.getByLabel('Contraseña').fill('contrasenadeprueba');
  await victima.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(victima.getByText(/suspendida/i)).toBeVisible({ timeout: 15_000 });

  await otra.close();
});
