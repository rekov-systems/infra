# Operación e instalación

## Secretos requeridos

Environment de GitHub `production` (o variables secretas de Infisical cargadas
por OIDC):

- `R2_STORAGE_ACCESS_KEY_ID`, `R2_STORAGE_SECRET_ACCESS_KEY`,
  `R2_STORAGE_REGION`, `R2_STORAGE_BUCKET`, `R2_STORAGE_ENDPOINT`,
  `R2_STORAGE_STATE_KEY`;
- `RECOVERY_PASSPHRASE` para cifrar el respaldo de ambos VPS;
- credenciales OCI y token/zone ID de Cloudflare para Terraform;
- `SSH_PRIVATE_KEY` para OCI, `CONTABO_SSH_PRIVATE_KEY` y
  `CONTABO_PUBLIC_IP` para Contabo; `CONTABO_SSH_USER` es opcional (por defecto
  `ubuntu`);
- `SUPABASE_DASHBOARD_PASSWORD` y `SUPABASE_DB_PASSWORD`.
- `DESK_AI_WORKER_URL`, URL base del Worker POS de Desk (`https://.../v1/`).

Genera las contraseñas de Supabase como valores hexadecimales (por ejemplo,
`openssl rand -hex 32`) para evitar interpolación accidental de Compose.

Las claves restantes de Supabase se generan una sola vez en Contabo y se
conservan en `/opt/rms/supabase/.env` (permisos 0600). Las regeneraciones no
reemplazan secretos de una instalación existente.

## Puertos y DNS

Solo se publican 22, 80 y 443. OCI sirve `pos.rekov.co`; Contabo sirve
`api.pos.rekov.co` y Studio protegido en `studio.pos.rekov.co`. No publicar
Postgres, Supavisor, Kong ni Studio por puertos directos.

Los volúmenes persistentes Supabase viven en `/opt/rms/supabase/volumes`; los
assets web en `/opt/rms/pos`. Cada ejecución crea un tar cifrado antes del
cambio y lo sube a `recovery/rms/<run-id>/` en R2. Esto no sustituye una prueba
real de restauración ni una política de retención independiente.
