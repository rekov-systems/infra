# Rekov Pilot

La infraestructura productiva usa una sola VM OCI Always Free
`VM.Standard.A1.Flex` de 2 OCPU y 12 GB de RAM con Ubuntu 24.04. La VM ejecuta
Pilot, Frappe v16, ERPNext v16, MariaDB, Redis y nginx. El Admin UI queda en
`https://admin.rekov.co`.

Contabo se conserva como una VM independiente y vacía. No se elimina, no se
recrea y no forma parte del Terraform ni del workflow de Pilot.

Cloudflare administra el DNS. El registro `admin` es DNS-only para que Pilot
obtenga y renueve su certificado nativo de Let’s Encrypt; el wildcard de tenants
apunta a OCI y queda disponible para los sites.

## Operación

El workflow `Bootstrap Pilot on OCI` se ejecuta desde `main`, carga secretos de
Infisical por OIDC, reconcilia Terraform y ejecuta únicamente el instalador y los
comandos oficiales de Pilot. También persiste las reglas web del firewall base
de Ubuntu para que 80/443 funcionen en futuras VMs.

Desde el Admin UI se gestionan benches, apps, sites, dominios, backups,
procesos, logs y tareas. El primer bench `main` ya tiene ERPNext instalado.
Los tenants y sus usuarios se crean desde la interfaz de Pilot/Frappe, no desde
un script de lifecycle propio.

R2 permanece reservado para estado Terraform y backups. Los workflows de
recovery son independientes del bootstrap normal.

## Aplicación privada JCFlow

Este mismo repositorio también contiene la aplicación Frappe privada
`rekov_jcflow` en la raíz. CI valida su metadata y su compatibilidad básica sin
instalarla automáticamente en todos los tenants.

Pilot puede importar este repositorio como una app personalizada y luego
instalarla únicamente en los sitios seleccionados. La app separa la
configuración global administrada por Rekov de la configuración fiscal de cada
empresa. La API key no se solicita al tenant. Cada empresa tiene un registro
JCFlow propio para su empresa, sin exponer credenciales técnicas al tenant.
El envío real se habilitará después de validar el contrato JSON y el mecanismo
de selección multiempresa de JCFlow en sandbox; no se deben usar claves de
producción durante esa etapa.

La app escucha el evento nativo `on_submit` de `Sales Invoice`, crea un
`JCFlow Transmission Log` y usa la cola de fondo de Frappe. No sobrescribe
controladores, no modifica tablas de ERPNext y no bloquea el envío de la
factura. La transmisión permanece apagada hasta activar explícitamente la
configuración del tenant.
