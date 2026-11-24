# Production Runbook — POS S360T

## 1) Quality Gates (Required)

Before every release, the following checks must pass:

```bash
npm ci
npm run validate:migrations
npm run lint
npm run test
npm run build
```

Do not deploy if any step fails.

## 2) Webhook Contract

### Rappi (`rappi-webhook`)

Required headers:

- `x-rappi-signature`
- `x-rappi-timestamp`

Expected signature:

- `HMAC-SHA256(secret, "<timestamp>.<raw_body>")`
- Temporary compatibility: also accepts `HMAC-SHA256(secret, raw_body)`

Additional protection:

- Anti-replay via timestamp (5-minute window)
- In-memory rate limit per IP
- Optional IP allowlist via `RAPPI_IP_ALLOWLIST`

### Evolution (`evolution-webhook`)

Required headers:

- `x-webhook-signature` or `x-evolution-signature`
- `x-webhook-timestamp` or `x-evolution-timestamp`

Expected signature:

- `HMAC-SHA256(secret, "<timestamp>.<raw_body>")`

Additional protection:

- Anti-replay via timestamp (5-minute window)
- In-memory rate limit per IP
- Optional IP allowlist via `EVOLUTION_IP_ALLOWLIST`

## 3) Minimum Observability

- Structured JSON logs (`level`, `message`, `ts`, `context`).
- Operational metrics to watch:
  - `sync_queue_item_sync_failed`
  - `sync_queue_batch_processed`
  - `rappi_webhook_invalid_signature`
  - `evolution_webhook_invalid_signature`
  - Non-2xx HTTP errors in `ai-order-agent`

## 4) Release and Rollback Process

1. Create a semantic tag (`vX.Y.Z`).
2. Publish a changelog with functional changes and breaking changes.
3. Deploy the new image in Dokploy / Docker Compose.
4. Post-deploy smoke test:
   - Login
   - Open cash session
   - Complete a sale
   - Sync offline → online
   - Receive a signed webhook
5. If the smoke test fails, roll back to the previous image.
