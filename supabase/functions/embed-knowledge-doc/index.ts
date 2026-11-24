import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service role client for data operations (bypasses RLS)
const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DIMS = 768;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(null, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Per-request user client — the correct pattern for JWT validation in edge functions
  const auth = req.headers.get("authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { doc_id, tenant_id, branch_id } = await req.json().catch(() => ({}));
  if (!doc_id || !tenant_id || !branch_id) {
    return json({ error: "doc_id, tenant_id and branch_id are required" }, 400);
  }

  // Fetch doc content
  const { data: doc, error: docErr } = await adminSupabase
    .from("ai_knowledge_docs")
    .select("id, content")
    .eq("id", doc_id)
    .eq("tenant_id", tenant_id)
    .eq("branch_id", branch_id)
    .single();

  if (docErr || !doc) return json({ error: "Document not found" }, 404);

  // Generate embedding via OpenRouter
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY not configured" }, 500);

  const embedRes = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: doc.content,
      dimensions: DIMS,
    }),
  });

  if (!embedRes.ok) {
    const errText = await embedRes.text().catch(() => "");
    return json({ error: `OpenRouter error ${embedRes.status}: ${errText}` }, 500);
  }

  const embedData = await embedRes.json();
  const embedding: number[] = embedData?.data?.[0]?.embedding;
  if (!embedding || embedding.length !== DIMS) {
    return json({ error: `Unexpected embedding dimensions: ${embedding?.length}` }, 500);
  }

  // Store embedding
  const vectorLiteral = `[${embedding.join(",")}]`;
  const { error: updateErr } = await adminSupabase
    .from("ai_knowledge_docs")
    .update({ embedding: vectorLiteral })
    .eq("id", doc_id);

  if (updateErr) return json({ error: updateErr.message }, 500);

  return json({ ok: true, dims: DIMS });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
