const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  const base = Deno.env.get("DESK_AI_WORKER_URL");
  const authorization = request.headers.get("authorization");
  if (!base || !authorization) return Response.json({ error: "Desk AI integration is not configured" }, { status: 503, headers: corsHeaders });

  const target = new URL("ai-order-agent", base.endsWith("/") ? base : `${base}/`);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      authorization,
      "content-type": request.headers.get("content-type") ?? "application/json",
      ...(request.headers.has("apikey") ? { apikey: request.headers.get("apikey")! } : {}),
    },
    body: await request.arrayBuffer(),
  });
  const headers = new Headers(corsHeaders);
  headers.set("content-type", response.headers.get("content-type") ?? "application/json");
  return new Response(response.body, { status: response.status, headers });
});
