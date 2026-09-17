# Gambito

Plataforma de ajedrez competitivo. Monorepo con la API (Fastify + Socket.IO + Postgres +
Redis) y el front (React + Vite). El servidor es **autoritativo**: valida cada jugada y es
dueño del reloj; el cliente nunca decide el resultado.

Estado: **Fase 4 — torneos y social**, la última del plan. Dos personas registradas se
emparejan por rating, juegan una partida real con reloj que mueve su Glicko-2, practican
contra Stockfish en el navegador, revisan la partida jugada a jugada con el análisis del
motor, aprenden en un salón de lecciones interactivas, compiten por la tabla de posiciones,
organizan torneos suizos, arena o por eliminación, se agregan como amigos, se desafían por
enlace y miran partidas ajenas en vivo.

## Arrancar

Requiere Node 22+, pnpm 10+ y Docker.

```bash
pnpm install
pnpm services:up                      # Postgres en 5433, Redis en 6380
cp apps/api/.env.example apps/api/.env # y completar los secretos
pnpm --filter @gambito/api exec prisma migrate deploy
pnpm dev                              # API en :3000, web en :5173
```

Los secretos de sesión se generan con `openssl rand -base64 48`. Sin `JWT_SECRET` y
`COOKIE_SECRET` de al menos 32 caracteres la API no arranca, a propósito.

Abrí <http://localhost:5173>. Para probar una partida hacen falta dos cuentas: usá una
ventana normal y otra de incógnito.

### Acceso con Google (opcional)

Sin `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` la app funciona igual, sólo que no muestra
el botón. Para habilitarlo, en Google Cloud Console → *APIs y servicios* → *Credenciales*,
creá un ID de cliente OAuth de tipo *Aplicación web* con este URI de redirección:

```
http://localhost:3000/auth/google/callback
```

El flujo usa PKCE y valida el `id_token` contra las claves públicas de Google. Una cuenta
de Google se vincula a una cuenta existente **sólo** si Google confirma el correo; si no,
crea una cuenta nueva que después elige su nombre de jugador.

## Estructura

```
apps/api     Fastify 5, Socket.IO, Prisma, motor de partidas y emparejamiento
apps/web     React 19, Vite, TailwindCSS v4, tablero SVG, Stockfish en un worker
packages/shared       tipos, esquemas Zod y contratos de eventos del socket
packages/chess-core   reglas de ajedrez, libro de aperturas, búsqueda de mate,
                      contenido de las lecciones y set de puzzles
packages/rating       Glicko-2
packages/tournament   emparejamiento suizo, cuadro de eliminación, arena y desempates
packages/ui           tokens del sistema de diseño y componentes base
infra/                docker-compose de Postgres y Redis
```

Las reglas viven en **un solo lugar**: el navegador usa `chess-core` para dibujar jugadas
legales y el servidor usa el mismo paquete para decidir si una jugada vale.

## Cómo funciona el reloj

El servidor guarda, por partida, los milisegundos de cada lado y el instante en que empezó
a correr el turno actual. Al aplicar una jugada descuenta lo transcurrido y suma el
incremento. Un `setTimeout` por partida dispara la derrota por tiempo. El cliente sólo
dibuja: cuenta hacia atrás desde el último dato recibido, así un reloj de sistema
desfasado no cambia lo que se ve ni lo que vale.

Si el proceso se reinicia en mitad de una partida, el motor la rehidrata desde la base
reproduciendo las jugadas guardadas. Al arrancar, además, retoma todas las partidas que
quedaron en `ACTIVE`: sin eso una partida cuyo proceso murió se quedaría abierta para
siempre, sin reloj y colgada en «partidas en vivo».

## Rating

Glicko-2, con los parámetros del artículo original de Glickman (τ = 0.5). Se aplica partida
por partida en vez de por período de calificación, que es lo que hacen los servidores en
vivo: el rating tiene que moverse apenas termina la partida. La desviación se acota entre
30 y 350 para que ni una cuenta abandonada vuelva a ser impredecible ni un jugador muy
medido pierda toda su incertidumbre.

Las cuatro modalidades llevan rating separado. Las primeras diez partidas son provisorias y
se muestran con un signo de pregunta.

## El motor

