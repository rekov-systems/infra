# Operación e instalación

## Secretos requeridos

Environment de GitHub `production` (o variables secretas de Infisical cargadas
por OIDC):

- `R2_STORAGE_ACCESS_KEY_ID`, `R2_STORAGE_SECRET_ACCESS_KEY`,
  `R2_STORAGE_REGION`, `R2_STORAGE_BUCKET`, `R2_STORAGE_ENDPOINT`,
  `R2_STORAGE_STATE_KEY`;
- `RECOVERY_PASSPHRASE` para cifrar el respaldo de ambos VPS;
- credenciales OCI y token/zone ID de Cloudflare para Terraform;
- `SSH_PRIVATE_KEY` para el SSH de OCI y `TF_VAR_ssh_public_key` para la llave
  pública que Terraform configura en OCI;
- `TF_VAR_tenancy_ocid`, `TF_VAR_user_ocid`, `TF_VAR_fingerprint`,
  `TF_VAR_private_key`, `TF_VAR_oci_region`, `TF_VAR_compartment_ocid`,
  `TF_VAR_cloudflare_api_token` y `TF_VAR_cloudflare_zone_id` para los
  proveedores Terraform;
- `CONTABO_ROOT_PASSWORD`, `CONTABO_SSH_PRIVATE_KEY` y
  `CONTABO_SSH_PUBLIC_KEY` para actualizar acceso a la instancia Contabo
  existente. La IP y el usuario se resuelven por API;
- `CONTABO_API_USER`, `CONTABO_API_PASSWORD`, `CONTABO_CLIENT_ID`,
  `CONTABO_CLIENT_SECRET`, `CONTABO_PRODUCT_ID` y `CONTABO_REGION` para localizar
  y configurar esa instancia desde API.
- `SUPABASE_DASHBOARD_PASSWORD` y `SUPABASE_DB_PASSWORD`.
- `CLOUDFLARE_ROOT_DOMAIN` o el nombre legado `PRESS_ROOT_DOMAIN` para la zona
  Cloudflare;
- `DESK_AI_WORKER_URL`, URL base del Worker POS de Desk (`https://.../v1/`), es
  opcional y solo se necesita para las funciones AI/documento/factura.

Genera las contraseñas de Supabase como valores hexadecimales (por ejemplo,
`openssl rand -hex 32`) para evitar interpolación accidental de Compose.

La identidad SSH permanente de Contabo se genera una sola vez localmente con
`ssh-keygen -t ed25519 -a 64 -N '' -f ~/.ssh/rekov-contabo-rms -C rekov-rms-contabo`.
Guarda el archivo privado como `CONTABO_SSH_PRIVATE_KEY` y el `.pub` como
`CONTABO_SSH_PUBLIC_KEY` en Infisical. Genera una contraseña robusta para root
y guárdala como `CONTABO_ROOT_PASSWORD`. El workflow registra temporalmente la
clave pública y la contraseña en el gestor de secretos de Contabo, aplica
ambas a la VPS existente con `resetPassword` y borra los secretos temporales de
la API al terminar. No aprovisiona otra VPS. La conexión SSH solo podrá
completarse cuando la regla de bloqueo de puerto 22 de Contabo esté desactivada.

OCI usa su par de llave, `SSH_PRIVATE_KEY` junto con `TF_VAR_ssh_public_key`. Para
rotarla sin perder acceso, genera el nuevo par y agrégalo temporalmente a
Infisical como `OCI_NEXT_SSH_PRIVATE_KEY` y `OCI_NEXT_SSH_PUBLIC_KEY`. Ejecuta
el workflow `Rotate OCI SSH key`; este instala la pública en la VM existente y
verifica el acceso con la privada nueva. Solo después de que termine bien,
reemplaza `SSH_PRIVATE_KEY` y `TF_VAR_ssh_public_key` por el nuevo par y elimina
los dos secretos temporales. OCI no requiere contraseña root para este flujo.

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
