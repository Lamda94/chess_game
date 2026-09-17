import type { Emparejamiento, Participante, RondaEmparejada } from './tipos.js';

/**
 * Emparejamiento suizo.
 *
 * El sistema holandés completo tiene decenas de reglas de desempate y de
 * transposición; esto implementa su núcleo, que es lo que gobierna el resultado
 * en un torneo de club: se ordena por puntaje, dentro de cada grupo se parte en
 * dos mitades y se enfrenta la primera con la segunda, nunca se repite un
 * cruce, y se equilibran los colores. Cuando un grupo no se puede emparejar sin
 * repetir, se baja un jugador al grupo siguiente — el "flotante" — en vez de
 * abandonar y permitir una revancha.
 *
 * Las reglas que no están son las que sólo cambian el orden de los tableros, no
 * quién juega contra quién.
 */

/** Cuánto vale un color para el equilibrio: positivo = jugó de más con blancas. */
function balanceDeColor(jugador: Participante): number {
  return jugador.colores.reduce((suma, color) => suma + (color === 'white' ? 1 : -1), 0);
}

/** Los dos últimos colores iguales obligan a alternar. */
function debeAlternar(jugador: Participante): 'white' | 'black' | null {
  const ultimos = jugador.colores.slice(-2);
  if (ultimos.length === 2 && ultimos[0] === ultimos[1]) {
    return ultimos[0] === 'white' ? 'black' : 'white';
  }
  return null;
}

/**
 * Decide los colores de un cruce. Primero manda la obligación de alternar; si
 * ninguno está obligado, lleva blancas quien más las necesita por balance; si
 * empatan, el de mejor puntaje y después el de mejor rating.
 */
export function asignarColores(a: Participante, b: Participante): Emparejamiento {
  const par = (blancas: Participante, negras: Participante): Emparejamiento => ({
    tablero: 0,
    whiteId: blancas.userId,
    blackId: negras.userId,
  });

  const obligadoA = debeAlternar(a);
  const obligadoB = debeAlternar(b);

  if (obligadoA === 'white' && obligadoB !== 'white') return par(a, b);
  if (obligadoA === 'black' && obligadoB !== 'black') return par(b, a);
  if (obligadoB === 'white' && obligadoA !== 'white') return par(b, a);
  if (obligadoB === 'black' && obligadoA !== 'black') return par(a, b);

  const balanceA = balanceDeColor(a);
  const balanceB = balanceDeColor(b);
  // Lleva blancas quien menos las jugó.
  if (balanceA !== balanceB) return balanceA < balanceB ? par(a, b) : par(b, a);

  // Mismo balance: los dos prefieren lo mismo y alguien se va a quedar con las
  // ganas. La regla FIDE se la concede al mejor clasificado, y no al revés:
  // hacerlo al revés era lo que producía tres colores seguidos en la punta de
  // la tabla, porque el puntero acumulaba blancas ronda tras ronda.
  const mejor =
    a.puntos !== b.puntos ? (a.puntos > b.puntos ? a : b) : a.rating >= b.rating ? a : b;
  const otro = mejor === a ? b : a;

  // Sin preferencia (balance cero), las blancas van al mejor clasificado.
  if (balanceA === 0) return par(mejor, otro);
  // Con preferencia, el mejor clasificado recibe el color que le falta.
  return balanceA > 0 ? par(otro, mejor) : par(mejor, otro);
}

function yaSeEnfrentaron(a: Participante, b: Participante): boolean {
  return a.rivales.includes(b.userId);
}

/** Lo malo que es terminar con esta diferencia de colores. */
function penalizacion(balance: number): number {
  const diferencia = Math.abs(balance);
  if (diferencia <= 1) return 0;
  if (diferencia === 2) return 3;
  // La FIDE fija en dos la diferencia máxima admisible: pasarse es una falta,
  // no una molestia, y por eso pesa un orden de magnitud más.
  return 60;
}

/**
 * Cuánto molesta un cruce por el lado de los colores.
 *
 * Se miran las dos repartijas posibles y se toma la mejor: lo que importa no es
 * quién prefiere qué, sino con qué diferencia de colores terminan los dos. Así
 * la búsqueda evita sola los cruces que dejarían a alguien con tres negras de
 * diferencia, que es lo que le pasaba al último de la tabla ronda tras ronda.
 */
function costeDeColor(a: Participante, b: Participante): number {
  const balanceA = balanceDeColor(a);
  const balanceB = balanceDeColor(b);

  const conAEnBlancas = penalizacion(balanceA + 1) + penalizacion(balanceB - 1);
  const conBEnBlancas = penalizacion(balanceA - 1) + penalizacion(balanceB + 1);
  let coste = Math.min(conAEnBlancas, conBEnBlancas);

  // Si los dos vienen obligados a alternar hacia el mismo color, uno va a jugar
  // tres veces seguidas igual por más que la diferencia cierre.
  const obligadoA = debeAlternar(a);
  if (obligadoA !== null && obligadoA === debeAlternar(b)) coste += 100;

  return coste;
}

/** Cuántos nodos se exploran como máximo antes de quedarse con lo mejor hallado. */
const PRESUPUESTO = 200_000;