Stockfish 19 compilado a WebAssembly, corriendo en un Web Worker. Se usa la variante
`lite-single` (1,7 MB): la multihilo necesita `SharedArrayBuffer`, que obliga a servir todo
con cabeceras COOP/COEP y rompería la carga de las fuentes. El archivo se copia desde
`node_modules` a `public/engine/` en cada build y no se versiona.

**Licencia:** Stockfish es GPLv3 y se distribuye al navegador de cada visitante. Si Gambito
se publica, esa distribución arrastra las obligaciones de la GPL sobre la obra combinada.
Es la misma situación que resolvió lichess liberando su código; conviene decidirlo antes de
abrir la plataforma.

Los niveles 1 a 8 degradan la búsqueda con `Skill Level`; del 9 al 20 usan
`UCI_LimitStrength` con un Elo objetivo, porque debajo de ~1320 el motor no promete una
fuerza concreta. El tiempo por jugada se limita siempre.

## Entrenamiento

El contenido del salón vive en `packages/chess-core/src/lecciones.ts` y los puzzles en
`puzzles.ts`, como datos tipados y no como prosa en un CMS. La razón es que cada paso
necesita una posición y una jugada esperada, y eso hay que poder **verificarlo**: la suite
recorre todo el contenido y comprueba que cada FEN sea legal y que cada jugada exista de
verdad. Una lección rota se cae en las pruebas y no delante de quien está aprendiendo.

Los puzzles son todos mates forzados, y eso tampoco es casualidad: un mate se verifica por
búsqueda exhaustiva con las mismas reglas del juego, sin depender de un motor ni del
criterio de nadie. `esMateEnN` hace esa búsqueda y se usa en dos lugares — en la suite para
comprobar que cada puzzle es lo que dice ser, y en el servidor para decidir si la jugada de
quien practica conserva el mate. Se acepta **cualquier** jugada que lo conserve, no una
respuesta en particular.

Esa misma función descarta un error sutil: `chess.js` acepta posiciones donde el bando que
acaba de mover quedó en jaque, algo imposible en el tablero, y esas posiciones producen
"mates" fantasma. `posicionJugable` las filtra.

## Verificar

```bash
pnpm turbo run typecheck test          # 291 pruebas (necesita Postgres y Redis arriba)
pnpm --filter @gambito/web exec playwright install chromium   # sólo la primera vez
pnpm --filter @gambito/web e2e         # 38 pruebas en un navegador real
```

- `packages/chess-core` (144): enroque, al paso, coronación, mate, ahogado, triple
  repetición, material insuficiente, balance de capturas, hándicap de material,
  reconocimiento de aperturas desde el PGN, y la verificación completa de las lecciones y
  de los puzzles.
- `packages/tournament` (65): rondas suizas simuladas con 7, 8, 12, 16 y 33 jugadores
  comprobando que nadie repita rival ni acumule tres colores seguidos, desempates Buchholz
  y Sonneborn-Berger, siembra del cuadro de eliminación y puntaje de racha en arena.
- `packages/rating` (12): el ejemplo publicado por Glickman con sus valores exactos,
  simetría entre ganador y perdedor, y los topes de desviación.
- `packages/ui` (38): contraste WCAG de cada combinación de texto y fondo que la interfaz
  pinta, en los dos temas, leyendo los colores del propio `tokens.css`.
- `apps/api` (32): ciclo completo con dos sockets (emparejar → mate → guardado), rechazo de
  jugada ilegal con corrección del estado, abandono, colas separadas por control de tiempo,
  recuperación de una partida que quedó activa tras un reinicio, el movimiento de rating en
  partidas clasificatorias y amistosas, el avance automático de un torneo al cerrarse la
  ronda, la moderación con sus permisos, y el circuito de correo: verificación,
  recuperación, enlaces vencidos, reusados y cruzados entre sí.
- `apps/web` (38): partida completa entre dos navegadores, Stockfish contestando de verdad,
  pistas, deshacer, hándicap, perfil con aperturas deducidas del PGN, visor de análisis
  clasificando jugadas, lecciones resueltas sobre el tablero, puzzles resueltos y fallados
  calculando la solución con las reglas del juego, el ranking, un suizo de cuatro jugadores
  jugado de punta a punta, amigos y desafíos, espectar sin poder mover, el tablero recorrido
  con el teclado, el panel de moderación y la recuperación de contraseña leyendo el enlace
  del correo. Las capturas quedan en `apps/web/e2e/recorrido/`.

