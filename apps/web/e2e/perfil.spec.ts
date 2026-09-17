import { expect, test, type Browser, type Page } from '@playwright/test';

const TAG = Math.random().toString(36).slice(2, 7);

async function registrar(page: Page, nombre: string) {
  const usuario = `${nombre}_${TAG}`;
  await page.goto('/entrar');
  await page.getByLabel('Nombre de jugador').fill(usuario);
  await page.getByLabel('Correo electrónico').fill(`${usuario}@perfil.test`);
  await page.getByLabel('Contraseña').fill('contrasenadeprueba');
  await page.getByRole('button', { name: /Crear cuenta con correo/ }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Buenas, ${usuario}`) })).toBeVisible();
  return usuario;
}

/** Juega una española completa entre dos pestañas y la termina por abandono. */
async function jugarUnaPartida(a: Page, b: Page) {
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

  // El color lo sortea el servidor, así que hay que mirar cuál tocó y no suponerlo.
  const blancas = colorA === 'white' ? a : b;
  const negras = colorA === 'white' ? b : a;
  const mover = async (page: Page, desde: string, hasta: string) => {
    await page.getByRole('gridcell', { name: new RegExp(`^${desde},`) }).click();
    await page.getByRole('gridcell', { name: new RegExp(`^${hasta},`) }).click();
    await page.waitForTimeout(200);
  };

  // Apertura española: queda registrada en el PGN y el perfil debe reconocerla.
  await mover(blancas, 'e2', 'e4');
  await mover(negras, 'e7', 'e5');
  await mover(blancas, 'g1', 'f3');
  await mover(negras, 'b8', 'c6');
  await mover(blancas, 'f1', 'b5');

  negras.once('dialog', (d) => void d.accept());
  await negras.getByRole('button', { name: 'Rendirse' }).click();
  await expect(blancas.getByRole('heading', { name: 'Ganaste' })).toBeVisible({ timeout: 15_000 });
  return { blancas, negras };
}

async function nueva(browser: Browser) {
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return contexto.newPage();
}

test('el perfil resume las partidas jugadas', async ({ browser }) => {
  const a = await nueva(browser);
  const b = await nueva(browser);
  const nombreA = await registrar(a, 'perf_uno');
  const nombreB = await registrar(b, 'perf_dos');

  const { blancas } = await jugarUnaPartida(a, b);
  const ganador = blancas;
  const nombreGanador = blancas === a ? nombreA : nombreB;
  const nombrePerdedor = blancas === a ? nombreB : nombreA;

  await ganador.goto('/perfil');
  await expect(ganador.getByRole('heading', { name: nombreGanador })).toBeVisible();

  // El rating ya no es 1500: la partida clasificatoria lo movió.
  const tarjetaBlitz = ganador.getByRole('button').filter({ hasText: 'Blitz' });
  await expect(tarjetaBlitz).toContainText('1 partidas');
  await expect(tarjetaBlitz).not.toContainText('sin partidas');

  // La apertura sale del PGN de la partida.
  await expect(ganador.getByText('Apertura española')).toBeVisible();

  // El balance con blancas refleja la victoria, y el historial nombra al rival.
  await expect(ganador.getByText('1 ganadas').first()).toBeVisible();
  await expect(ganador.getByText(new RegExp(`vs ${nombrePerdedor}`))).toBeVisible();

  // Y el perdedor ve su propia derrota.
  const perdedor = blancas === a ? b : a;
  await perdedor.goto('/perfil');
  await expect(perdedor.getByText(new RegExp(`vs ${nombreGanador}`))).toBeVisible();
  await expect(perdedor.getByText('1 perdidas').first()).toBeVisible();
});

test('se puede ver el perfil de otro jugador', async ({ browser }) => {
  const page = await nueva(browser);
  const usuario = await registrar(page, 'perf_otro');
  await page.goto(`/perfil/${usuario}`);
  await expect(page.getByRole('heading', { name: usuario })).toBeVisible();
  await expect(page.getByText('Hacen falta al menos dos partidas')).toBeVisible();
});
