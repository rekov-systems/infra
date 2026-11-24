# Business Flows

This document describes the main business flows of POS S360T. Each flow is presented as a sequence diagram so operators and contributors can understand the order of operations and the systems involved.

---

## 1. Quick Sale (POS Terminal)

A cashier scans or searches products, applies modifiers, selects payment methods, and closes the sale.

```mermaid
sequenceDiagram
    participant Cashier as Cashier
    participant POS as POS Module
    participant Cart as Cart Store
    participant DB as Supabase DB

    Cashier->>POS: Scan/search product
    POS->>Cart: Add item with quantity
    Cashier->>POS: Add modifiers (optional)
    POS->>Cart: Update item modifiers
    Cashier->>POS: Select payment methods
    POS->>DB: checkout_sale RPC
    DB->>DB: Create sale + items + payments
    DB->>DB: Apply inventory movement
    DB-->>POS: Sale receipt
    POS->>Cashier: Print ticket / show success
```

---

## 2. Table Service and Kitchen Display System (KDS)

Waiters take orders by table. Items are sent to the kitchen, prepared, and dispatched.

```mermaid
sequenceDiagram
    participant Waiter as Waiter
    participant Tables as Tables Module
    participant KDS as KDS Module
    participant DB as Supabase DB

    Waiter->>Tables: Select table
    Waiter->>Tables: Add items to order
    Tables->>DB: Upsert table_order + items
    Waiter->>Tables: Send to kitchen
    Tables->>DB: send_table_order_to_kitchen RPC
    DB-->>KDS: Realtime update
    KDS->>Kitchen: Show pending items
    Kitchen->>KDS: Mark item ready
    KDS->>DB: mark_table_item_ready RPC
    Waiter->>Tables: Close table / checkout
    Tables->>DB: checkout_table_order RPC
```

---

## 3. Delivery Order

A delivery order is registered, prepared, assigned to a courier, and paid.

```mermaid
sequenceDiagram
    participant Cashier as Cashier
    participant Delivery as Delivery Module
    participant Courier as Courier Dashboard
    participant DB as Supabase DB

    Cashier->>Delivery: Register delivery order
    Delivery->>DB: register_delivery_order RPC
    DB->>DB: Create order + reserve stock
    Delivery->>DB: Update status (preparing → ready)
    Cashier->>Delivery: Assign courier
    Delivery->>Courier: Notify assignment
    Courier->>Courier: Mark dispatched
    Courier->>DB: update_delivery_status RPC
    Courier->>DB: register_delivery_payment RPC
    DB-->>Delivery: Updated order
```

---

## 4. Rappi Digital Order

Rappi sends orders via webhook. The POS accepts or rejects them and updates status back to Rappi.

```mermaid
sequenceDiagram
    participant Rappi as Rappi
    participant EF as rappi-webhook Edge Function
    participant POS as Digital Orders Module
    participant Action as rappi-order-action Edge Function
    participant DB as Supabase DB

    Rappi->>EF: new_order webhook
    EF->>EF: Verify HMAC signature
    EF->>DB: register_digital_order RPC
    DB-->>POS: Realtime new order
    POS->>Cashier: Show pending Rappi order
    Cashier->>POS: Accept order
    POS->>Action: POST accept action
    Action->>Rappi: PUT order/{id}/accept
    Action-->>POS: Accepted
    Cashier->>POS: Mark ready / dispatched
    POS->>Action: POST ready/dispatched action
    Action->>Rappi: Update status
```

---

## 5. Inventory Movement

All stock changes go through `apply_inventory_movement`. This ensures the kardex is always consistent.

```mermaid
sequenceDiagram
    participant User as User
    participant Module as Inventory / POS / Production
    participant DB as Supabase DB

    User->>Module: Create movement (purchase, sale, adjustment, transfer)
    Module->>DB: apply_inventory_movement RPC
    DB->>DB: Validate stock (unless dev_mode)
    DB->>DB: Update inventory_stocks
    DB->>DB: Insert inventory_movements (kardex)
    DB-->>Module: Movement result
```

---

## 6. Production / Kitchen Order

A production order consumes raw materials and produces finished goods.

```mermaid
sequenceDiagram
    participant Kitchen as Kitchen User
    participant Prod as Production Module
    participant DB as Supabase DB

    Kitchen->>Prod: Create production order
    Prod->>DB: Insert production_order + consumptions
    Kitchen->>Prod: Mark complete
    Prod->>DB: complete_production_order RPC
    DB->>DB: Consume inputs (apply_inventory_movement)
    DB->>DB: Produce outputs (apply_inventory_movement)
    DB-->>Prod: Updated stock
```

