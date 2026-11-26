# Desk + RMS: variables y secretos

## Alcance

La revisión compara el runtime de Desk (`desk/infra/cloudflare/wrangler.toml.template`,
`sync-secrets.sh`, ejemplos `.env` y rutas API) con el despliegue RMS. No lee ni
copia valores de `.env` ni verifica el contenido actual del proyecto Infisical.
Desk sigue siendo una sola marca y producto. Reutiliza la App Meta Desk aprobada;
la llave `TENANT_SECRETS_ENCRYPTION_KEY` es propia del almacenamiento RMS.

## Secretos propios del Worker Desk

El sincronizador actual de Desk publica estos nombres como secretos de Cloudflare:

| Secreto Desk | Para qué se usa | ¿Copiar al entorno RMS? |
| --- | --- | --- |
| `JWT_SECRET` | Firma y valida sesiones/tokens de Desk | No; son tokens de otra aplicación |
| `ENCRYPTION_KEY` | Cifra secretos de integraciones almacenados por Desk | No; RMS usa `TENANT_SECRETS_ENCRYPTION_KEY` |
| `META_APP_SECRET` | Canje de Embedded Signup y firmas de la App Desk | Sí, reutiliza la App Desk aprobada |
| `TURNSTILE_SECRET_KEY` | Verificación server-side de Turnstile en Desk | No, salvo que el RMS active su propio Turnstile |
| `OPS_BOOTSTRAP_PASSWORD` | Bootstrap de operadores Desk | No; RMS usa `RMS_PLATFORM_ADMIN_PASSWORD` |
| `CREEM_API_KEY` | Cobros/suscripciones Desk con Creem | Solo si se migra esa facturación |
| `CREEM_WEBHOOK_SECRET` | Firma de webhooks de Creem | Solo con el conector Creem |
| `CF_BILLING_API_TOKEN` | Operaciones de billing de Cloudflare en Desk | Solo si se migra esa función |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth de Google en Desk | Solo si se migra esa integración |
| `HUBSPOT_OAUTH_CLIENT_SECRET` | OAuth de HubSpot en Desk | Solo si se migra esa integración |
| `SHOPIFY_OAUTH_CLIENT_SECRET` | OAuth de Shopify en Desk | Solo si se migra esa integración |

El código también admite `LLM_API_KEY` como proveedor externo opcional. No se
necesita para Cloudflare Workers AI. Desk usa el binding oficial `AI` y configura
modelos mediante variables como `WORKERS_AI_CHAT_MODEL`,
`WORKERS_AI_EMBEDDING_MODEL` y `WORKERS_AI_VISION_MODEL`; no hay que copiar una
API key de OpenAI para usar ese binding.

## Variables Desk que no son secretos

El Worker obtiene su configuración pública/operativa de variables y bindings:
`META_APP_ID`, `WHATSAPP_EMBEDDED_CONFIG_ID`, `META_GRAPH_VERSION`,
`WHATSAPP_CONNECT_ENABLED`, `META_WEBHOOK_VERIFY_TOKEN`, `APP_URL`,
`OPS_APP_URL`, `PLATFORM_API_URL`, modelos Workers AI, y los IDs de D1, KV,
R2, Vectorize, Analytics Engine, Queues y Durable Objects. El despliegue actual
de Desk las resuelve en su propio entorno Cloudflare; no son todas entradas
necesarias para Infisical RMS.

## Configuración compartida con el RMS

El workflow RMS ya requiere `TENANT_SECRETS_ENCRYPTION_KEY`,
`META_WEBHOOK_VERIFY_TOKEN` y `META_APP_SECRET`. Para
Embedded Signup añade también:

- `META_APP_ID` — ID público de la App Meta Desk ya aprobada; no crees otra App.
- `WHATSAPP_EMBEDDED_CONFIG_ID` — ID público de su configuración Embedded Signup.
- `META_GRAPH_VERSION` — variable opcional; el valor predeterminado del código es `v26.0`.

`META_APP_SECRET` debe pertenecer a esa misma App Desk. La App Desk debe registrar
`https://api.desk.rekov.co/functions/v1/meta-whatsapp-webhook` como callback y
suscribir `messages`. La App Desk cambia a un único callback para esta aplicación unificada. Cada negocio vincula su WhatsApp mediante el
popup Meta; su token resultante se guarda cifrado en la base RMS, no en Infisical.

## Workers AI de Desk en las Edge Functions RMS

El agente nativo del RMS conserva su bucle de herramientas, configuración por
sucursal e historial. Chat y embeddings llaman la API oficial de Workers AI con
el mismo modelo de producción definido por Desk. En Infisical añade
`CLOUDFLARE_WORKERS_AI_TOKEN` con permiso mínimo `Workers AI Read`; el
`TF_VAR_cloudflare_account_id` existente se usa solo para construir el endpoint.
No se usa `TF_VAR_cloudflare_api_token` del despliegue Terraform en runtime, ni
se crea otro agente/Worker, ni se usan proveedores externos. El token se monta
solo en Edge Functions. El agente no se debe considerar operativo hasta tener
el token y activar el webhook Meta del producto unificado.

## Marketing

`empresa/marketing/desk-spot` contiene material de campaña y no aporta variables
de runtime, API ni secretos que deban cargarse en Infisical RMS.
