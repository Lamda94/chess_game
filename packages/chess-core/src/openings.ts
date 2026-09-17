/**
 * Libro de aperturas reducido: las líneas que de verdad aparecen en partidas de
 * club, con su código ECO. No pretende ser exhaustivo — una base ECO completa son
 * decenas de miles de líneas — sino alcanzar para decirle a alguien qué juega.
 *
 * El reconocimiento toma el prefijo más largo que coincida, así "1.e4 c5 2.Cf3 d6"
 * se reporta como Siciliana Najdorf y no simplemente como Siciliana.
 */
export interface Opening {
  eco: string;
  name: string;
  /** Jugadas en SAN inglés, que es lo que produce chess.js. */
  moves: string[];
}

const RAW: Array<[string, string, string]> = [
  ['A00', 'Apertura irregular', 'a3'],
  ['A04', 'Apertura Réti', 'Nf3'],
  ['A10', 'Apertura inglesa', 'c4'],
  ['A40', 'Apertura de peón de dama', 'd4'],
  ['A45', 'Defensa India', 'd4 Nf6'],
  ['A80', 'Defensa Holandesa', 'd4 f5'],
  ['B00', 'Apertura de peón de rey', 'e4'],
  ['B01', 'Defensa Escandinava', 'e4 d5'],
  ['B02', 'Defensa Alekhine', 'e4 Nf6'],
  ['B06', 'Defensa Moderna', 'e4 g6'],
  ['B07', 'Defensa Pirc', 'e4 d6'],
  ['B10', 'Defensa Caro-Kann', 'e4 c6'],
  ['B12', 'Caro-Kann, avance', 'e4 c6 d4 d5 e5'],
  ['B20', 'Defensa Siciliana', 'e4 c5'],
  ['B21', 'Siciliana, gambito Smith-Morra', 'e4 c5 d4'],
  ['B22', 'Siciliana, variante Alapin', 'e4 c5 c3'],
  ['B23', 'Siciliana cerrada', 'e4 c5 Nc3'],
  ['B27', 'Siciliana, variante Hyperacelerada', 'e4 c5 Nf3 g6'],
  ['B30', 'Siciliana, variante Rossolimo', 'e4 c5 Nf3 Nc6'],
  ['B40', 'Siciliana, variante Kan', 'e4 c5 Nf3 e6'],
  ['B50', 'Siciliana, línea abierta', 'e4 c5 Nf3 d6'],
  ['B70', 'Siciliana Dragón', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['B76', 'Dragón, ataque Yugoslavo', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3'],
  ['B90', 'Siciliana Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['C00', 'Defensa Francesa', 'e4 e6'],
  ['C02', 'Francesa, variante del avance', 'e4 e6 d4 d5 e5'],
  ['C10', 'Francesa, variante Paulsen', 'e4 e6 d4 d5 Nc3'],
  ['C20', 'Apertura de peón de rey', 'e4 e5'],
  ['C21', 'Gambito de centro', 'e4 e5 d4'],
  ['C23', 'Apertura de alfil', 'e4 e5 Bc4'],
  ['C25', 'Partida vienesa', 'e4 e5 Nc3'],
  ['C30', 'Gambito de rey', 'e4 e5 f4'],
  ['C40', 'Defensa Petrov', 'e4 e5 Nf3 Nf6'],
  ['C41', 'Defensa Philidor', 'e4 e5 Nf3 d6'],
  ['C44', 'Apertura escocesa', 'e4 e5 Nf3 Nc6 d4'],
  ['C45', 'Escocesa', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
  ['C46', 'Apertura de los tres caballos', 'e4 e5 Nf3 Nc6 Nc3'],
  ['C50', 'Apertura italiana', 'e4 e5 Nf3 Nc6 Bc4'],
  ['C50', 'Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['C55', 'Defensa de los dos caballos', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['C60', 'Apertura española', 'e4 e5 Nf3 Nc6 Bb5'],
  ['C65', 'Española, defensa Berlinesa', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['C68', 'Española, variante del cambio', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
  ['C70', 'Española, línea Morphy', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4'],
  ['C84', 'Española cerrada', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'],
  ['D00', 'Peón de dama, sistema Londres', 'd4 d5 Bf4'],
  ['D02', 'Peón de dama, sistema Londres', 'd4 d5 Nf3 Nf6 Bf4'],
  ['D06', 'Gambito de dama', 'd4 d5 c4'],
  ['D10', 'Defensa Eslava', 'd4 d5 c4 c6'],
  ['D20', 'Gambito de dama aceptado', 'd4 d5 c4 dxc4'],
  ['D30', 'Gambito de dama declinado', 'd4 d5 c4 e6'],
  ['D43', 'Defensa semieslava', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
  ['D70', 'Defensa Grünfeld', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['E00', 'Peón de dama, India', 'd4 Nf6 c4'],
  ['E12', 'Defensa India de dama', 'd4 Nf6 c4 e6 Nf3 b6'],
  ['E20', 'Defensa Nimzoindia', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ['E60', 'Defensa India de rey', 'd4 Nf6 c4 g6'],
  ['E90', 'India de rey, sistema clásico', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3'],
];

export const OPENINGS: readonly Opening[] = RAW.map(([eco, name, moves]) => ({
  eco,
  name,
  moves: moves.split(' '),
})).sort((a, b) => b.moves.length - a.moves.length);

/**
 * Identifica la apertura de una partida a partir de sus jugadas en SAN.
 * Devuelve `null` cuando ni la primera jugada está en el libro.
 */
export function identifyOpening(sanMoves: string[]): Opening | null {
  // OPENINGS ya está ordenado de la línea más larga a la más corta, así que la
  // primera que encaje es también la más específica.
  for (const opening of OPENINGS) {
    if (opening.moves.length > sanMoves.length) continue;
    if (opening.moves.every((move, index) => move === sanMoves[index])) {
      return opening;
    }
  }
  return null;
}

/** Extrae las jugadas en SAN de un PGN, ignorando cabeceras y comentarios. */
export function sanMovesFromPgn(pgn: string): string[] {
  const body = pgn
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\$\d+/g, '');
  return body
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        !/^\d+\.*$/.test(token) &&
        !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token),
    )
    .map((token) => token.replace(/^\d+\.+/, ''))
    .filter((token) => token.length > 0);
}
