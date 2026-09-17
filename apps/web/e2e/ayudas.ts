import { type Page } from '@playwright/test';

/** Gestos compartidos por las pruebas de partida, sociales y de torneos. */

/** Pregunta al servidor de qué color juega esta pestaña. */
export async function colorDe(page: Page, gameId: string): Promise<'white' | 'black'> {
  return page.evaluate(async (id) => {
    const [yo, partida] = await Promise.all([
      fetch('/api/auth/me').then((r) => r.json()),
      fetch(`/api/games/${id}`).then((r) => r.json()),
    ]);
    return partida.game.white.id === yo.user.id ? 'white' : 'black';
  }, gameId);
}

export async function mover(page: Page, desde: string, hasta: string): Promise<void> {
  await page.getByRole('gridcell', { name: new RegExp(`^${desde},`) }).click();
  await page.getByRole('gridcell', { name: new RegExp(`^${hasta},`) }).click();
}
