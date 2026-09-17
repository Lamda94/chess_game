# Túnel de Cloudflare

Acá van los dos archivos del túnel, que **no se versionan**:

- `config.yml`
- `credentials.json` (secreto: dejalo en modo `600`)

Se generan una sola vez, desde cualquier máquina con `cloudflared` instalado:

```bash
cloudflared tunnel login
cloudflared tunnel create gambito          # imprime el ID y crea el credentials.json
cloudflared tunnel route dns gambito TU_DOMINIO
```

El `credentials.json` queda en `~/.cloudflared/<id>.json`; copialo acá junto a un
`config.yml` así:

```yaml
tunnel: <id>
credentials-file: /etc/cloudflared/credentials.json

ingress:
  - hostname: TU_DOMINIO
    service: http://web:80
  - service: http_status:404
```

El `service` apunta al contenedor `web` y no a la API: Caddy es el que reparte
entre los archivos estáticos, `/api` y `/socket.io`. Los WebSocket del juego
pasan por el túnel sin configuración extra.