Las pruebas de navegador crean varias cuentas seguidas, así que el `.env` local sube
`RATE_LIMIT_REGISTER_MAX`. Los valores por defecto del código son los de producción.

## Torneos

La lógica de emparejamiento vive en `packages/tournament`, sin tocar la base de datos ni la
red: entra una lista de participantes y sale una lista de cruces. Eso es lo que permite
simular torneos enteros en las pruebas, y fue así como aparecieron los dos errores que más
costaron — rivales repetidos y tres colores seguidos.

El suizo empareja **la ronda entera de una sola vez**, con una búsqueda con coste y vuelta
atrás. La versión anterior iba grupo por grupo bajando "flotantes" al grupo siguiente, y eso
no se puede arreglar: cuando el último grupo no cierra sin repetir un cruce, ya no hay forma
de volver sobre los grupos anteriores. Acá el puntaje es un coste fuerte y no una partición
rígida, así que la búsqueda cruza la frontera entre dos grupos sólo cuando es la única
manera de no repetir. No repetir es una restricción: un rival ya enfrentado ni siquiera
entra como candidato.

En los colores manda la regla FIDE: cuando los dos prefieren lo mismo, la preferencia se le
concede **al mejor clasificado**. Tenerlo al revés era lo que le daba tres blancas seguidas
al puntero.

## Correo: verificación y recuperación

Al darse de alta con correo sale un mensaje de confirmación, y hay recuperación de
contraseña desde `/olvide`. Los dos enlaces son tokens opacos de un solo uso: se guarda el
hash y nunca el token, emitir uno anula el anterior del mismo tipo, y consumirlo es atómico
(`updateMany` sobre `usedAt: null`), así dos clics seguidos no lo gastan dos veces. El de
confirmación vale 24 horas; el de recuperación, una.

Restablecer la contraseña **revoca todas las sesiones abiertas**. Si alguien pidió
recuperarla justamente porque se le metieron en la cuenta, dejarle la sesión al intruso no
arreglaría nada. También da el correo por verificado: llegar hasta ahí ya demuestra que la
dirección es suya.

`/auth/forgot-password` contesta lo mismo exista o no la cuenta, esté suspendida, o sea una
cuenta de sólo Google sin contraseña que restablecer. Si la respuesta variara, ese endpoint
sería un buscador de quién está registrado acá. La pantalla dice lo mismo por la misma razón.

Sin `SMTP_URL` el correo no se manda: se escribe una línea JSON por mensaje en `MAIL_OUTBOX`
(`.mail/outbox.jsonl` por defecto) y el enlace sale por consola. Eso permite levantar el
proyecto y recuperar una contraseña sin montar un servidor de correo, y es de donde leen el
enlace las pruebas — el token que abren es el que viajó en el mensaje, no uno de laboratorio.
En producción `SMTP_URL` es obligatoria y la app no arranca sin ella, porque una recuperación
que escribe en un archivo del servidor no recupera nada.

## Moderación

Hay un panel en `/moderacion` para quien tenga rol `MODERATOR` o `ADMIN`. Hace una sola
cosa, porque es lo único que se puede hacer sin un mecanismo de denuncias: buscar una cuenta
y suspenderla.

Lo que importa es que la suspensión se aplica de verdad y en el acto. Revoca los refresh
tokens, bloquea la reconexión del socket —o sea, deja de poder jugar— y marca la cuenta en
Redis por lo que dura un token de acceso, que es el hueco por el que si no seguiría navegando
quince minutos con el token que ya tenía. El rol se consulta contra la base en cada petición
al panel y no se lee del JWT: si se leyera del token, a quien le sacan el rol lo conservaría
hasta que venza.

No hay forma de ascender a alguien desde la aplicación, a propósito. El primer moderador se
marca a mano:

```sql
UPDATE "User" SET role = 'MODERATOR' WHERE "usernameLower" = 'nombre';
```

## Accesibilidad

