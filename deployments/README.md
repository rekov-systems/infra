# Deployments

Per-client deployment configuration for Dokploy or any Docker Compose host.
Real secrets **never** live in the repository — they are injected via the hosting platform UI.

---

## Structure

```text
deployments/
├── _template/                # Base template for each new client
│   ├── .env.example
│   └── docker-compose.yml
└── instances/
    └── <client>/
        ├── .env.example      # Documents required variables (committed)
        └── docker-compose.yml
```

---

## Add a New Client

```bash
cp -r deployments/_template deployments/instances/client-name
```

Edit the two files in the new folder:

1. **`docker-compose.yml`** — change `image` and `container_name` to the client name. Update `context` if the folder depth changes.
2. **`.env.example`** — document the Supabase URL and key with example values, not real ones.

```bash
git add deployments/instances/client-name
git commit -m "feat: add client-name instance"
git push
```

---

## Deploy with Dokploy

1. **New project** in Dokploy → type **Docker Compose**
2. **Source** → connect the `ai-point-of-sale` repository
3. **Compose file path** → `deployments/instances/<client>/docker-compose.yml`
4. **Environment Variables** in Dokploy UI → paste the real values:

   | Variable | Where to get it |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Settings → API → anon public |
   | `APP_PORT` | Free port on the server (e.g. 3001, 3002…) |

5. **Deploy** — Dokploy injects the variables as build args → Vite bakes them into the bundle → the container starts.

---

## How Secrets Flow

```text
Dokploy UI (environment variables)
        │
        ▼
docker-compose.yml receives ${VITE_SUPABASE_URL} etc.
        │
        ▼
Dockerfile: ARG VITE_SUPABASE_URL → ENV → npm run build
        │
        ▼
Compiled JS bundle with that client's URL/key baked in
        │
        ▼
nginx serves /dist static files → browser connects directly to Supabase
```

`VITE_*` variables are **build-time**: they end up inside the compiled JS. Each client needs its own build — its own Docker image.

---

## Port Mapping per Instance

| Client | APP_PORT |
|---|---|
| demo-s360t | 3010 |
| _(next client)_ | 3002 |

Update this table when adding a new instance.
