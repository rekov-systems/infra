# Recuperar Supabase del RMS

El workflow `Back up RMS data` produce diariamente un `pg_dump` custom de la
base Postgres y un archivo cifrado con `.env`, Storage y certificados Caddy. El
workflow de despliegue crea además un respaldo previo de ambos VPS.

## Restauración

1. Descargar los artefactos del run correspondiente desde el bucket R2 y
   verificar sus checksums.
2. Descifrar con `RECOVERY_PASSPHRASE` en un host protegido. Nunca guardar el
   `.env` descifrado en el repositorio.
3. Crear una instalación Supabase con la misma versión self-hosted y restaurar
   primero roles/extensiones requeridos por el compose; restaurar el dump con
   `pg_restore --clean --if-exists` sobre una base vacía.
4. Restaurar el directorio Storage y `.env`, iniciar Supabase y verificar Auth,
   REST, Realtime y acceso a archivos.
5. Apuntar `api.desk.rekov.co` al host recuperado solo después de validar la
   restauración.

El dump Postgres no incluye archivos de Storage; se necesitan ambos artefactos.
Retener en R2 una copia fuera del ciclo normal y probar periódicamente una
restauración en un host aislado.