/** Cuánto penaliza enfrentar a jugadores de puntajes distintos. */
const COSTE_POR_PUNTO = 40;

/**
 * Empareja la ronda entera de una sola vez.
 *
 * La primera versión emparejaba grupo por grupo, bajando "flotantes" al grupo
 * siguiente. Eso falla: cuando el último grupo no se puede cerrar sin repetir un
 * cruce, ya no hay forma de volver atrás y arreglar los grupos anteriores, y la
 * ronda termina con revanchas. Por eso se busca sobre todos los jugadores a la
 * vez, con el puntaje como un coste fuerte en vez de como una partición rígida:
 * el resultado respeta los grupos igual, pero puede cruzar la frontera entre dos
 * cuando es la única manera de no repetir.
 *
 * No repetir es una restricción, no una preferencia: ningún candidato con
 * historial previo entra siquiera en la búsqueda.
 */
function emparejarRonda(jugadores: Participante[]): Array<[Participante, Participante]> | null {
  if (jugadores.length === 0) return [];
  if (jugadores.length % 2 !== 0) return null;

  const posicion = new Map(jugadores.map((j, i) => [j.userId, i]));
  const mitad = jugadores.length / 2;

  let mejor: Array<[Participante, Participante]> | null = null;
  let mejorCoste = Number.POSITIVE_INFINITY;
  let nodos = 0;

  const actual: Array<[Participante, Participante]> = [];
  const usados = new Set<string>();

  const coste = (a: Participante, b: Participante): number => {
    const porPuntos = Math.abs(a.puntos - b.puntos) * COSTE_POR_PUNTO;
    const distancia = Math.abs(posicion.get(b.userId)! - posicion.get(a.userId)!);
    return porPuntos + costeDeColor(a, b) + Math.abs(distancia - mitad) * 0.1;
  };

  const buscar = (acumulado: number): void => {
    if (nodos++ > PRESUPUESTO) return;
    if (acumulado >= mejorCoste) return;

    const siguiente = jugadores.find((j) => !usados.has(j.userId));
    if (!siguiente) {
      mejorCoste = acumulado;
      mejor = actual.map((par) => [par[0], par[1]] as [Participante, Participante]);
      return;
    }

    usados.add(siguiente.userId);
    const candidatos = jugadores
      .filter((j) => !usados.has(j.userId) && !yaSeEnfrentaron(siguiente, j))
      .map((j) => ({ j, coste: coste(siguiente, j) }))
      .sort((x, y) => x.coste - y.coste);

    for (const candidato of candidatos) {
      usados.add(candidato.j.userId);
      actual.push([siguiente, candidato.j]);
      buscar(acumulado + candidato.coste);
      actual.pop();
      usados.delete(candidato.j.userId);
    }
    usados.delete(siguiente.userId);
  };

  buscar(0);
  return mejor;
}

/** Agrupa por puntaje, de mayor a menor. */
function porPuntaje(jugadores: Participante[]): Participante[][] {
  const grupos = new Map<number, Participante[]>();
  for (const jugador of jugadores) {
    const grupo = grupos.get(jugador.puntos) ?? [];
    grupo.push(jugador);
    grupos.set(jugador.puntos, grupo);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, grupo]) => grupo.sort((x, y) => y.rating - x.rating));
}

/**
 * Elige quién descansa: el de menor puntaje que todavía no haya tenido bye. Si
 * todos tuvieron, el de menor puntaje. El bye vale un punto entero, como en la
 * reglamentación FIDE para el jugador que queda sin rival.
 */
function elegirBye(jugadores: Participante[]): Participante {
  const candidatos = jugadores.filter((j) => !j.tuvoBye);
  const lista = candidatos.length > 0 ? candidatos : jugadores;
  return [...lista].sort((a, b) => a.puntos - b.puntos || a.rating - b.rating)[0]!;
}

export function emparejarRondaSuiza(participantes: Participante[]): RondaEmparejada {
  const activos = participantes.filter((j) => !j.retirado);
  if (activos.length < 2) return { emparejamientos: [], bye: null };

  let bye: string | null = null;
  let aEmparejar = activos;

  if (activos.length % 2 !== 0) {
    const descansa = elegirBye(activos);
    bye = descansa.userId;
    aEmparejar = activos.filter((j) => j.userId !== descansa.userId);
  }

  // Orden canónico: por puntaje y, dentro del puntaje, por rating.
  const ordenados = [...aEmparejar].sort((a, b) => b.puntos - a.puntos || b.rating - a.rating);

  let cruces = emparejarRonda(ordenados);

  if (cruces === null) {
    // No existe ninguna combinación sin repetir: pasa en torneos con muchas
    // rondas y pocos jugadores, donde ya se enfrentaron todos contra todos.
    // Antes que dejar la ronda sin jugar, se empareja por cercanía de puntaje
    // aceptando la revancha.
    cruces = [];
    for (let i = 0; i + 1 < ordenados.length; i += 2) {
      cruces.push([ordenados[i]!, ordenados[i + 1]!]);
    }
  }

  const emparejamientos = cruces.map(([a, b], indice) => ({
    ...asignarColores(a, b),
    tablero: indice + 1,
  }));

  return { emparejamientos, bye };
}
