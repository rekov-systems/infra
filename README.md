# Rekov Retail Management System

Base del RMS omnicanal de Rekov: frontend POS upstream, Supabase autogestionado,
despliegue repartido entre OCI y Contabo, y extensiones opcionales como JCFlow.

## Topología

| Servicio | VPS / servicio | Dominio |
| --- | --- | --- |
| POS React PWA | OCI Always Free | `pos.rekov.co` |
| Supabase: Postgres, Auth, REST, Realtime, Storage, Functions y Studio | Contabo | `api.pos.rekov.co`, `studio.pos.rekov.co` |
| IA oficial y Meta API de Desk | Cloudflare Workers, fuera de este repo | `docs/integrations-desk.md` |
| Facturación electrónica opcional | JCFlow, por tenant | `docs/jcflow.md` |

OCI sirve los assets estáticos y Contabo aloja el estado transaccional. No se
instala Frappe ni ERPNext. Supabase self-hosted es una instancia/proyecto; el
aislamiento de negocios vive en `tenant_id`, sucursales y RLS del POS.

## Fuente del POS y actualizaciones

`apps/pos/` es un subtree del repositorio MIT
[`mateopiza/ai-point-of-sale`](https://github.com/mateopiza/ai-point-of-sale), no
un fork independiente. El remoto `pos-upstream` conserva el origen. El workflow
semanal `Sync POS upstream` trae commits con `git subtree pull` y abre un PR para
revisión. Rekov mantiene su paleta en `apps/pos/public/rekov-theme.css`; la
lógica funcional y pantallas permanecen upstream salvo esta hoja de tema.

Sincronización manual: `scripts/sync-pos-upstream.sh`.

## Primer despliegue

1. Cargar los secretos listados en `docs/operations.md` en el environment
   `production` de GitHub Actions/Infisical.
2. Ejecutar `Deploy RMS`. OCI se resuelve desde el estado Terraform y Contabo
   desde la API, filtrando la instancia existente por producto y región.
3. El flujo respalda ambos hosts en R2, reinstala la VPS Contabo existente con
   una imagen limpia de Ubuntu, inicia Supabase allí, despliega el POS en OCI,
   comprueba endpoints y, solo después, retira Pilot/Frappe/ERPNext de ambas VPS. No
   formatea discos ni elimina volúmenes fuera de la instalación anterior.
4. Verificar login, aislamiento tenant/sucursal y venta offline antes de
   habilitar clientes.

El despliegue normal conserva volúmenes Supabase y no ejecuta `down -v`. El
respaldo previo se conserva en R2.

La migración omite los seeds de `La Panadería` y las cuentas demo con
contraseñas conocidas que vienen en el upstream. El primer tenant se crea con
`bootstrap_first_tenant` tras registrar su usuario owner. Los adaptadores AI
reenvían al Worker de Desk; Evolution y la cola email de Lovable upstream no se
despliegan.

## Capacidad

Supabase self-hosted recomienda al menos 4 GB RAM / 2 cores y 8 GB+ / 4 cores
recomendados. Contabo debe cumplir ese mínimo; OCI actual tiene 2 OCPU y 12 GB,
por lo que queda para estáticos/proxy. Antes de producción con ventas reales se
necesitan alertas de disco/RAM, backups probados y recuperación documentada.
