/**
 * Glicko-2, de Mark Glickman (glicko.net/glicko/glicko2.pdf).
 *
 * El sistema está definido para "períodos de calificación" con varias partidas.
 * Acá se aplica partida por partida, que es lo que hacen los servidores de ajedrez
 * en vivo: el rating tiene que moverse apenas termina la partida, no al día
 * siguiente. La consecuencia conocida es que la desviación baja un poco más rápido
 * que en el modelo original.
 */

/** Factor de conversión entre la escala Glicko (1500/350) y la interna. */
const SCALE = 173.7178;
const CENTER = 1500;

/**
 * Constante del sistema: cuánto puede moverse la volatilidad entre partidas.
 * Valores chicos (0.3) frenan los saltos; grandes (1.2) los permiten. 0.5 es el
 * que recomienda Glickman para ajedrez.
 */
export const TAU = 0.5;

/** Precisión del método iterativo que resuelve la volatilidad. */
const EPSILON = 0.000001;

/** Techo de desviación: sin él, una cuenta inactiva volvería a ser impredecible. */
export const MAX_RD = 350;
/** Piso de desviación: aun un jugador muy medido conserva incertidumbre. */
export const MIN_RD = 30;

export interface Rating {
  rating: number;
  /** Desviación: cuánta incertidumbre hay sobre ese rating. */
  rd: number;
  volatility: number;
}

/** Resultado desde el punto de vista del jugador que se está actualizando. */
export type Score = 0 | 0.5 | 1;

export const INITIAL: Rating = { rating: CENTER, rd: MAX_RD, volatility: 0.06 };

function toGlicko2(rating: Rating): { mu: number; phi: number; sigma: number } {
  return {
    mu: (rating.rating - CENTER) / SCALE,
    phi: rating.rd / SCALE,
    sigma: rating.volatility,
  };
}

/** g(φ): cuánto pesa el resultado según lo medido que esté el rival. */
function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** E: probabilidad esperada de ganar. */
function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * Resuelve la nueva volatilidad por el método de Illinois, tal como lo describe
 * el paso 5 del artículo. Es el único tramo iterativo del algoritmo.
 */
function newVolatility(phi: number, sigma: number, v: number, delta: number, tau: number): number {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  const f = (x: number): number => {
    const ex = Math.exp(x);
    const numerator = ex * (delta2 - phi2 - v - ex);
    const denominator = 2 * Math.pow(phi2 + v + ex, 2);
    return numerator / denominator - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > EPSILON && guard++ < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

function clampRd(rd: number): number {
  return Math.min(MAX_RD, Math.max(MIN_RD, rd));
}

/**
 * Actualiza el rating de un jugador tras una tanda de partidas. Para una sola
 * partida se pasa un único rival.
 */
export function update(
  player: Rating,
  results: Array<{ opponent: Rating; score: Score }>,
): Rating {
  if (results.length === 0) return decay(player);

  const { mu, phi, sigma } = toGlicko2(player);

  let varianceInverse = 0;
  let deltaSum = 0;
  for (const { opponent, score } of results) {
    const o = toGlicko2(opponent);
    const gj = g(o.phi);
    const e = expectedScore(mu, o.mu, o.phi);
    varianceInverse += gj * gj * e * (1 - e);
    deltaSum += gj * (score - e);
  }

  const v = 1 / varianceInverse;
  const delta = v * deltaSum;

  const sigmaPrime = newVolatility(phi, sigma, v, delta, TAU);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + varianceInverse);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: muPrime * SCALE + CENTER,
    rd: clampRd(phiPrime * SCALE),
    volatility: sigmaPrime,
  };
}

/**
 * Un período sin jugar sólo ensancha la desviación: el rating no se mueve, pero
 * el sistema admite que sabe menos del jugador que antes.
 */
export function decay(player: Rating): Rating {
  const { phi, sigma } = toGlicko2(player);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  return { ...player, rd: clampRd(phiStar * SCALE) };
}

export interface MatchOutcome {
  white: Rating;
  black: Rating;
}

/**
 * Aplica una partida a los dos jugadores a la vez. Es importante calcular ambos
 * contra los ratings *previos* del otro: si se actualizara uno primero, el
 * segundo jugaría contra un rival que ya cambió y el resultado no sería simétrico.
 */
export function applyGame(
  white: Rating,
  black: Rating,
  result: 'WHITE' | 'BLACK' | 'DRAW',
): MatchOutcome {
  const whiteScore: Score = result === 'DRAW' ? 0.5 : result === 'WHITE' ? 1 : 0;
  const blackScore: Score = result === 'DRAW' ? 0.5 : result === 'BLACK' ? 1 : 0;
  return {
    white: update(white, [{ opponent: black, score: whiteScore }]),
    black: update(black, [{ opponent: white, score: blackScore }]),
  };
}

/** El rating que se muestra: entero, porque medio punto no le dice nada a nadie. */
export function displayRating(rating: Rating): number {
  return Math.round(rating.rating);
}
