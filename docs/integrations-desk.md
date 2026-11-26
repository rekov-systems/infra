# IA oficial y WhatsApp de Desk en el RMS

Desk es la marca, la autenticación y la aplicación de cara al cliente. Tras
iniciar sesión, el usuario elige entre las empresas a las que Rekov le dio
acceso; todas usan la misma aplicación en `desk.rekov.co`. El RMS mantiene
ventas, inventario, cajas, sucursales, canales y operación offline.

## WhatsApp

Se reutiliza la App Meta de Desk ya aprobada y la API oficial de WhatsApp Cloud.
Embedded Signup conecta cada cuenta de negocio desde Configuración; los tokens
resultantes se guardan cifrados en el RMS. La misma App Meta tiene un único
callback de webhook: `https://api.desk.rekov.co/functions/v1/meta-whatsapp-webhook`.
No se crea otra App ni se usa Evolution API. `META_APP_ID`,
`WHATSAPP_EMBEDDED_CONFIG_ID`, `META_APP_SECRET` y
`META_WEBHOOK_VERIFY_TOKEN` deben corresponder a la configuración aprobada que
ya usa Desk.

## IA

El agente que ya trae el RMS conserva sus instrucciones por sucursal, historial,
RAG y herramientas comerciales: búsqueda de catálogo, cotización, pedidos y
transferencia humana. Se cambió su proveedor OpenRouter por la API oficial de
Cloudflare Workers AI, usando el modelo de producción que Desk tiene configurado
(`@cf/deepseek-ai/deepseek-v4.1-flash-1017`) y BGE-M3 para embeddings. OCR de
facturas también usa Workers AI. No se crea otro agente ni otro Worker.

La llamada sale de las Edge Functions de Supabase hacia la API OpenAI-compatible
de Workers AI con un token de solo lectura. Así se conserva el contrato nativo
de herramientas del RMS sin depender de rutas `/v1/ai-order-agent` que Desk no
expone. El chat dentro de Desk reutiliza el mismo agente en modo de prueba: busca
y cotiza, pero nunca crea pedidos ni envía mensajes. El tráfico real de clientes
llega por el webhook Meta oficial y sí usa el flujo completo de pedidos.

No se requiere una clave de proveedor LLM en el RMS. No enviar `service_role`,
credenciales Meta o secretos de negocio al navegador. JCFlow captura sus claves
por negocio/sucursal y las cifra con `TENANT_SECRETS_ENCRYPTION_KEY`.
