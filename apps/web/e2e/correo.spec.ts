import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Verificación de correo y recuperación de contraseña, de punta a punta.
 *
 * En desarrollo el mailer escribe cada mensaje en `MAIL_OUTBOX` en vez de
 * mandarlo, así que la prueba lee el enlace del mismo lugar donde lo leería
 * quien levanta el proyecto en su máquina. No hay endpoint de prueba ni atajo:
 * el token que se abre es el que viajó en el correo.
 */

const TAG = Math.random().toString(36).slice(2, 7);
const BUZON = resolve(process.cwd(), '../api/.mail/outbox.jsonl');
const CLAVE = 'contrasenaoriginal';

interface Correo {
  para: string;
  asunto: string;
  texto: string;
}

function correos(para: string): Correo[] {
  try {
    return readFileSync(BUZON, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Correo)
      .filter((m) => m.para === para);
  } catch {
    return [];
  }
}

/** Espera a que llegue un correo que cumpla la condición y devuelve su enlace. */
async function esperarEnlace(para: string, asunto: RegExp, desde = 0): Promise<string> {
  for (let intento = 0; intento < 40; intento += 1) {
    const recibidos = correos(para).slice(desde).filter((m) => asunto.test(m.asunto));
    const ultimo = recibidos.at(-1);
    if (ultimo) {
      const url = /https?:\/\/\S+/.exec(ultimo.texto)?.[0];
      if (url) return url;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No llegó ningún correo a ${para} que coincida con ${asunto}`);
}

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  const email = `${usuario}@correoe2e.test`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return { usuario, email };
}

test('el aviso de correo sin confirmar aparece, y el enlace lo hace desaparecer', async ({ page }) => {
  const { email } = await registrar(page, 'cor_ver');

  const aviso = page.getByRole('status').filter({ hasText: 'Confirmá tu correo' });
  await expect(aviso).toBeVisible();

  const enlace = await esperarEnlace(email, /Confirmá tu correo/);
  await page.goto(new URL(enlace).pathname + new URL(enlace).search);
  await expect(page.getByRole('heading', { name: 'Correo confirmado' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Confirmá tu correo' })).toHaveCount(0);
});

test('el mismo enlace de confirmación no sirve dos veces', async ({ page }) => {
  const { email } = await registrar(page, 'cor_dos');
  const enlace = await esperarEnlace(email, /Confirmá tu correo/);
  const destino = new URL(enlace).pathname + new URL(enlace).search;

  await page.goto(destino);
  await expect(page.getByRole('heading', { name: 'Correo confirmado' })).toBeVisible();

  await page.goto(destino);
  await expect(page.getByRole('heading', { name: 'Ese enlace ya no sirve' })).toBeVisible();
});

test('se recupera la contraseña y la vieja deja de servir', async ({ page }) => {
  const { usuario, email } = await registrar(page, 'cor_rec');
  const yaRecibidos = correos(email).length;
  await page.getByRole('button', { name: 'Salir' }).click();

  // Desde el ingreso, el enlace de olvido.
  await page.getByRole('tab', { name: 'Entrar' }).click();
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeVisible();

  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Mandarme el enlace' }).click();
  await expect(page.getByRole('heading', { name: 'Revisá tu correo' })).toBeVisible();

  const enlace = await esperarEnlace(email, /Restablecer/, yaRecibidos);
  await page.goto(new URL(enlace).pathname + new URL(enlace).search);

  const nueva = 'contrasenanueva456';
  await page.getByLabel('Contraseña nueva').fill(nueva);
  await page.getByLabel('Repetila').fill(nueva);
  await page.getByRole('button', { name: 'Guardar y entrar' }).click();

  // Entra directo: acaba de demostrar que el correo es suyo.
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();

  // La contraseña vieja ya no entra; la nueva sí.
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.getByRole('tab', { name: 'Entrar' }).click();
  await page.getByLabel('Correo o nombre de jugador').fill(usuario);
  await page.getByLabel('Contraseña').fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();

  await page.getByLabel('Contraseña').fill(nueva);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
});

test('pedir recuperación para un correo inexistente dice lo mismo', async ({ page }) => {
  await page.goto('/olvide');
  await page.getByLabel('Correo electrónico').fill(`nadie_${TAG}@correoe2e.test`);
  await page.getByRole('button', { name: 'Mandarme el enlace' }).click();

  // Mismo mensaje que para una cuenta real: no se filtra quién está registrado.
  await expect(page.getByRole('heading', { name: 'Revisá tu correo' })).toBeVisible();
});

test('un enlace de restablecer sin código explica qué hacer', async ({ page }) => {
  await page.goto('/restablecer');
  await expect(page.getByRole('heading', { name: 'Enlace incompleto' })).toBeVisible();
  await page.getByRole('link', { name: 'Pedir un enlace nuevo' }).click();
  await expect(page.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeVisible();
});
