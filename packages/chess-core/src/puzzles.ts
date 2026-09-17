/**
 * Set de puzzles del entrenador de táctica.
 *
 * Todos son mates forzados, y eso no es una casualidad: un mate se puede verificar
 * por búsqueda exhaustiva con las mismas reglas del juego, sin depender de un motor
 * ni del criterio de nadie. La suite recorre este archivo y comprueba que cada
 * posición sea jugable y que sea mate en la cantidad de jugadas declarada; una
 * posición mal escrita se cae en las pruebas y no delante de quien practica.
 *
 * Para traer volumen hay un importador del set público de lichess en
 * `apps/api/scripts/importar-puzzles.ts`, que acepta temas más allá del mate.
 */

export const TEMAS = ['pasillo', 'ahogado', 'escalera', 'apertura', 'red-de-mate'] as const;
export type Tema = (typeof TEMAS)[number];

export const TEMA_LABEL: Record<Tema, string> = {
  pasillo: 'Mate del pasillo',
  ahogado: 'Mate ahogado',
  escalera: 'Escalera',
  apertura: 'Trampa de apertura',
  'red-de-mate': 'Red de mate',
};

export interface Puzzle {
  id: string;
  fen: string;
  /** En cuántas jugadas propias se da mate. */
  mateEn: 1 | 2;
  tema: Tema;
  /** Dificultad aproximada, para ordenar la práctica. */
  rating: number;
  /** Se muestra sólo si la persona la pide. */
  pista: string;
}

export const PUZZLES: readonly Puzzle[] = [
  {
    id: 'pasillo-torre',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    mateEn: 1,
    tema: 'pasillo',
    rating: 900,
    pista: 'Los propios peones le tapan la salida al rey.',
  },
  {
    id: 'pasillo-dama',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1',
    mateEn: 1,
    tema: 'pasillo',
    rating: 950,
    pista: 'La última fila está vacía de un lado al otro.',
  },
  {
    id: 'pasillo-dos-torres',
    fen: '6k1/5ppp/8/8/8/8/8/RR4K1 w - - 0 1',
    mateEn: 1,
    tema: 'pasillo',
    rating: 900,
    pista: 'Cualquiera de las dos torres sirve.',
  },
  {
    id: 'pasillo-dama-torre',
    fen: '6k1/5ppp/8/8/8/8/8/3QR1K1 w - - 0 1',
    mateEn: 1,
    tema: 'pasillo',
    rating: 950,
    pista: 'Hay dos piezas que llegan a la octava fila.',
  },
  {
    id: 'pasillo-dama-caballo',
    fen: '6k1/5ppp/8/8/8/8/8/3QN1K1 w - - 0 1',
    mateEn: 1,
    tema: 'pasillo',
    rating: 1000,
    pista: 'El caballo no llega; la dama sí.',
  },
  {
    id: 'ahogado-caballo',
    fen: '6rk/6pp/7N/8/8/8/8/6K1 w - - 0 1',
    mateEn: 1,
    tema: 'ahogado',
    rating: 1300,
    pista: 'El rey está rodeado de piezas propias. Buscá la casilla que le queda cubierta.',
  },
  {
    id: 'dama-esquina',
    fen: 'k7/2Q5/1K6/8/8/8/8/8 w - - 0 1',
    mateEn: 1,
    tema: 'red-de-mate',
    rating: 1000,
    pista: 'Tu rey ya cubre las casillas de escape; acercá la dama.',
  },
  {
    id: 'dama-ultima-fila',
    fen: '7k/8/6K1/8/8/8/8/1Q6 w - - 0 1',
    mateEn: 1,
    tema: 'red-de-mate',
    rating: 950,
    pista: 'El rey blanco ya hace la mitad del trabajo.',
  },
  {
    id: 'escalera-torres',
    fen: '7k/R7/8/8/8/8/8/1R5K w - - 0 1',
    mateEn: 1,
    tema: 'escalera',
    rating: 1000,
    pista: 'Una torre corta la séptima fila. La otra tiene que llegar a la octava.',
  },
  {
    id: 'mate-del-pastor',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    mateEn: 1,
    tema: 'apertura',
    rating: 800,
    pista: 'f7 es la casilla más débil de la posición inicial: sólo la defiende el rey.',
  },
  {
    id: 'escalera-en-dos',
    fen: '7k/8/8/8/8/8/8/RR5K w - - 0 1',
    mateEn: 2,
    tema: 'escalera',
    rating: 1200,
    pista: 'Primero cortale una fila con una torre; la otra da el mate.',
  },
  {
    id: 'escalera-en-dos-bis',
    fen: '7k/8/8/8/8/8/8/1RR4K w - - 0 1',
    mateEn: 2,
    tema: 'escalera',
    rating: 1200,
    pista: 'La misma idea de la escalera, con las torres en otras columnas.',
  },
  {
    id: 'dama-y-rey-en-dos',
    fen: '6k1/8/5K2/8/8/8/8/3Q4 w - - 0 1',
    mateEn: 2,
    tema: 'red-de-mate',
    rating: 1250,
    pista: 'La dama sola no alcanza: usá al rey para quitarle casillas.',
  },
  {
    id: 'dama-y-rey-borde',
    fen: '7k/8/5K2/8/8/8/8/3Q4 w - - 0 1',
    mateEn: 2,
    tema: 'red-de-mate',
    rating: 1250,
    pista: 'El rey ya está en el borde. Acercá la dama sin ahogarlo.',
  },
  {
    id: 'torre-y-rey-en-dos',
    fen: '6k1/8/5K2/8/8/8/8/7R w - - 0 1',
    mateEn: 2,
    tema: 'escalera',
    rating: 1300,
    pista: 'Con torre y rey el mate llega empujando al rival contra el borde.',
  },
];

export function puzzlesPorTema(tema: Tema): Puzzle[] {
  return PUZZLES.filter((p) => p.tema === tema);
}

/** Puzzles ordenados por cercanía al rating de quien practica. */
export function puzzlesParaRating(rating: number, cantidad = 10): Puzzle[] {
  return [...PUZZLES]
    .sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating))
    .slice(0, cantidad);
}
