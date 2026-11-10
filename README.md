# Rekov Press

La infraestructura tiene dos responsabilidades separadas:

- OCI Always Free `VM.Standard.A1.Flex` (2 OCPU, 12 GB, Ubuntu 24.04): control plane Press, con su MariaDB y Redis. Se accede en `PRESS_CONTROL_HOSTNAME`.
- Contabo Core (`CONTABO_PRODUCT_ID`, región `CONTABO_REGION`, plazo `CONTABO_PERIOD`): nodo de capacidad para tenants. No recibe Docker Compose, ERPNext ni un comando `bench` desde este repositorio.

El flujo operativo es deliberadamente Press-first: se incorpora la VM Contabo desde la UI de Press como **Self Hosted Server**. Press la verifica por SSH, instala/configura su Agent y crea allí benches, bases de datos, aplicaciones y tenants mediante Press Jobs. El operador crea cada cliente desde Press; los clientes no se auto-registran.

Cloudflare proxifica el control exacto y el wildcard `*.PRESS_ROOT_DOMAIN` hacia Contabo. Los tenants se crearán con dominios como `cliente.<PRESS_ROOT_DOMAIN>`.

Un push a `main` ejecuta `.github/workflows/deploy.yml` en el environment `production`, carga Infisical por OIDC y corre `scripts/deploy.sh`. El despliegue comprueba que Contabo sea accesible por SSH, pero no instala un ERP manual allí.
