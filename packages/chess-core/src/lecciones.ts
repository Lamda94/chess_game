import type { Color } from '@gambito/shared';

/**
 * Contenido del salón de entrenamiento.
 *
 * Las lecciones son datos tipados y no prosa en MDX: cada paso necesita una
 * posición y una jugada esperada, que son cosas que hay que poder *verificar*.
 * Una prueba recorre todo este archivo y comprueba que cada FEN sea legal y que
 * cada jugada esperada exista de verdad en su posición, así una lección rota se
 * cae en la suite y no delante de quien está aprendiendo.
 */

export const RUTAS = ['reglas', 'aperturas', 'tactica', 'finales', 'estrategia'] as const;
export type RutaId = (typeof RUTAS)[number];

export const RUTA_INFO: Record<RutaId, { nombre: string; descripcion: string; orden: number }> = {
  reglas: {
    nombre: 'Reglas del juego',
    descripcion: 'Cómo se mueve cada pieza y las tres reglas que sorprenden a todo el mundo.',
    orden: 1,
  },
  aperturas: {
    nombre: 'Aperturas',
    descripcion: 'Qué hacer en las primeras diez jugadas y por qué.',
    orden: 2,
  },
  tactica: {
    nombre: 'Táctica',
    descripcion: 'Los motivos que ganan material: clavadas, horquillas y ataques dobles.',
    orden: 3,
  },
  finales: {
    nombre: 'Finales',
    descripcion: 'Dar mate con poco material y saber cuándo un peón corona.',
    orden: 4,
  },
  estrategia: {
    nombre: 'Estrategia',
    descripcion: 'Planes de largo plazo: columnas, casillas débiles y piezas malas.',
    orden: 5,
  },
};

export interface PasoLeccion {
  /** Posición del paso. */
  fen: string;
  /** Explicación que se lee antes de mover. */
  texto: string;
  /**
   * Jugada que se espera, en UCI. Si falta, el paso es sólo ilustrativo y se
   * avanza con el botón.
   */
  esperada?: string;
  /** Qué decir si se equivoca. */
  pista?: string;
  /** Desde qué lado se mira el tablero. */
  orientacion?: Color;
}

export interface Leccion {
  slug: string;
  ruta: RutaId;
  titulo: string;
  resumen: string;
  pasos: PasoLeccion[];
}

