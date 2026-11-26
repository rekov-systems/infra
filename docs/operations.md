# Operación e instalación

## Secretos requeridos

Environment de GitHub `production` (o variables secretas de Infisical cargadas
por OIDC):

- `R2_STORAGE_ACCESS_KEY_ID`, `R2_STORAGE_SECRET_ACCESS_KEY`,
  `R2_STORAGE_REGION`, `R2_STORAGE_BUCKET`, `R2_STORAGE_ENDPOINT`,
  `R2_STORAGE_STATE_KEY`;
- `RECOVERY_PASSPHRASE` para cifrar el respaldo de ambos VPS;
- credenciales OCI y token/zone ID de Cloudflare para Terraform;
- `OCI_NEXT_SSH_PRIVATE_KEY` para el SSH de OCI y
  `OCI_NEXT_SSH_PUBLIC_KEY` para la llave pública que Terraform configura en OCI;
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
- `TENANT_SECRETS_ENCRYPTION_KEY`, valor base64 que decodifique exactamente a
  32 bytes; cifra las credenciales Meta y JCFlow guardadas por negocio.
- `META_APP_ID` y `WHATSAPP_EMBEDDED_CONFIG_ID`, identificadores públicos de
  la App Desk ya aprobada y su configuración Embedded Signup. No son secretos,
  aunque el despliegue los carga desde Infisical.
- `META_APP_SECRET`, secreto de la aplicación App Desk ya aprobada, usado para
  canjear el código de Embedded Signup y validar la firma de webhooks.
- `META_WEBHOOK_VERIFY_TOKEN`, valor aleatorio que también se configura en
  Meta Developers al registrar el webhook.
- `META_GRAPH_VERSION`, variable opcional, por ejemplo `v26.0`;
- `CLOUDFLARE_WORKERS_AI_TOKEN`, token separado con permiso Workers AI Read;
  no reutiliza el token Terraform.
- `CLOUDFLARE_ROOT_DOMAIN` o el nombre legado `PRESS_ROOT_DOMAIN` para la zona
  Cloudflare.
Genera estos valores localmente, sin pegarlos en el chat:

```sh
openssl rand -base64 32
openssl rand -hex 32
```

Guarda el primer resultado como `TENANT_SECRETS_ENCRYPTION_KEY` y el segundo
como `META_WEBHOOK_VERIFY_TOKEN`. Usa los valores que ya tiene Desk para `META_APP_ID`, `META_APP_SECRET` y
`WHATSAPP_EMBEDDED_CONFIG_ID`; no crees otra App. Configura el callback de esa
App como `https://api.desk.rekov.co/functions/v1/meta-whatsapp-webhook` y
suscribe `messages`. Embedded Signup se inicia desde Configuración en Desk; el
negocio no debe pegar tokens.
Las credenciales Meta resultantes y las claves API JCFlow se guardan cifradas
por sucursal/negocio en RMS; no se guardan en Infisical.

La IA de pedidos conserva el agente y herramientas nativos del RMS, y llama el
endpoint oficial Workers AI con el mismo modelo de Desk. Requiere
`CLOUDFLARE_WORKERS_AI_TOKEN` con permiso Workers AI Read; nunca usa el token de
Terraform ni una clave externa de modelo.

Rappi es opcional. Si Rekov habilita el conector, añade `RAPPI_API_BASE`,
`RAPPI_CLIENT_ID`, `RAPPI_CLIENT_SECRET` y `RAPPI_WEBHOOK_SECRET`; `RAPPI_IP_ALLOWLIST`
es opcional. Uber Eats y DiDi Food no se muestran porque no hay conectores
funcionales para esos canales.

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
Después del respaldo cifrado en R2, el despliegue reinstala la misma VPS con la
imagen estándar Ubuntu 24.04. La acción de reinstall opera sobre el `instanceId`
existente; no crea otro servidor.

OCI usa `OCI_NEXT_SSH_PRIVATE_KEY` y `OCI_NEXT_SSH_PUBLIC_KEY` como su par
permanente. El workflow `Verify OCI SSH access` comprueba el par y el acceso a
la VM existente. OCI no requiere contraseña root para este flujo.

Las claves restantes de Supabase se generan una sola vez en Contabo y se
conservan en `/opt/rms/supabase/.env` (permisos 0600). Las regeneraciones no
reemplazan secretos de una instalación existente.

## Puertos y DNS

Solo se publican 22, 80 y 443. Desk vive en `desk.rekov.co`; el panel Rekov
vive en `control.desk.rekov.co`. Cada usuario accede a los negocios asignados por
su cuenta, sin subdominios por tenant. Contabo sirve Supabase en
`api.desk.rekov.co` y Studio protegido en `studio.desk.rekov.co`. No publicar Postgres, Supavisor,
Kong ni Studio por puertos directos.

Los volúmenes persistentes Supabase viven en `/opt/rms/supabase/volumes`; los
assets web en `/opt/rms/pos`. Cada ejecución crea un tar cifrado antes del
cambio y lo sube a `recovery/rms/<run-id>/` en R2. Esto no sustituye una prueba
real de restauración ni una política de retención independiente.
