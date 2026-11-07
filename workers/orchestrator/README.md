# Cloudflare Worker (skeleton)

Replace this stub with:

- HTTP routes for **Telnyx** webhooks (incoming call events → Workers AI / ERPNext API key)
- **Email Worker** if using [Email Routing → Worker](https://developers.cloudflare.com/email-routing/email-workers/)
- **Cron Triggers** for follow-ups (poll ERPNext with API key stored as a [secret](https://developers.cloudflare.com/workers/configuration/secrets/))

**Local:** `npm ci && npx wrangler deploy`

**CI:** [`.github/workflows/infra.yml`](../../.github/workflows/infra.yml) (job `cloudflare-worker`) — mismas claves que Terraform: `TF_VAR_cloudflare_api_token`, `TF_VAR_cloudflare_account_id` ([Infisical](../../docs/infisical-github-actions.md) u optional GitHub Secrets con esos nombres).

Secrets de aplicación: `wrangler secret put ERPNEXT_API_KEY` (local o una vez desde una máquina con token). Variables: `ERPNEXT_URL` al hostname del túnel (o `[vars]` en `wrangler.toml`).
