# Rekov Press

La infraestructura tiene dos responsabilidades separadas:

- OCI Always Free `VM.Standard.A1.Flex` (2 OCPU, 12 GB, Ubuntu 24.04): control plane Press, con su MariaDB y Redis. Se accede en `PRESS_CONTROL_HOSTNAME`.
- Contabo Core (`CONTABO_PRODUCT_ID`, región `CONTABO_REGION`, plazo `CONTABO_PERIOD`): nodo de capacidad para tenants. No recibe Docker Compose, ERPNext ni un comando `bench` desde este repositorio.

El flujo operativo es deliberadamente Press-first: se incorpora la VM Contabo desde la UI de Press como **Self Hosted Server**. Press la verifica por SSH, instala/configura su Agent y crea allí benches, bases de datos, aplicaciones y tenants mediante Press Jobs. El operador crea cada cliente desde Press; los clientes no se auto-registran.

Cloudflare proxifica el control exacto y el wildcard `*.PRESS_ROOT_DOMAIN` hacia Contabo. Los tenants se crearán con dominios como `cliente.<PRESS_ROOT_DOMAIN>`.

El workflow de producción se ejecuta manualmente desde `main`, carga Infisical por
OIDC y corre `scripts/deploy.sh` únicamente en modo nativo. El despliegue
comprueba que Contabo sea accesible por SSH, pero no instala un ERP manual allí.

## Rebuild nativo

Para una reconstrucción limpia, ejecutar primero `Create recovery point` y
esperar a que termine correctamente. Luego ejecutar manualmente `Deploy ERPNext`
desde Actions y copiar en `recovery_run_id` el número de esa ejecución. El deploy
verifica el manifest, snapshots, checksums y artefactos
desde R2 antes de tocar Terraform. Ese modo instala solamente el control plane de
Press y no copia ni ejecuta `rekov_press_platform.py`, no cambia paquetes del
tenant y no reescribe credenciales del Agent.

Después, en Press:

1. Configurar el cluster híbrido, el plan Self Hosted, el Root Domain y el
   proxy mediante los formularios nativos.
2. Crear y verificar el Self Hosted Server con la IP, SSH key y plan del nodo.
3. Ejecutar el setup nativo del servidor y del proxy, esperando que ambos
   queden `Active`.
4. Crear el Release Group, build, Bench y sitio desde Press.

El workflow `Create recovery point` debe completarse antes de cualquier
rebuild. `Restore recovery point` es un workflow separado y protegido; nunca
forma parte del deploy normal.
