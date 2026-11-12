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
