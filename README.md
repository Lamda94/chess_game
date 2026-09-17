# Gambito

Plataforma de ajedrez competitivo. Monorepo con la API (Fastify + Socket.IO + Postgres +
Redis) y el front (React + Vite). El servidor es **autoritativo**: valida cada jugada y es
dueño del reloj; el cliente nunca decide el resultado.

Estado: **Fase 2 — IA y perfil**. Dos personas registradas se emparejan por rating, juegan
una partida real con reloj que mueve su Glicko-2, practican contra Stockfish en el navegador
y después revisan la partida jugada a jugada con el análisis del motor.

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
packages/chess-core   reglas de ajedrez (envoltorio de chess.js) y libro de aperturas
packages/rating       Glicko-2
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

## Verificar

```bash
pnpm turbo run typecheck test          # 46 pruebas (necesita Postgres y Redis arriba)
pnpm --filter @gambito/web exec playwright install chromium   # sólo la primera vez
pnpm --filter @gambito/web e2e         # 14 pruebas en un navegador real
```

- `packages/chess-core` (26): enroque, al paso, coronación, mate, ahogado, triple
  repetición, material insuficiente, balance de capturas, hándicap de material y
  reconocimiento de aperturas desde el PGN.
- `packages/rating` (12): el ejemplo publicado por Glickman con sus valores exactos,
  simetría entre ganador y perdedor, y los topes de desviación.
- `apps/api` (8): ciclo completo con dos sockets (emparejar → mate → guardado), rechazo de
  jugada ilegal con corrección del estado, abandono, colas separadas por control de tiempo,
  recuperación de una partida que quedó activa tras un reinicio, y el movimiento de rating
  en partidas clasificatorias y amistosas.
- `apps/web` (14): partida completa entre dos navegadores, Stockfish contestando de verdad,
  pistas, deshacer, hándicap, perfil con aperturas deducidas del PGN, y el visor de análisis
  clasificando jugadas. Las capturas quedan en `apps/web/e2e/recorrido/`.

Las pruebas de navegador crean varias cuentas seguidas, así que el `.env` local sube
`RATE_LIMIT_REGISTER_MAX`. Los valores por defecto del código son los de producción.

## Lo que todavía no está

Fases 3 y 4 del plan: tabla de posiciones, salón de entrenamiento con lecciones y puzzles,
y torneos (suizo, arena y eliminación), además de amigos y desafíos directos.

El análisis corre entero en el navegador de quien lo pide y no se guarda: volver a abrir una
partida la vuelve a analizar. Guardar las evaluaciones en `Move.evalCp`, que ya existe en el
esquema, es la mejora obvia cuando haga falta.
