import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOARD_THEME_INFO } from '@gambito/shared';

/**
 * Contraste AA.
 *
 * Los colores viven en `tokens.css` y se usan en toda la app vía `var(--x)`.
 * Esta prueba los lee de ahí —no de una copia— y comprueba cada combinación de
 * texto sobre fondo que la interfaz realmente pinta, en los dos temas. Sirve de
 * red: cambiar un token y romper la legibilidad falla acá, no en producción.
 *
 * Umbrales WCAG 2.1: 4,5:1 para texto normal y 3:1 para texto grande (≥24px o
 * ≥19px en negrita) y para bordes que transmiten información.
 */

const CSS = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

/** Extrae los tokens de un bloque `:root` concreto. */
function tema(selector: string): Record<string, string> {
  const inicio = CSS.indexOf(selector);
  if (inicio === -1) throw new Error(`No existe el bloque ${selector}`);
  const abre = CSS.indexOf('{', inicio);
  const cierra = CSS.indexOf('}', abre);
  const cuerpo = CSS.slice(abre + 1, cierra);

  const tokens: Record<string, string> = {};
  for (const linea of cuerpo.split('\n')) {
    const match = /^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/.exec(linea);
    if (match) tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

const OSCURO = tema(':root {');
// El tema claro redefine sólo algunos: lo que no toca lo hereda del oscuro.
const CLARO = { ...OSCURO, ...tema(":root[data-theme='light']") };

function canal(valor: number): number {
  const s = valor / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const limpio = hex.replace('#', '');
  const largo = limpio.length === 3 ? 1 : 2;
  const leer = (i: number) => {
    const trozo = limpio.slice(i * largo, i * largo + largo);
    return parseInt(largo === 1 ? trozo + trozo : trozo, 16);
  };
  return 0.2126 * canal(leer(0)) + 0.7152 * canal(leer(1)) + 0.0722 * canal(leer(2));
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** [texto, fondo, mínimo exigido, dónde se usa] */
const COMBINACIONES: Array<[string, string, number, string]> = [
  ['--text-primary', '--bg-base', 4.5, 'texto de página'],
  ['--text-primary', '--bg-surface', 4.5, 'texto en cabecera y paneles'],
  ['--text-primary', '--bg-elevated', 4.5, 'texto en cards'],
  ['--text-muted', '--bg-base', 4.5, 'texto secundario de página'],
  ['--text-muted', '--bg-surface', 4.5, 'texto secundario en paneles'],
  ['--text-muted', '--bg-elevated', 4.5, 'texto secundario en cards'],
  ['--accent-ink', '--accent', 4.5, 'texto del botón primario'],
  ['--accent-text', '--accent-wash', 4.5, 'badge de rating'],
  ['--cool', '--cool-wash', 4.5, 'avisos informativos'],
  ['--danger', '--danger-wash', 4.5, 'mensajes de error'],
  ['--danger', '--bg-surface', 4.5, 'estado suspendido en moderación'],
  ['--success', '--bg-elevated', 3, 'racha y victorias (texto grande)'],
  ['--accent-text', '--bg-base', 3, 'rating y titulares en ámbar (texto grande)'],
  ['--accent-text', '--bg-elevated', 3, 'cifras destacadas en cards'],
  ['--accent-text', '--bg-surface', 3, 'ámbar en cabecera y paneles'],
  // WCAG 1.4.11: el contorno que identifica un input o un botón secundario es
  // información, no adorno, y le corresponde 3:1 contra lo que lo rodea.
  ['--border-strong', '--bg-base', 3, 'borde de input sobre la página'],
  ['--border-strong', '--bg-surface', 3, 'borde de input dentro de un panel'],
  ['--border-strong', '--bg-elevated', 3, 'borde del botón secundario'],
];

describe.each([
  ['oscuro', OSCURO],
  ['claro', CLARO],
])('tema %s', (_nombre, tokens) => {
  it.each(COMBINACIONES)('%s sobre %s cumple AA (%d:1) — %s', (texto, fondo, minimo, _uso) => {
    const frente = tokens[texto];
    const atras = tokens[fondo];
    expect(frente, `falta ${texto}`).toBeDefined();
    expect(atras, `falta ${fondo}`).toBeDefined();

    const ratio = contraste(frente!, atras!);
    expect(
      Number(ratio.toFixed(2)),
      `${texto} (${frente}) sobre ${fondo} (${atras}) da ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(minimo);
  });
});

describe('tablero', () => {
  /**
   * Antes esto medía las piezas contra la casilla. Ya no tiene sentido: las
   * piezas son archivos SVG de terceros y traen sus propios colores, así que
   * `--piece-white` y `--piece-black` no las pintan.
   *
   * Lo que sí sigue estando en nuestras manos, y es lo que hay que cuidar, es
   * que las dos casillas de cada tema se distingan entre sí. Si el tema tiene
   * poco contraste no hay juego de piezas que lo salve: el tablero se lee mal
   * igual.
   */
  it.each(BOARD_THEME_INFO.map((t) => [t.label, t.colores.light, t.colores.dark] as const))(
    'en el tema %s se distinguen la casilla clara y la oscura',
    (_label, claro, oscuro) => {
      const ratio = contraste(claro, oscuro);
      expect(Number(ratio.toFixed(2)), `${claro} contra ${oscuro}`).toBeGreaterThanOrEqual(1.8);
    },
  );
});
