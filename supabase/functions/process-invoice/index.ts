import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-1.5-flash";

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      }
    });
  }

  try {
    const body = await req.json();
    const { image, mime_type = "image/jpeg", tenant_id, branch_id } = body;

    if (!image || !tenant_id || !branch_id) {
      return new Response(JSON.stringify({ error: "image, tenant_id and branch_id are required" }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const { data: allowed, error: roleErr } = await supabase.rpc("has_branch_role", {
      _user_id: user.id,
      _tenant_id: tenant_id,
      _branch_id: branch_id,
      _roles: ["owner", "admin", "manager", "inventory"],
    });

    if (roleErr || !allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { 
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), { status: 500 });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Analiza esta factura de proveedor. Extrae los productos, cantidades y precios unitarios. Responde estrictamente con un JSON en este formato: { \"products\": [{ \"name\": \"string\", \"quantity\": number, \"unit_price\": number, \"total\": number }] }. Si hay impuestos (IVA), usa el precio antes de impuestos." },
            {
              inline_data: {
                mime_type,
                data: image
              }
            }
          ]
        }],
        generationConfig: {
          response_mime_type: "application/json",
        }
      })
    });

    const result = await response.json();
    const textResponse = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      return new Response(JSON.stringify({ error: "Gemini did not return OCR content" }), { status: 502 });
    }
    const parsed = JSON.parse(textResponse);

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
