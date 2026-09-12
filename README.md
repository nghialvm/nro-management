# NRO Management Web

This is the React/TypeScript administration console for the Java game server.

## Development

```bash
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:18080`. Start the Java backend first.

## Production

```bash
npm ci
npm run build
```

Serve `dist/` with Nginx over HTTPS and proxy `/api/` to the private Java Admin
API. The sample TLS server block (including HTTP → HTTPS redirect) is in
`deploy/nginx/nro-management.conf`; set `admin.cookie.secure=true` in
production.

The API reads these optional properties from
`data/config/data_base.properties`:

```properties
admin.api.bind=127.0.0.1
admin.api.port=18080
admin.api.threads=16
admin.api.cors=https://admin.example.com
admin.cookie.secure=true
admin.firewall.enabled=false
# Optional when the backend working directory is not the repository root.
admin.assets.dir=/home/ubuntu/nro/data/icon
```

The login uses the existing `account.username` and `account.password` values
and requires `account.is_admin = 1`. Passwords are never returned to the web
client. This is the legacy-password compatibility path and remains a security
debt; migrate accounts to a modern password hash in a later hardening phase.

## Labels and images

Resource tables and JSON editors resolve allowlisted IDs through the authenticated
lookup API. For example:

```text
GET /api/lookups/items?ids=12,13&limit=200
```

The response contains `id`, `label`, optional `iconId`, and `meta`. The React
client batches and caches these lookups, renders the label and icon, and keeps
`#id` as a secondary trace value. Raw JSON and save payloads are not rewritten;
an unavailable label or icon falls back to a placeholder and the original ID.
