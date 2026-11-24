# Esquema de Base de Datos — POS S360T

Este documento detalla la estructura de la base de datos en Supabase (PostgreSQL), incluyendo tablas, relaciones y lógica de negocio implementada vía RPC/Triggers.

## Arquitectura de Multi-tenancy

El sistema utiliza un esquema de **aislamiento por columna (`tenant_id`)** reforzado con **Row Level Security (RLS)**.

- **`tenants`**: Entidad raíz. Define el negocio, configuración global (impuestos, puntos, stock negativo).
- **`branches`**: Sucursales pertenecientes a un tenant.
- **`user_roles`**: Vincula `auth.users` con un `tenant_id` y opcionalmente un `branch_id`. Roles disponibles: `owner`, `admin`, `manager`, `cashier`, `waiter`, `courier`, `inventory`, `kitchen`, `super_admin`.

---

## Módulo: Productos y Menú

### Tablas Core
- **`products`**: Catálogo maestro. Incluye `product_type` (`simple`, `composite`, `combo`, `production`, `ingredient`).
- **`categories`**: Organización jerárquica con soporte para horarios (`schedule_enabled`).
- **`product_components`**: Define recetas para productos tipo `composite`.
- **`branch_products`**: Sobreescritura de precios (`local_price`) y disponibilidad por sucursal.

### Modificadores y Complementos
- **`modifier_groups`**: Grupos de opciones (ej. "Término de la carne", "Adiciones"). Define min/max selecciones.
- **`modifier_options`**: Opciones dentro de un grupo con su respectivo `price_delta`.
- **`product_complementaries`**: Relaciones N:N para sugerencias de upselling.

---

## Módulo: Inventario (Kardex)

- **`inventory_centers`**: Bodegas o puntos de almacenamiento físicos por sucursal.
- **`inventory_stocks`**: Tabla de saldos actuales (atómica). Unicidad por `(inventory_center_id, product_id)`.
- **`inventory_movements`**: Registro histórico de cada entrada/salida.
- **RPC `apply_inventory_movement`**: Única función autorizada para modificar stock, garantizando consistencia y validando stock negativo según configuración del tenant.
- **RPC `audit_inventory_drift`**: Asegura que todos los productos activos tengan una entrada de stock (evita desajustes por productos nuevos sin registro inicial).

---

## Módulo: Ventas y POS

- **`sales`**: Cabecera de la venta. Soporta múltiples canales (`pos`, `tables`, `delivery`, `rappi`, etc.).
- **`sale_items`**: Líneas de detalle. Almacena `modifiers` como `jsonb` para persistencia histórica.
- **`payments`**: Soporta pagos mixtos (`cash`, `card`, `transfer`, `qr`).
- **`operation_log`**: Garantiza la **idempotencia** de las transacciones offline mediante `client_mutation_id`.

### Mesas (Dine-in)
- **`tables`**: Estado físico de la mesa (`available`, `occupied`, `reserved`).
- **`table_orders`**: Comandas abiertas.
- **`table_order_items`**: Estado por ítem (`pending`, `preparing`, `ready`, `dispatched`, `cancelled`).

---

## Módulo: Caja (Cash Management)

- **`cash_registers`**: Definición de cajas físicas.
- **`cash_sessions`**: Aperturas y cierres de turno. Registra arqueo esperado vs contado.
- **`cash_movements`**: Entradas (`in`) y salidas (`out`) de efectivo no relacionadas con ventas directas.

---

## Módulo: Inteligencia Artificial y Omnicanalidad

- **`ai_channel_configs`**: Configuración de LLM (Gemini/OpenAI) y prompts por canal.
- **`ai_conversations`**: Estado de la sesión de chat con el cliente.
- **`ai_messages`**: Historial de mensajes.
- **`ai_knowledge_docs`**: Fragmentos de texto con `embedding` (vector) para búsqueda semántica (RAG).
- **`digital_orders`**: Buffer de entrada para pedidos de plataformas externas (Rappi, QR, WhatsApp).

---

## Módulo: Infraestructura de Comunicaciones

- **`email_send_log`**: Cola de salida y estado de envío.
- **`suppressed_emails`**: Gestión de rebotados y desuscripciones para proteger la reputación del dominio.

---

## Convenciones de Seguridad (RLS)

1. **`is_tenant_member(uid, tenant_id)`**: Acceso básico de lectura.
2. **`has_any_role(uid, tenant_id, roles[])`**: Acceso a operaciones de gestión.
3. **`has_branch_role(uid, tenant_id, branch_id, roles[])`**: Acceso restringido a la sucursal activa.
4. **`super_admin`**: Bypass de RLS para soporte técnico global.
