import { createClient } from "npm:@supabase/supabase-js@2";
import { getRappiToken, rappiFetch } from "../_shared/rappi.ts";

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
  try { body = await req.json(); } catch { body = {}; }
  const storeId: string | undefined = body.store_id;
  const branchId: string | undefined = body.branch_id;
  if (!branchId) return json({ error: "Missing branch_id" }, 400);

  const { data: integ, error: integErr } = await supabase
    .from("rappi_integrations")
    .select("tenant_id, branch_id")
    .eq("branch_id", branchId)
    .maybeSingle();
  if (integErr || !integ) return json({ error: "Integración Rappi no configurada para esta sucursal" }, 404);

  const { data: allowed, error: roleErr } = await supabase.rpc("has_branch_role", {
    _user_id: user.id,
    _tenant_id: integ.tenant_id,
    _branch_id: integ.branch_id,
    _roles: ["owner", "admin", "manager"],
  });
  if (roleErr || !allowed) return json({ error: "Forbidden" }, 403);

  try {
    const token = await getRappiToken();
    const tokenOk = !!token;

    let storeOk = true;
    let storeDetails: any = null;
    if (storeId) {
      const r = await rappiFetch(`/api/v2/restaurants-bo/stores/${storeId}`, { method: "GET" });
      storeOk = r.status < 400;
      storeDetails = r.body;
    }

    return json({ ok: tokenOk && storeOk, token: tokenOk, store: storeOk, storeDetails });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 200);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
