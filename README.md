# Gambito

Plataforma de ajedrez competitivo. Monorepo con la API (Fastify + Socket.IO + Postgres +
Redis) y el front (React + Vite). El servidor es **autoritativo**: valida cada jugada y es
dueño del reloj; el cliente nunca decide el resultado.

Estado: **Fase 1 — base jugable**. Dos personas registradas se emparejan por rating, juegan
una partida real con reloj y la partida queda guardada en PGN.

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
apps/web     React 19, Vite, TailwindCSS v4, tablero SVG
packages/shared       tipos, esquemas Zod y contratos de eventos del socket
packages/chess-core   reglas de ajedrez (envoltorio de chess.js), cliente y servidor
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

## Verificar

```bash
pnpm turbo run typecheck test          # 20 pruebas (necesita Postgres y Redis arriba)
pnpm --filter @gambito/web exec playwright install chromium   # sólo la primera vez
pnpm --filter @gambito/web e2e         # 2 pruebas en un navegador real
```

- `packages/chess-core` (14): enroque, al paso, coronación, mate, ahogado, triple
  repetición, material insuficiente y balance de capturas.
- `apps/api` (6): ciclo completo con dos sockets (emparejar → mate → guardado), rechazo de
  jugada ilegal con corrección del estado, abandono, colas separadas por control de tiempo,
  y recuperación de una partida que quedó activa tras un reinicio.
- `apps/web` (2): dos navegadores se registran, se emparejan, juegan una española moviendo
  con clics reales sobre el tablero y uno se rinde; más una pasada de tema claro. Las
  capturas quedan en `apps/web/e2e/capturas/`.

Las pruebas de navegador crean varias cuentas seguidas, así que el `.env` local sube
`RATE_LIMIT_REGISTER_MAX`. Los valores por defecto del código son los de producción.

## Lo que todavía no está

Fases 2 a 4 del plan: rating Glicko-2, práctica contra Stockfish, perfil con estadísticas,
ranking, entrenamiento y torneos. El `ratingDelta` que manda el servidor al terminar una
partida es `null` hasta que entre Glicko-2.
