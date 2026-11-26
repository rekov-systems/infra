# Rekov Retail Management System

Base del RMS omnicanal de Rekov: frontend POS upstream, Supabase autogestionado,
despliegue repartido entre OCI y Contabo, y extensiones opcionales como JCFlow.

## Topología

| Servicio | VPS / servicio | Dominio |
| --- | --- | --- |
| Desk · plataforma de gestión comercial omnicanal | OCI Always Free | `desk.rekov.co` |
| Empresas usuarias | OCI Always Free | acceso por membresía en `desk.rekov.co` |
| Administración de la plataforma Rekov | OCI Always Free | `control.desk.rekov.co` |
| Supabase RMS: Postgres, Auth, REST, Realtime, Storage, Functions y Studio | Contabo | `api.desk.rekov.co`, `studio.desk.rekov.co` |
| API Desk y Workers AI | Cloudflare Workers existente | `api-desk.rekov.co` |
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
revisión. La personalización Rekov vive en `overlays/pos/desk-rms.patch`; el
workflow aplica el overlay al compilar sin editar el subtree original. La vista
**Cambios del proyecto** en `control.desk.rekov.co` consulta los cambios del
upstream y señala archivos con posible superposición. La PR requiere que el
parche aplique y el build pase; ninguna actualización se despliega sola.

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
respaldo previo se conserva en R2. El producto usa `desk.rekov.co` como entrada común y selecciona cada negocio
por las membresías del usuario. El panel Rekov vive en `control.desk.rekov.co`;
la API Supabase en `api.desk.rekov.co`.

La migración omite los seeds de `La Panadería` y las cuentas demo con
contraseñas conocidas que vienen en el upstream. Los negocios se crean desde
el panel de control; no hay registro público. La mensajería usa la App Meta de Desk ya aprobada y Meta Cloud API oficial. El
agente nativo de pedidos conserva sus herramientas del RMS; chat, embeddings y
OCR llaman Workers AI con el modelo de producción de Desk. Se requiere un token
Workers AI separado. Evolution y la cola email de Lovable upstream no se despliegan.

## Capacidad

Supabase self-hosted recomienda al menos 4 GB RAM / 2 cores y 8 GB+ / 4 cores
recomendados. Contabo debe cumplir ese mínimo; OCI actual tiene 2 OCPU y 12 GB,
por lo que queda para estáticos/proxy. Antes de producción con ventas reales se
necesitan alertas de disco/RAM, backups probados y recuperación documentada.
