import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyRappiSignature } from "../_shared/rappi.ts";
import {
  checkRateLimit,
  getClientIp,
  isIpAllowed,
  jsonResponse,
  logWebhook,
  requestIdFrom,
  timestampIsFresh,
} from "../_shared/webhook-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rappi-signature, x-rappi-timestamp, x-request-id",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveProductId(tenantId: string, item: any): Promise<string | null> {
  const rawId = String(item.product_id ?? item.productId ?? item.pos_product_id ?? item.id ?? "");
  const name = String(item.name ?? item.product_name ?? item.title ?? "").trim();

  // 1. Direct UUID
  if (UUID_RE.test(rawId)) {
    const { data } = await supabase.from("products").select("id")
      .eq("id", rawId).eq("tenant_id", tenantId).maybeSingle();
    if (data?.id) return data.id;
  }

  // 2. rappi_product_id field
  if (rawId) {
    const { data } = await supabase.from("products").select("id")
      .eq("rappi_product_id", rawId).eq("tenant_id", tenantId).maybeSingle();
    if (data?.id) return data.id;
  }

  // 3. Exact name match (case-insensitive)
  if (name) {
    const { data } = await supabase.from("products").select("id")
      .eq("tenant_id", tenantId).ilike("name", name).eq("status", "active").maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const requestId = requestIdFrom(req);
  const ip = getClientIp(req);

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed", request_id: requestId }, 405, corsHeaders);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-rappi-signature");
  const timestamp = req.headers.get("x-rappi-timestamp");

  const rate = checkRateLimit(`rappi:${ip}`, 180, 60_000);
  if (!rate.ok) {
    logWebhook("warn", "rappi_webhook_rate_limited", { request_id: requestId, ip });
    return jsonResponse({ ok: false, error: "Rate limit exceeded", request_id: requestId }, 429, corsHeaders);
  }

  if (!isIpAllowed(req, Deno.env.get("RAPPI_IP_ALLOWLIST"))) {
    logWebhook("warn", "rappi_webhook_ip_rejected", { request_id: requestId, ip });
    return jsonResponse({ ok: false, error: "IP not allowed", request_id: requestId }, 403, corsHeaders);
  }

  if (!timestampIsFresh(timestamp)) {
    logWebhook("warn", "rappi_webhook_stale_timestamp", { request_id: requestId, ip, timestamp });
    return jsonResponse({ ok: false, error: "Stale or invalid timestamp", request_id: requestId }, 401, corsHeaders);
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch {
    await supabase.from("rappi_webhook_logs").insert({
      event_type: "invalid", status: "error", error: "Invalid JSON", payload: { raw: rawBody.slice(0, 1000) },
    });
    logWebhook("warn", "rappi_webhook_invalid_json", { request_id: requestId, ip });
    return jsonResponse({ ok: false, error: "Invalid JSON", request_id: requestId }, 400, corsHeaders);
  }

  const valid = await verifyRappiSignature(rawBody, signature, timestamp);
  if (!valid) {
    await supabase.from("rappi_webhook_logs").insert({
      event_type: payload?.event_type ?? "unknown", status: "rejected",
      error: "Invalid signature", payload,
    });
    logWebhook("warn", "rappi_webhook_invalid_signature", { request_id: requestId, ip });
    return jsonResponse({ ok: false, error: "Invalid signature", request_id: requestId }, 401, corsHeaders);
  }

  const eventType: string = payload.event_type ?? payload.event ?? payload.type ?? "order_event";
  const storeId: string | undefined =
    String(payload.store_id ?? payload.storeId ?? payload?.order?.store_id ?? "") || undefined;
  const rappiOrderId: string | undefined =
    String(payload.order_id ?? payload?.order?.id ?? payload.id ?? "") || undefined;
  const externalStatus: string | undefined =
    payload.status ?? payload.order_status ?? payload?.order?.status;

  let tenantId: string | null = null;
  let branchId: string | null = null;
  if (storeId) {
    const { data: integ } = await supabase.from("rappi_integrations").select("tenant_id, branch_id")
      .eq("store_id", storeId).maybeSingle();
    if (integ) { tenantId = integ.tenant_id; branchId = integ.branch_id; }
  }

  await supabase.from("rappi_webhook_logs").insert({
    tenant_id: tenantId, branch_id: branchId, store_id: storeId,
    event_type: eventType, rappi_order_id: rappiOrderId, payload, status: "received",
  });

  try {
    if (eventType.includes("new") || eventType === "order_created") {
      if (!tenantId || !branchId) {
        await supabase.from("rappi_webhook_logs").insert({
          store_id: storeId, event_type: eventType, payload,
          status: "error", error: "Sucursal no encontrada para store_id",
        });
      } else {
        const items: any[] = payload.items ?? payload?.order?.items ?? [];
        const gross = items.length > 0
          ? items.reduce((s, it) => s + (Number(it.total ?? it.unit_price ?? 0) * Number(it.quantity ?? 1)), 0)
          : Number(payload.total_value ?? payload?.order?.total ?? 0);
        const commission = Number(payload.commission ?? 0);

        const { data: orderRow, error: orderError } = await supabase.from("digital_orders").upsert({
          tenant_id: tenantId, branch_id: branchId, channel: "rappi",
          rappi_order_id: rappiOrderId, external_order_number: rappiOrderId,
          gross_total: gross, platform_commission: commission,
          net_total: Math.max(0, gross - commission),
          status: "received", external_status: externalStatus ?? "pending",
          external_payload: payload, notes: payload.notes ?? null,
        }, { onConflict: "rappi_order_id" }).select("id, sale_id").single();
        if (orderError) throw orderError;

        if (orderRow?.id && !orderRow.sale_id && items.length > 0) {
          await supabase.from("digital_order_items").delete().eq("digital_order_id", orderRow.id);

          // Resolve product IDs in parallel
          const resolvedIds = await Promise.all(items.map(it => resolveProductId(tenantId!, it)));

          const itemRows = items.map((it, idx) => {
            const quantity = Number(it.quantity ?? it.qty ?? 1);
            const unitPrice = Number(it.unit_price ?? it.price ?? (Number(it.total ?? 0) / Math.max(quantity, 1)));
            const taxRate = Number(it.tax_rate ?? it.taxRate ?? 0);
            const lineTotal = Number(it.total ?? it.total_price ?? (unitPrice * quantity * (1 + taxRate / 100)));
            return {
              tenant_id: tenantId,
              digital_order_id: orderRow.id,
              product_id: resolvedIds[idx],
              external_product_id: String(it.id ?? it.product_id ?? it.sku ?? ""),
              product_name: String(it.name ?? it.product_name ?? it.title ?? "Producto Rappi"),
              quantity, unit_price: unitPrice, tax_rate: taxRate,
              discount: Number(it.discount ?? 0),
              line_total: lineTotal, raw_payload: it,
            };
          });

          const { error: itemsError } = await supabase.from("digital_order_items").insert(itemRows);
          if (itemsError) throw itemsError;

          // Log unresolved items so operators can map rappi_product_id later
          const unresolved = items.filter((_, idx) => !resolvedIds[idx]).map(it =>
            String(it.name ?? it.product_name ?? it.id ?? "")
          );
          if (unresolved.length > 0) {
            await supabase.from("rappi_webhook_logs").insert({
              tenant_id: tenantId, branch_id: branchId, store_id: storeId,
              event_type: "unresolved_products", rappi_order_id: rappiOrderId,
              payload: { unresolved_products: unresolved }, status: "warning",
              error: `${unresolved.length} producto(s) no encontrado(s) en catálogo: ${unresolved.join(", ")}`,
            });
          }
        }
      }
    } else if (rappiOrderId) {
      await supabase.from("digital_orders")
        .update({ external_status: externalStatus ?? null, external_payload: payload })
        .eq("rappi_order_id", rappiOrderId);
    }
  } catch (e) {
    await supabase.from("rappi_webhook_logs").insert({
      tenant_id: tenantId, branch_id: branchId, store_id: storeId,
      event_type: eventType, rappi_order_id: rappiOrderId, payload,
      status: "error", error: e instanceof Error ? e.message : String(e),
    });
  }

  return jsonResponse({ ok: true, request_id: requestId }, 200, corsHeaders);
});
