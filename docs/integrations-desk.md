# Desk Workers: IA y Meta API

Desk sigue siendo el dueño de IA oficial de Cloudflare y de las integraciones
Meta. Este repositorio no instala OpenRouter, Evolution API, tokens Meta ni
servicios de IA en Supabase.

La UI upstream contiene módulos de AI y mensajería que asumen funciones Deno y
proveedores propios. Esos módulos no se consideran parte del primer despliegue
RMS. Se habilitan cuando Desk exponga un endpoint autenticado para el POS. El
cliente envía su JWT de Supabase; el Worker verifica usuario, tenant y sucursal
antes de operar. Nunca se envían `service_role`, claves Meta ni credenciales de
modelo al navegador.

El adaptador de Supabase Functions en `deploy/functions/` conserva los nombres
`ai-order-agent`, `process-invoice` y `embed-knowledge-doc` que invoca el POS y
reenvía JWT y payload al Worker de Desk. `DESK_AI_WORKER_URL` es la URL base
acabada en `/v1/`; el Worker debe exponer esos tres endpoints. Debe validar JWT
emitido por el Supabase RMS, verificar tenant/sucursal y rol, invocar Workers AI
mediante el binding oficial y devolver el contrato esperado por el POS.

La primera respuesta de esos endpoints todavía requiere su implementación en el
Worker de Desk, que vive en el otro repositorio. Meta Graph API y sus secretos
permanecen enteramente en Desk.

No desplegar las funciones upstream `ai-order-agent` o `embed-knowledge-doc`, ni
`evolution-webhook` ni funciones que requieran OpenRouter, Gemini o Evolution.
En su lugar se despliegan los adaptadores locales de `deploy/functions/`. Las
funciones Rappi mantienen firma HMAC; las demás validan JWT por sí mismas o lo
reenvían al Worker, por eso la verificación JWT global del runtime queda
desactivada.
