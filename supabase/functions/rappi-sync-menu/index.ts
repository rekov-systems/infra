import { createClient } from "npm:@supabase/supabase-js@2";
import { rappiFetch } from "../_shared/rappi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );
  const token = auth.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { branch_id } = body ?? {};
  if (!branch_id) return json({ error: "Missing branch_id" }, 400);

  const { data: integ, error: integErr } = await supabase
    .from("rappi_integrations").select("*").eq("branch_id", branch_id).maybeSingle();
  if (integErr || !integ) return json({ error: "Integración Rappi no configurada para esta sucursal" }, 404);

  const tenantId = integ.tenant_id;
  const storeId = integ.store_id;

  const { data: allowed, error: roleErr } = await supabase.rpc("has_branch_role", {
    _user_id: user.id,
    _tenant_id: tenantId,
    _branch_id: branch_id,
    _roles: ["owner", "admin", "manager"],
  });
  if (roleErr || !allowed) return json({ error: "Forbidden" }, 403);

  // Build menu from catalog
  const [{ data: cats }, { data: prods }, { data: bps }, { data: cps }] = await Promise.all([
    supabase.from("categories").select("id, name, sort_order").eq("tenant_id", tenantId).eq("status", "active"),
    supabase.from("products")
      .select("id, name, price, category_id, image_url, sku, status")
      .eq("tenant_id", tenantId).eq("status", "active").neq("product_type", "ingredient"),
    supabase.from("branch_products")
      .select("product_id, is_available, local_price").eq("branch_id", branch_id),
    supabase.from("product_channel_prices")
      .select("product_id, branch_id, channel, price")
      .eq("tenant_id", tenantId).eq("channel", "rappi"),
  ]);

  const bpMap = new Map((bps ?? []).map((b) => [b.product_id, b]));
  const cpMap = new Map<string, number>();
  (cps ?? []).forEach((p) => {
    if (p.branch_id === branch_id) cpMap.set(p.product_id, Number(p.price));
  });
  (cps ?? []).forEach((p) => {
    if (p.branch_id === null && !cpMap.has(p.product_id)) cpMap.set(p.product_id, Number(p.price));
  });

  const items = (prods ?? [])
    .filter((p) => {
      const bp = bpMap.get(p.id);
      return !bp || bp.is_available;
    })
    .map((p) => {
      const bp = bpMap.get(p.id);
      const price = cpMap.get(p.id) ?? bp?.local_price ?? Number(p.price);
      return {
        id: p.id,
        name: p.name,
        price: Number(price),
        sku: p.sku ?? p.id,
        category_id: p.category_id ?? "general",
        image_url: p.image_url ?? null,
        is_available: true,
      };
    });

  const menuPayload = {
    store_id: storeId,
    categories: (cats ?? []).map((c) => ({ id: c.id, name: c.name, sort_order: c.sort_order ?? 0 })),
    items,
    updated_at: new Date().toISOString(),
  };

  try {
    const { status, body: resp } = await rappiFetch(
      `/api/v2/restaurants-integrations-public-api/menu/${storeId}`,
      { method: "PUT", body: JSON.stringify(menuPayload) }
    );
    if (status >= 400) return json({ error: `Rappi ${status}`, details: resp, sent: { itemsCount: items.length } }, 502);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("rappi_integrations")
      .update({ last_menu_sync_at: new Date().toISOString() })
      .eq("id", integ.id);

    return json({ ok: true, items: items.length, rappi_response: resp });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