---

## 7. Cash Register Session

A cashier opens a session, sells, moves cash in/out, and closes with reconciliation.

```mermaid
sequenceDiagram
    participant Cashier as Cashier
    participant Cash as Cash Module
    participant DB as Supabase DB

    Cashier->>Cash: Open session
    Cash->>DB: Insert cash_sessions (opening amount)
    Cashier->>Cash: Sales / cash movements
    Cash->>DB: add_cash_movement RPC
    Cashier->>Cash: Close session
    Cash->>DB: close_cash_session RPC
    DB->>DB: Reconcile expected vs counted
    DB-->>Cash: Closeout report
```

---

## 8. WhatsApp AI Order Agent

Customers order through WhatsApp. The AI agent uses tools to search the catalog, quote, and create orders.

```mermaid
sequenceDiagram
    participant Customer as Customer (WhatsApp)
    participant Evo as Evolution API
    participant EF as ai-order-agent Edge Function
    participant LLM as OpenRouter LLM
    participant DB as Supabase DB

    Customer->>Evo: "I want 2 empanadas and a juice"
    Evo->>EF: evolution-webhook
    EF->>EF: Verify signature + timestamp
    EF->>DB: Load conversation context
    EF->>LLM: Send message + tool definitions
    LLM->>EF: Call search_catalog("empanadas")
    EF->>DB: ai_search_catalog RPC
    DB-->>EF: Matching products
    EF->>LLM: Catalog results
    LLM->>EF: Call quote_order([...])
    EF->>DB: Calculate totals
    DB-->>EF: Order summary
    EF->>LLM: Summary
    LLM-->>EF: Reply + ask for confirmation
    EF->>Customer: "Summary: 2 empanadas + juice = $12. Confirm?"
    Customer->>Evo: "Yes"
    Evo->>EF: Webhook
    EF->>LLM: Confirmation
    LLM->>EF: Call create_order(..., delivery_address)
    EF->>DB: create_qr_order / register_delivery_order
    EF->>Customer: "Order created. We'll notify you when it ships."
```

---

## 9. QR Self-Ordering

Customers scan a QR code, see the digital menu, and place an order directly.

```mermaid
sequenceDiagram
    participant Customer as Customer Phone
    participant Catalog as Public Catalog Page
    participant DB as Supabase DB
    participant KDS as KDS / POS

    Customer->>Catalog: Scan QR at table
    Catalog->>DB: get_branch_menu RPC
    DB-->>Catalog: Menu + prices
    Customer->>Catalog: Add items + modifiers
    Customer->>Catalog: Submit order
    Catalog->>DB: create_qr_order RPC
    DB->>DB: Create table_order or delivery_order
    DB-->>KDS: Realtime new order
```

---

## 10. Invoice OCR

A user uploads a supplier invoice image and the system extracts line items with Gemini.

```mermaid
sequenceDiagram
    participant User as Inventory User
    participant UI as Process Invoice UI
    participant EF as process-invoice Edge Function
    participant Gemini as Google Gemini
    participant DB as Supabase DB

    User->>UI: Upload invoice image
    UI->>EF: POST image + tenant + branch
    EF->>EF: Validate user role
    EF->>Gemini: generateContent with structured prompt
    Gemini-->>EF: Extracted JSON products
    EF-->>UI: Product lines
    User->>UI: Review and confirm
    UI->>DB: Create products + apply_inventory_movement
```

---

## Flow Summary Table

| Flow | Entry Point | Key RPC / Function |
|------|-------------|--------------------|
| Quick sale | `/pos` | `checkout_sale` |
| Table order | `/tables/:id` | `checkout_table_order` |
| Delivery | `/delivery` | `register_delivery_order` |
| Rappi order | `rappi-webhook` Edge Function | `register_digital_order` |
| Inventory movement | `/inventory` | `apply_inventory_movement` |
| Production | `/production` | `complete_production_order` |
| Cash session | `/cash` | `close_cash_session` |
| WhatsApp order | `evolution-webhook` → `ai-order-agent` | `create_qr_order` / `register_delivery_order` |
| QR order | `/qr-menu` | `create_qr_order` |
| Invoice OCR | `/inventory` → upload | `process-invoice` Edge Function |
