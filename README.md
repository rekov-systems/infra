# Rekov

Dos máquinas:

- OCI Always Free `VM.Standard.A1.Flex` (2 OCPU, 12 GB, Ubuntu 24.04): Press y MariaDB. DNS `PRESS_CONTROL_HOSTNAME`.
- Contabo Core (`CONTABO_PRODUCT_ID`, región `CONTABO_REGION`, plazo `CONTABO_PERIOD`): ERPNext y Nginx. El primer site es `erp.<PRESS_ROOT_DOMAIN>` y usa `PRESS_ADMIN_PASSWORD` y `PRESS_DB_ROOT_PASSWORD`.

Cloudflare proxifica el registro exacto del control y el wildcard `*.PRESS_ROOT_DOMAIN` hacia Contabo. El estado de Terraform está en R2 (`R2_STORAGE_STATE_KEY`).

Un push a `main` ejecuta `.github/workflows/deploy.yml` en el environment `production`, carga Infisical por OIDC y corre `scripts/deploy.sh`.
