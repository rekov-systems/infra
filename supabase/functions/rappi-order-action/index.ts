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
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

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

  const { order_id, action, prep_time_min, reason } = body ?? {};
  if (!order_id || !action) return json({ error: "Missing order_id/action" }, 400);

  const { data: localOrder, error: localOrderErr } = await supabase
    .from("digital_orders")
    .select("tenant_id, branch_id")
    .eq("rappi_order_id", String(order_id))
    .maybeSingle();
  if (localOrderErr) return json({ error: localOrderErr.message }, 500);
  if (!localOrder) return json({ error: "Rappi order not found locally" }, 404);

  const { data: allowed, error: roleErr } = await supabase.rpc("has_branch_role", {
    _user_id: user.id,
    _tenant_id: localOrder.tenant_id,
    _branch_id: localOrder.branch_id,
    _roles: ["owner", "admin", "manager"],
  });
  if (roleErr || !allowed) return json({ error: "Forbidden" }, 403);

  // Map action -> Rappi endpoint
  // Common actions: take, reject, ready, dispatched (en algunas versiones: in_kitchen)
  const endpointMap: Record<string, string> = {
    take: `/api/v2/restaurants-bo/orders/${order_id}/take`,
    accept: `/api/v2/restaurants-bo/orders/${order_id}/take`,
    reject: `/api/v2/restaurants-bo/orders/${order_id}/reject`,
    ready: `/api/v2/restaurants-bo/orders/${order_id}/ready`,
    dispatched: `/api/v2/restaurants-bo/orders/${order_id}/dispatched`,
  };
  const path = endpointMap[action];
  if (!path) return json({ error: `Unknown action: ${action}` }, 400);

  const payload: any = {};
  if (action === "take" || action === "accept") payload.cooking_time = prep_time_min ?? 15;
  if (action === "reject") payload.reason = reason ?? "out_of_stock";

  try {
    const { status, body: respBody } = await rappiFetch(path, {
      method: "PUT",
      body: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
    });
    if (status >= 400) {
      return json({ error: `Rappi ${status}`, details: respBody }, 502);
    }

    // Update local digital_orders status (best-effort, using service role to bypass RLS for update)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const localStatusMap: Record<string, string> = {
      take: "accepted", accept: "accepted",
      reject: "rejected", ready: "ready", dispatched: "dispatched",
    };
    await admin.from("digital_orders")
      .update({ external_status: localStatusMap[action] ?? action })
      .eq("rappi_order_id", String(order_id))
      .eq("tenant_id", localOrder.tenant_id)
      .eq("branch_id", localOrder.branch_id);

    return json({ ok: true, rappi_response: respBody });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
