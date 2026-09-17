#!/bin/sh
set -e

# Las migraciones corren antes de levantar el servidor.
#
# Con un solo contenedor esto es correcto y es lo más simple. Si algún día hay
# más de una réplica, hay que sacarlo de acá: dos instancias arrancando a la vez
# intentarían migrar en paralelo. En ese caso va como paso de release aparte,
# `pnpm --filter @gambito/api prisma:deploy`, antes de renovar los contenedores.
cd /repo/apps/api
echo "[arranque] aplicando migraciones…"
# pnpm deja los binarios en el node_modules del propio paquete, no en el de la
# raíz del monorepo.
./node_modules/.bin/prisma migrate deploy

echo "[arranque] levantando la API…"
exec node dist/index.js