export const LECCIONES: readonly Leccion[] = [
  /* ---------------------------------------------------------------- */
  /* Reglas                                                            */
  /* ---------------------------------------------------------------- */
  {
    slug: 'como-se-mueven',
    ruta: 'reglas',
    titulo: 'Cómo se mueve cada pieza',
    resumen: 'Torre, alfil y caballo, con el tablero vacío para ver bien el alcance de cada una.',
    pasos: [
      {
        fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1',
        texto:
          'La torre se mueve en línea recta, tantas casillas como quiera, por su fila o por su columna. Llevala a d8 y fijate que da jaque desde el otro extremo del tablero.',
        esperada: 'd4d8',
        pista: 'Subí por la columna d hasta la última fila.',
      },
      {
        fen: '7k/8/8/8/3B4/8/8/K7 w - - 0 1',
        texto:
          'El alfil va por las diagonales y nunca cambia de color de casilla: el que empieza en casilla clara morirá en casilla clara. Movelo a a7.',
        esperada: 'd4a7',
        pista: 'Seguí la diagonal hacia arriba y a la izquierda: c5, b6, a7.',
      },
      {
        fen: '7k/8/8/8/3N4/8/8/K7 w - - 0 1',
        texto:
          'El caballo salta en L: dos casillas en una dirección y una en perpendicular. Es la única pieza que atraviesa a las demás. Llevalo a f5.',
        esperada: 'd4f5',
        pista: 'Dos a la derecha y una hacia arriba.',
      },
    ],
  },
  {
    slug: 'enroque',
    ruta: 'reglas',
    titulo: 'El enroque',
    resumen: 'La única jugada que mueve dos piezas a la vez, y para qué sirve.',
    pasos: [
      {
        fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1',
        texto:
          'El enroque mueve el rey dos casillas hacia una torre y salta la torre al otro lado. Pone al rey a resguardo y activa la torre de una sola vez. Enrocá corto: el rey a g1.',
        esperada: 'e1g1',
        pista: 'Movés el rey desde e1 hasta g1; la torre de h1 salta sola a f1.',
      },
      {
        fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/2KR3R b kq - 2 2',
        texto:
          'Las negras también pueden enrocar, y también del lado largo. Probá el enroque corto de las negras: el rey a g8.',
        esperada: 'e8g8',
        pista: 'Mismo movimiento, del otro lado del tablero.',
        orientacion: 'black',
      },
    ],
  },
  {
    slug: 'al-paso-y-coronacion',
    ruta: 'reglas',
    titulo: 'Al paso y coronación',
    resumen: 'Las dos reglas del peón que nadie adivina la primera vez.',
    pasos: [
      {
        fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
        texto:
          'Las negras acaban de adelantar el peón de f dos casillas, pasando al lado de tu peón de e5. La captura al paso te deja tomarlo como si hubiera avanzado una sola. Sólo se puede en la jugada inmediata: si no la hacés ahora, se pierde para siempre.',
        esperada: 'e5f6',
        pista: 'Tu peón de e5 captura en diagonal hacia f6, aunque ahí no haya nada.',
      },
      {
        fen: '8/P6k/8/8/8/8/6K1/8 w - - 0 1',
        texto:
          'Un peón que llega a la última fila no se queda ahí: se convierte en la pieza que quieras, menos rey. Casi siempre conviene la dama. Coroná en a8.',
        esperada: 'a7a8q',
        pista: 'Avanzá el peón a a8 y elegí dama en el selector.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* Aperturas                                                         */
  /* ---------------------------------------------------------------- */
  {
    slug: 'principios-de-apertura',
    ruta: 'aperturas',
    titulo: 'Los tres principios',
    resumen: 'Ocupar el centro, sacar las piezas y poner el rey a salvo. En ese orden.',
    pasos: [
      {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        texto:
          'Primero, el centro. Un peón en e4 se adueña de d5 y f5, y de paso abre la diagonal del alfil y la de la dama. Jugá e4.',
        esperada: 'e2e4',
        pista: 'Adelantá el peón de rey dos casillas.',
      },
      {
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        texto:
          'Segundo, desarrollar. Los caballos antes que los alfiles, y hacia el centro: un caballo en f3 vigila e5 y d4. Jugá Cf3.',
        esperada: 'g1f3',
        pista: 'El caballo de g1 salta a f3.',
      },
      {
        fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        texto:
          'Tercero, el rey a resguardo. Con dos piezas afuera ya podés enrocar y conectar las torres. Enrocá corto.',
        esperada: 'e1g1',
        pista: 'El rey de e1 a g1.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* Táctica                                                           */
  /* ---------------------------------------------------------------- */
  {
    slug: 'la-clavada',
    ruta: 'tactica',
    titulo: 'La clavada',
    resumen: 'Una pieza que no se puede mover es una pieza que dejó de defender.',
    pasos: [
      {
        fen: 'rnbqk2r/ppp1bppp/4pn2/3p2B1/3PP3/2N5/PPP2PPP/R2QKBNR w KQkq - 0 5',
        texto:
          'El alfil de g5 clava al caballo de f6 contra la dama de d8: si el caballo se mueve, la dama queda colgada. La regla práctica es no capturar la pieza clavada, sino atacarla otra vez. Avanzá e4 a e5.',
        esperada: 'e4e5',
        pista: 'El peón de e4 avanza y ataca al caballo, que no puede escapar.',
      },
      {
        fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
        texto:
          'Acá la clavada es al revés: el alfil de b5 clava al caballo de c6 contra el rey de e8. Esa clavada es absoluta, el caballo directamente no se puede mover. Las negras defienden con a6, echando al alfil.',
        esperada: 'a7a6',
        pista: 'Adelantá el peón de a7 para preguntarle al alfil qué quiere hacer.',
        orientacion: 'black',
      },
    ],
  },
  {
    slug: 'horquilla-de-caballo',
    ruta: 'tactica',
    titulo: 'La horquilla de caballo',
    resumen: 'El caballo ataca dos piezas a la vez y sólo una puede escapar.',
    pasos: [
      {
        fen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
        texto:
          'El caballo puede atacar dos piezas de una vez, y como salta, ninguna puede interponerse. Llevalo a c7: da jaque al rey y al mismo tiempo ataca la torre de a8.',
        esperada: 'd5c7',
        pista: 'El caballo de d5 salta a c7, dando jaque desde ahí.',
      },
    ],
  },
  {
    slug: 'ataque-doble',
    ruta: 'tactica',
    titulo: 'El ataque doble',
    resumen: 'Un jaque que además ataca otra cosa gana material solo.',
    pasos: [
      {
        fen: '4k3/8/8/8/r7/8/8/4K2Q w - - 0 1',
        texto:
          'La dama cubre líneas y diagonales, así que es la pieza que más fácil ataca dos cosas a la vez. Llevala a a8: da jaque por la octava fila y de paso ataca la torre de a4 por la columna.',
        esperada: 'h1a8',
        pista: 'Seguí la diagonal larga desde h1 hasta a8.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* Finales                                                           */
  /* ---------------------------------------------------------------- */
  {
    slug: 'mate-con-dama',
    ruta: 'finales',
    titulo: 'Mate con rey y dama',
    resumen: 'El final que hay que saber sí o sí, porque aparece en cada partida ganada.',
    pasos: [
      {
        fen: '7k/8/6K1/8/8/8/8/1Q6 w - - 0 1',
        texto:
          'El rey rival está acorralado en la esquina y tu rey ya cubre g7 y h7. Sólo falta la dama: llevala a la octava fila. Jugá Db8.',
        esperada: 'b1b8',
        pista: 'La dama va por la columna b hasta b8 y da mate a lo largo de la fila.',
      },
    ],
  },
  {
    slug: 'regla-del-cuadrado',
    ruta: 'finales',
    titulo: 'La regla del cuadrado',
    resumen: 'Saber de un vistazo si el rey llega a frenar al peón.',
    pasos: [
      {
        fen: '8/8/8/8/7k/8/P7/K7 w - - 0 1',
        texto:
          'Imaginá un cuadrado con el peón en una esquina y la casilla de coronación en la otra. Si el rey rival no puede entrar en ese cuadrado, el peón corona. Acá el rey negro está lejísimos: adelantá el peón dos casillas.',
        esperada: 'a2a4',
        pista: 'El peón de a2 puede avanzar dos en su primera jugada.',
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  /* Estrategia                                                        */
  /* ---------------------------------------------------------------- */
  {
    slug: 'columnas-abiertas',
    ruta: 'estrategia',
    titulo: 'Columnas abiertas para las torres',
    resumen: 'Las torres no se desarrollan saliendo: se desarrollan buscando columnas sin peones.',
    pasos: [
      {
        fen: 'r4rk1/pp3ppp/2p5/8/8/2P5/PP3PPP/R4RK1 w - - 0 1',
        texto:
          'Las columnas d y e quedaron sin peones. Una torre ahí no tiene nada delante y llega sola a la posición rival. Llevá la torre de a1 a d1.',
        esperada: 'a1d1',
        pista: 'La torre de a1 corre por la primera fila hasta d1.',
      },
    ],
  },
];

export function leccionesDeRuta(ruta: RutaId): Leccion[] {
  return LECCIONES.filter((leccion) => leccion.ruta === ruta);
}

export function leccionPorSlug(slug: string): Leccion | null {
  return LECCIONES.find((leccion) => leccion.slug === slug) ?? null;
}

export const TOTAL_LECCIONES = LECCIONES.length;