El tablero se recorre entero con las flechas y se juega con Enter; sólo la primera casilla
entra en el orden de tabulación, para que no haya que pasar por sesenta y cuatro paradas
para salir de él.

El contraste no se revisa a ojo: `packages/ui/src/contraste.test.ts` lee los colores de
`tokens.css` y verifica cada combinación que la interfaz pinta, en los dos temas. Eso
encontró dos problemas reales. El ámbar de marca da 8,7:1 sobre el fondo oscuro pero 2,0:1
sobre el claro, así que el ámbar **de texto** pasó a un token aparte (`--accent-text`) que en
tema claro es más oscuro; `--accent` sigue siendo el vivo donde hace de fondo. Y el borde de
los inputs y de los botones secundarios daba 1,9:1 y 1,4:1, cuando la WCAG 1.4.11 pide 3:1
para el contorno que identifica un componente.

Las piezas se verifican aparte y con otro criterio: lo que recorta una dama blanca sobre una
casilla clara no es su relleno —1,26:1— sino su contorno oscuro, que da 10:1.

## Desplegar en un VPS

Todo corre en Docker: Caddy al frente, la API, Postgres y Redis. Lo único que sale a internet
es Caddy — Postgres y Redis no publican puertos y sólo se llegan por la red interna.

```bash
cp infra/.env.prod.example infra/.env.prod   # completar; no se versiona
openssl rand -base64 48                      # uno para JWT_SECRET, otro para COOKIE_SECRET

docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Antes hay que apuntar el dominio por DNS a la IP del servidor y dejar abiertos el 80 y el
443. Caddy saca el certificado solo y lo renueva; no hay que tocar nada de TLS.

**Por qué hay un proxy delante.** El front habla siempre con su propio origen: pide `/api/…`
y abre el socket contra el mismo dominio. Así las cookies de sesión son de primera parte y el
navegador no necesita ninguna excepción de CORS. Eso, que en desarrollo resuelve el proxy de
Vite, en producción lo resuelve Caddy: sirve los archivos estáticos, manda `/api/*` al
backend quitándole el prefijo, y `/socket.io/*` tal cual, con el upgrade a WebSocket.

Las migraciones corren al arrancar el contenedor, antes de levantar el servidor. Con una sola
instancia es lo correcto y lo más simple; si alguna vez hay réplicas hay que sacarlo de ahí,
porque dos arrancando a la vez intentarían migrar en paralelo. En ese caso va como paso de
release aparte con `pnpm --filter @gambito/api prisma:deploy`.

Para actualizar:

```bash
git pull
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Si usás Google OAuth, el redirect URI autorizado en la consola de Google tiene que ser
exactamente `https://TU_DOMINIO/api/auth/google/callback` — entra por el dominio del front,
no por el de la API.

La misma suite de navegador sirve para probar un despliegue:

```bash
E2E_BASE_URL=https://tu-dominio pnpm --filter @gambito/web e2e e2e/partida.spec.ts
```

## Lo que todavía no está

Las cuatro fases del plan están terminadas. Lo que queda son límites conocidos, no fases.

No hay archivo de licencia. Stockfish es GPLv3 y viaja al navegador de cada visitante, así
que publicar el proyecto obliga a decidir bajo qué licencia sale.

No hay copias de seguridad automáticas de la base. Los datos viven en un volumen de Docker
(`gambito_postgres`), que sobrevive a los despliegues pero no a que se pierda el servidor.

La imagen de la API pesa unos 800 MB, casi todo motores de Prisma. Se puede recortar bastante
con `binaryTargets` acotado, pero para un VPS no molesta.

La moderación no tiene cola de denuncias: no hay forma de que alguien reporte una partida o
un mensaje, así que el panel sólo permite buscar y suspender. Un botón de denuncia en la
partida y en el chat es el paso siguiente, y el panel ya tiene dónde apoyarse.

El set de puzzles son quince mates curados y verificados. Para traer volumen hay que
importar el set público de lichess; el modelo ya contempla temas más allá del mate.

El análisis corre entero en el navegador de quien lo pide y no se guarda: volver a abrir una
partida la vuelve a analizar. Guardar las evaluaciones en `Move.evalCp`, que ya existe en el
esquema, es la mejora obvia cuando haga falta.
