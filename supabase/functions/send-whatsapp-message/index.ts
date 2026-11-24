import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // Verify the JWT belongs to an authenticated user with the right role
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));

  type InteractivePayload =
    | { type: "buttons"; text: string; buttons: { id: string; title: string }[]; footer?: string }
    | { type: "list"; text: string; list_button_text: string; sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]; footer?: string };

  const { __connection_test, conversation_id, text, tenant_id, branch_id, interactive } = body as {
    __connection_test?: boolean;
    conversation_id?: string;
    text?: string;
    tenant_id?: string;
    branch_id?: string;
    interactive?: InteractivePayload;
  };

  let target_tenant = tenant_id;
  let target_branch = branch_id;
  let conv = null;

  if (!__connection_test) {
    const hasContent = text?.trim() || interactive;
    if (!conversation_id || !hasContent) return json({ error: "conversation_id and (text or interactive) required" }, 400);

    // Load conversation
    const { data } = await supabase
      .from("ai_conversations")
      .select("id, tenant_id, branch_id, channel, external_conversation_id, customer_phone")
      .eq("id", conversation_id)
      .single();
    if (!data) return json({ error: "Conversation not found" }, 404);
    conv = data;
    target_tenant = conv.tenant_id;
    target_branch = conv.branch_id;
  }

  if (!target_tenant || !target_branch) {
    return json({ error: "tenant_id and branch_id are required for authorization" }, 400);
  }

  // Check user has access to this specific tenant/branch.
  const { data: allowed, error: roleErr } = await supabase.rpc("has_branch_role", {
    _user_id: user.id,
    _tenant_id: target_tenant,
    _branch_id: target_branch,
    _roles: ["owner", "admin", "manager", "cashier"],
  });
  if (roleErr || !allowed) {
    return json({ error: "Forbidden" }, 403);
  }

  // ── Connection / diagnostics test (no side-effects) ──────────
  if (__connection_test) {
    const baseUrl = Deno.env.get("EVOLUTION_API_URL");
    const apiKey  = Deno.env.get("EVOLUTION_API_KEY");
    return json({
      ok: false,
      error: "connection diagnostics",
      diagnostics: {
        evolution_api_url_set: !!baseUrl,
        evolution_api_key_set: !!apiKey,
        user_id: user.id,
      },
    }, 200);
  }

  // Get Evolution config for this branch
  // conv is guaranteed non-null here (connection_test path returned early above)
  const { data: config } = await supabase
    .from("ai_channel_configs")
    .select("config, phone_number")
    .eq("branch_id", conv!.branch_id)
    .eq("channel", "whatsapp")
    .eq("is_active", true)
    .maybeSingle();

  const instance = (config?.config as any)?.evolution_instance;
  const remoteJid = conv.customer_phone
    ? `${conv.customer_phone.replace(/\D/g, "")}@s.whatsapp.net`
    : null;

  // Send via Evolution API – capture errors for logging
  let evolutionOk = false;
  let evolutionError: string | null = null;

  if (instance && remoteJid) {
    const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
    const apiKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!baseUrl || !apiKey) {
      evolutionError = "EVOLUTION_API_URL or EVOLUTION_API_KEY not set in Edge Function secrets";
      console.error("[send-whatsapp] " + evolutionError);
    } else {
      const number = remoteJid.replace(/@.*/, "");
      try {
        let endpoint: string;
        let evoBody: Record<string, unknown>;

        if (interactive?.type === "buttons") {
          endpoint = `${baseUrl}/message/sendButtons/${instance}`;
          evoBody = {
            number,
            description: interactive.text,
            footer: interactive.footer ?? "",
            buttons: interactive.buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: String(b.title).slice(0, 20) },
            })),
          };
        } else if (interactive?.type === "list") {
          endpoint = `${baseUrl}/message/sendList/${instance}`;
          evoBody = {
            number,
            description: interactive.text,
            footer: interactive.footer ?? "",
            buttonText: interactive.list_button_text ?? "Ver opciones",
            sections: interactive.sections.map((s) => ({
              title: s.title,
              rows: s.rows.map((r) => ({
                rowId: r.id,
                title: String(r.title).slice(0, 24),
                description: r.description ? String(r.description).slice(0, 72) : undefined,
              })),
            })),
          };
        } else {
          endpoint = `${baseUrl}/message/sendText/${instance}`;
          evoBody = { number, text: text!.trim() };
        }

        const evoRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify(evoBody),
        });
        if (!evoRes.ok) {
          const errBody = await evoRes.text().catch(() => "");
          evolutionError = `Evolution API HTTP ${evoRes.status}: ${errBody}`;
          console.error("[send-whatsapp] " + evolutionError);
        } else {
          evolutionOk = true;
        }
      } catch (e: any) {
        evolutionError = `Evolution API fetch failed: ${e?.message ?? e}`;
        console.error("[send-whatsapp] " + evolutionError);
      }
    }
  } else {
    if (!instance) evolutionError = "No evolution_instance configured for this branch";
    else if (!remoteJid) evolutionError = "No customer_phone in conversation";
  }

  const messageBody = interactive ? JSON.stringify(interactive) : text!.trim();

  // Save the outbound message
  await supabase.from("ai_messages").insert({
    tenant_id: conv!.tenant_id,
    conversation_id: conversation_id,
    direction: "outbound",
    body: messageBody,
    payload: {
      sent_by_user: user.id,
      sent_by_email: user.email,
      evolution_ok: evolutionOk,
      evolution_error: evolutionError ?? undefined,
      interactive_type: interactive?.type ?? undefined,
    },
  });

  // Reopen conversation if it was handoff (operator responded)
  await supabase.from("ai_conversations")
    .update({ status: "open", last_message_at: new Date().toISOString() })
    .eq("id", conversation_id);

  return json({
    ok: true,
    evolution_sent: evolutionOk,
    ...(evolutionError ? { evolution_warning: evolutionError } : {}),
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
