/** Punto de partida de todo rating nuevo y umbral de calibración. */
export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOLATILITY = 0.06;
export const PROVISIONAL_GAMES = 10;

export function isProvisional(gamesPlayed: number): boolean {
  return gamesPlayed < PROVISIONAL_GAMES;
}
