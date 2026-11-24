/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENROUTER_API_KEY")!,
  baseURL: "https://openrouter.ai/api/v1",
});

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools: any[] = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Busca productos disponibles en el catálogo del restaurante/tienda. Úsalo cuando el cliente mencione un producto.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Término de búsqueda (nombre, SKU o código)" },
          limit: { type: "number", description: "Máximo de resultados (default 5)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quote_order",
      description: "Calcula el precio total de un pedido antes de confirmarlo. Muéstrale el resumen al cliente.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Items del pedido",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
              },
              required: ["product_id", "quantity", "unit_price"],
            },
          },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_order",
      description: "Crea el pedido final cuando el cliente confirme y ya tengas su dirección de entrega. Solo llámalo después de que el cliente diga 'sí', 'confirmar', 'listo' o equivalente Y hayas recopilado la dirección.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                quantity: { type: "number" },
                unit_price: { type: "number" },
                tax_rate: { type: "number" },
              },
              required: ["product_id", "quantity", "unit_price"],
            },
          },
          customer_name: { type: "string", description: "Nombre del cliente si lo mencionó" },
          delivery_address: { type: "string", description: "Dirección completa de entrega proporcionada por el cliente" },
          notes: { type: "string", description: "Notas adicionales: incluye si el cliente confirmó ser del municipio de La Estrella y si dijo que enviará su ubicación estática de WhatsApp" },
        },
        required: ["items", "delivery_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_to_human",
      description: "Transfiere la conversación a un asesor humano cuando no puedas resolver la solicitud o el cliente lo pida.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Motivo de la transferencia" },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_interactive_message",
      description: `Envía un mensaje interactivo de WhatsApp con botones o lista de opciones. Úsalo en estos momentos específicos:
1. Al inicio de la conversación para preguntar el tipo de pedido (domicilio/para llevar/en el local).
2. Cuando el cliente quiera ver categorías del menú y haya más de 3 opciones.
IMPORTANTE: Después de llamar este tool, NO generes texto adicional en tu respuesta — el mensaje interactivo ES la respuesta de este turno. Para preguntas simples de sí/no usa texto normal.`,
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["buttons", "list"],
            description: "'buttons' para hasta 3 opciones, 'list' para más opciones en secciones",
          },
          text: { type: "string", description: "Texto principal del mensaje (la pregunta o información)" },
          footer: { type: "string", description: "Texto secundario debajo de las opciones (opcional)" },
          buttons: {
            type: "array",
            description: "Solo para type='buttons'. Máximo 3.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Identificador único sin espacios" },
                title: { type: "string", description: "Texto del botón (máx 20 caracteres)" },
              },
              required: ["id", "title"],
            },
          },
          list_button_text: {
            type: "string",
            description: "Solo para type='list'. Texto del botón que abre la lista (ej. 'Ver opciones')",
          },
          sections: {
            type: "array",
            description: "Solo para type='list'. Secciones con filas de opciones.",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string", description: "Máx 24 caracteres" },
                      description: { type: "string", description: "Descripción opcional (máx 72 caracteres)" },
                    },
                    required: ["id", "title"],
                  },
                },
              },
              required: ["title", "rows"],
            },
          },
        },
        required: ["type", "text"],
      },
    },
  },
];

// ── Evolution interactive message helpers ─────────────────────────────────────

async function sendEvolutionButtons(
  instance: string,
  remoteJid: string,
  text: string,
  buttons: { id: string; displayText: string }[],
  footer?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!baseUrl || !apiKey || !instance || !remoteJid) {
    return { ok: false, error: "Missing Evolution API config or instance/remoteJid" };
  }
  const number = remoteJid.replace(/@.*/, "");
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/message/sendButtons/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          number,
          description: text,
          footer: footer ?? "",
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.displayText },
          })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true, error: null };
      const errBody = await res.text().catch(() => "");
      const error = `Evolution sendButtons HTTP ${res.status}: ${errBody}`;
      console.error(`[ai-order-agent] attempt ${attempt}/${maxRetries}:`, error);
      if (res.status >= 400 && res.status < 500) return { ok: false, error };
    } catch (e: any) {
      const error = `Evolution sendButtons fetch error (attempt ${attempt}/${maxRetries}): ${e?.message ?? e}`;
      console.error("[ai-order-agent]", error);
      if (attempt === maxRetries) return { ok: false, error };
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return { ok: false, error: "Max retries exceeded" };
}

async function sendEvolutionList(
  instance: string,
  remoteJid: string,
  text: string,
  buttonText: string,
  sections: { title: string; rows: { rowId: string; title: string; description?: string }[] }[],
  footer?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!baseUrl || !apiKey || !instance || !remoteJid) {
    return { ok: false, error: "Missing Evolution API config or instance/remoteJid" };
  }
  const number = remoteJid.replace(/@.*/, "");
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/message/sendList/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          number,
          description: text,
          footer: footer ?? "",
          buttonText,
          sections,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true, error: null };
      const errBody = await res.text().catch(() => "");
      const error = `Evolution sendList HTTP ${res.status}: ${errBody}`;
      console.error(`[ai-order-agent] attempt ${attempt}/${maxRetries}:`, error);
      if (res.status >= 400 && res.status < 500) return { ok: false, error };
    } catch (e: any) {
      const error = `Evolution sendList fetch error (attempt ${attempt}/${maxRetries}): ${e?.message ?? e}`;
      console.error("[ai-order-agent]", error);
      if (attempt === maxRetries) return { ok: false, error };
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return { ok: false, error: "Max retries exceeded" };
}

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, any>,
  ctx: {
    tenantId: string;
    branchId: string;
    conversationId: string;
    customerPhone: string | null;
    instance: string;
    remoteJid: string;
  }
): Promise<string> {
  if (name === "search_catalog") {
    const { data, error } = await supabase.rpc("ai_search_catalog", {
      _tenant_id: ctx.tenantId,
      _branch_id: ctx.branchId,
      _query: input.query,
      _limit: input.limit ?? 5,
    });
    if (error) return `Error buscando: ${error.message}`;
    if (!data || data.length === 0) return "No encontré productos con ese nombre.";
    return JSON.stringify(data.map((p: any) => ({
      product_id: p.product_id,
      name: p.name,
      price: p.price,
      tax_rate: p.tax_rate ?? 0,
    })));
  }

  if (name === "quote_order") {
    const { data, error } = await supabase.rpc("ai_quote_order", {
      _tenant_id: ctx.tenantId,
      _branch_id: ctx.branchId,
      _items: input.items,
      _channel: "whatsapp",
    });
    if (error) return `Error cotizando: ${error.message}`;
    return JSON.stringify(data);
  }

  if (name === "create_order") {
    const { data, error } = await supabase.rpc("ai_create_digital_order", {
      _tenant_id: ctx.tenantId,
      _branch_id: ctx.branchId,
      _conversation_id: ctx.conversationId,
      _items: input.items,
      _customer_name: input.customer_name ?? null,
      _customer_phone: ctx.customerPhone,
      _notes: input.notes ?? "Pedido por WhatsApp",
      _delivery_address: input.delivery_address ?? null,
    });
    if (error) return `Error creando pedido: ${error.message}`;
    return JSON.stringify({ order_id: data, status: "created" });
  }

  if (name === "handoff_to_human") {
    await supabase.rpc("ai_handoff_to_human", {
      _conversation_id: ctx.conversationId,
      _reason: input.reason,
    });
    return "Transferido a asesor humano.";
  }

  if (name === "send_interactive_message") {
    if (input.type === "buttons") {
      const btns = (input.buttons ?? []).slice(0, 3).map((b: any) => ({
        id: String(b.id),
        displayText: String(b.title ?? b.displayText ?? b.id).slice(0, 20),
      }));
      if (btns.length === 0) return "Error: se requiere al menos un botón.";
      const result = await sendEvolutionButtons(
        ctx.instance, ctx.remoteJid, input.text, btns, input.footer,
      );
      if (!result.ok) {
        // Fallback: send as plain text
        const plainText = [input.text, ...btns.map((b: any) => `• ${b.displayText}`)].join("\n");
        await sendEvolutionMessage(ctx.instance, ctx.remoteJid, plainText);
        return `Botones no soportados, enviado como texto. Error: ${result.error}`;
      }
      return "Mensaje interactivo con botones enviado.";
    }

    if (input.type === "list") {
      const sections = (input.sections ?? []).map((s: any) => ({
        title: String(s.title),
        rows: (s.rows ?? []).map((r: any) => ({
          rowId: String(r.id),
          title: String(r.title).slice(0, 24),
          description: r.description ? String(r.description).slice(0, 72) : undefined,
        })),
      }));
      if (sections.length === 0) return "Error: se requiere al menos una sección.";
      const result = await sendEvolutionList(
        ctx.instance, ctx.remoteJid, input.text,
        input.list_button_text ?? "Ver opciones", sections, input.footer,
      );
      if (!result.ok) {
        // Fallback: send as plain text
        const lines = [input.text];
        for (const s of sections) {
          for (const r of s.rows) lines.push(`• ${r.title}${r.description ? ` — ${r.description}` : ""}`);
        }
        await sendEvolutionMessage(ctx.instance, ctx.remoteJid, lines.join("\n"));
        return `Lista no soportada, enviado como texto. Error: ${result.error}`;
      }
      return "Mensaje interactivo con lista enviado.";
    }

    return "Tipo de mensaje interactivo desconocido.";
  }

  return "Herramienta desconocida.";
}

// ── Evolution send with retry ─────────────────────────────────────────────────

async function sendEvolutionMessage(
  instance: string | undefined,
  remoteJid: string | undefined,
  text: string,
): Promise<{ ok: boolean; error: string | null }> {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");

  if (!baseUrl || !apiKey) {
    const error = "EVOLUTION_API_URL or EVOLUTION_API_KEY not set";
    console.error("[ai-order-agent]", error);
    return { ok: false, error };
  }
  if (!instance || !remoteJid) {
    const error = `Missing ${!instance ? "instance" : "remoteJid"}`;
    console.error("[ai-order-agent]", error);
    return { ok: false, error };
  }

  const number = remoteJid.replace(/@.*/, "");
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true, error: null };

      const errBody = await res.text().catch(() => "");
      const error = `Evolution API HTTP ${res.status}: ${errBody}`;
      console.error(`[ai-order-agent] attempt ${attempt}/${maxRetries}:`, error);

      // 4xx errors won't improve with retries
      if (res.status >= 400 && res.status < 500) return { ok: false, error };
    } catch (e: any) {
      const error = `Evolution API fetch error (attempt ${attempt}/${maxRetries}): ${e?.message ?? e}`;
      console.error("[ai-order-agent]", error);
      if (attempt === maxRetries) return { ok: false, error };
    }

    // Exponential backoff: 1s, 2s
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }

  return { ok: false, error: "Max retries exceeded" };
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Auth: accept service role (webhook) or user JWT (preview/suggest mode)
  const auth = req.headers.get("authorization") ?? "";
  let isPreview = false;

  if (auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    // Full mode: webhook-triggered, will save & send
  } else {
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);
    isPreview = true;
  }

  const body = await req.json().catch(() => ({}));
  const conversationId: string | undefined = body.conversation_id;
  const newMessage: string = String(body.message ?? "").trim();
  const mediaAttachment: {
    type: "audio" | "image";
    base64: string;
    mimeType: string;
    caption?: string;
  } | null = body.media_attachment ?? null;
  if (!conversationId || (!newMessage && !mediaAttachment)) {
    return json({ error: "conversation_id and (message or media_attachment) are required" }, 400);
  }

  // Load conversation context
  const { data: conversation } = await supabase
    .from("ai_conversations")
    .select("id, tenant_id, branch_id, external_conversation_id, customer_phone, status, customer_name")
    .eq("id", conversationId)
    .single();
  if (!conversation) return json({ error: "Conversation not found" }, 404);

  if (!isPreview && conversation.status === "handoff") {
    return json({ ok: true, skipped: "handoff" });
  }

  // Derive instance + remoteJid from conversation (more reliable than request body)
  // external_conversation_id is stored as "instance:remoteJid"
  const extIdColonIdx = (conversation.external_conversation_id ?? "").indexOf(":");
  const derivedInstance: string = extIdColonIdx > 0
    ? conversation.external_conversation_id.slice(0, extIdColonIdx)
    : (body.instance ?? "");
  const derivedRemoteJid: string = extIdColonIdx > 0
    ? conversation.external_conversation_id.slice(extIdColonIdx + 1)
    : (body.remote_jid ?? "");

  // Wrap entire agent logic in try-catch so failures never leave the customer without a response
  try {
    return await runAgent({
      isPreview,
      conversation,
      conversationId,
      newMessage,
      instance: derivedInstance,
      remoteJid: derivedRemoteJid,
      mediaAttachment,
    });
  } catch (err: any) {
    console.error("[ai-order-agent] Unhandled error:", err?.message ?? err);

    const fallbackMsg = "Lo sentimos, ocurrió un problema procesando tu mensaje. Un asesor te atenderá pronto.";

    if (!isPreview) {
      // Best-effort: try to notify the customer
      await sendEvolutionMessage(derivedInstance, derivedRemoteJid, fallbackMsg).catch(() => {});
      await supabase.from("ai_messages").insert({
        tenant_id: conversation.tenant_id,
        conversation_id: conversationId,
        direction: "outbound",
        body: fallbackMsg,
        payload: { error: String(err?.message ?? err), generated_by: "fallback" },
      }).catch(() => {});
    }

    return json({ error: "Internal agent error" }, 500);
  }
});

async function runAgent({
  isPreview,
  conversation,
  conversationId,
  newMessage,
  instance,
  remoteJid,
  mediaAttachment,
}: {
  isPreview: boolean;
  conversation: any;
  conversationId: string;
  newMessage: string;
  instance: string;
  remoteJid: string;
  mediaAttachment?: {
    type: "audio" | "image";
    base64: string;
    mimeType: string;
    caption?: string;
  } | null;
}) {
  // Load AI config — config is a JSONB column, not flat columns
  const { data: aiConfigRow } = await supabase
    .from("ai_channel_configs")
    .select("config")
    .eq("branch_id", conversation.branch_id)
    .eq("channel", "whatsapp")
    .maybeSingle();
  const aiConfig: Record<string, any> = aiConfigRow?.config ?? {};

  // Last N messages as conversation history.
  // We load one extra and skip the most-recent (the just-inserted inbound message)
  // to avoid sending it twice (once from history, once as newMessage).
  const { data: history } = await supabase
    .from("ai_messages")
    .select("direction, body")
    .eq("conversation_id", conversationId)
    .in("direction", ["inbound", "outbound"])
    .order("created_at", { ascending: false })
    .limit(13); // 13 → skip 1 (current) → 12 context turns max

  const priorMessages: any[] = (history ?? [])
    .slice(1)   // skip the most-recent inbound (the one we're processing now)
    .reverse()
    .map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body ?? "",
    }));

  // ── Vision: resolve image attachment to a text description ────
  let resolvedMessage = newMessage;
  if (mediaAttachment?.type === "image" && mediaAttachment.base64) {
    // Guard: skip if base64 exceeds ~3.75 MB decoded (5M chars encoded)
    if (mediaAttachment.base64.length < 5_000_000) {
      try {
        const visionRes = await openai.chat.completions.create({
          model: "openai/gpt-4o",
          messages: [{
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mediaAttachment.mimeType};base64,${mediaAttachment.base64}` },
              },
              {
                type: "text",
                text: `Describe brevemente qué hay en esta imagen en el contexto de un pedido de comida o panadería. Si hay texto legible (lista de productos, dirección, etc.), transcríbelo. Caption del cliente: "${mediaAttachment.caption ?? ""}"`,
              },
            ],
          }],
          temperature: 0.2,
        });
        const description = visionRes.choices[0].message.content?.trim() ?? "";
        if (description) {
          resolvedMessage = `[El cliente compartió una imagen. Descripción: ${description}]${newMessage ? `\n${newMessage}` : ""}`;
        }
      } catch (e) {
        console.warn("[ai-order-agent] Vision call failed:", e);
      }
    } else {
      console.warn("[ai-order-agent] Image too large for vision, using caption only");
    }
  }

  const messages: any[] = [
    ...priorMessages,
    { role: "user", content: resolvedMessage || newMessage || "[Imagen compartida]" },
  ];

  // ── RAG: retrieve relevant knowledge context ──────────────────
  let knowledgeContext = "";
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (openrouterKey) {
    try {
      const embedRes = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openrouterKey}`,
        },
        body: JSON.stringify({
          model: "openai/text-embedding-3-small",
          input: resolvedMessage || newMessage,
          dimensions: 768,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (embedRes.ok) {
        const embedData = await embedRes.json();
        const embedding: number[] = embedData?.data?.[0]?.embedding ?? [];
        if (embedding.length > 0) {
          const vectorLiteral = `[${embedding.join(",")}]`;
          const { data: docs } = await supabase.rpc("match_knowledge_docs", {
            _tenant_id: conversation.tenant_id,
            _branch_id: conversation.branch_id,
            _embedding: vectorLiteral,
            _match_count: 3,
          });
          if (docs && docs.length > 0) {
            const fragments = docs
              .filter((d: any) => d.similarity > 0.6)
              .map((d: any) => `### ${d.title}\n${d.content}`)
              .join("\n\n");
            if (fragments) {
              knowledgeContext = `\n\n--- Información adicional del negocio ---\n${fragments}\n---`;
            }
          }
        }
      }
    } catch (e) {
      console.warn("[ai-order-agent] RAG embedding failed:", e);
    }
  }

  // ── 24h returning customer context ───────────────────────────
  let returningCustomerCtx = "";
  if (conversation.customer_phone) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentOrders } = await supabase
      .from("digital_orders")
      .select("id, created_at, items, total")
      .eq("tenant_id", conversation.tenant_id)
      .eq("customer_phone", conversation.customer_phone)
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(3);

    if (recentOrders && recentOrders.length > 0) {
      const orderLines = recentOrders.map((o: any) => {
        const items = Array.isArray(o.items)
          ? o.items.map((i: any) => `${i.quantity ?? 1}x ${i.name ?? "producto"}`).join(", ")
          : "pedido anterior";
        const when = new Date(o.created_at).toLocaleString("es-CO", {
          hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
        });
        return `• ${when}: ${items}`;
      }).join("\n");
      returningCustomerCtx = `\n\n--- CLIENTE RECURRENTE ---\nEste cliente ya realizó pedidos en las últimas 24 horas. Salúdalo cálidamente y agradécele por volver. Pedidos recientes:\n${orderLines}\n---`;
    }
  }

  // ── Daily context injection ───────────────────────────────────
  const nowColombia = new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const delayMinutes = aiConfig.delivery_delay_minutes ?? 45;
  let dailyContext = `\n\n--- CONTEXTO DEL DÍA ---\nFecha y hora actual: ${nowColombia}\nTiempo de demora para domicilios: ${delayMinutes} minutos`;
  if (aiConfig.daily_recommendation) {
    dailyContext += `\nRecomendación del día: ${aiConfig.daily_recommendation}`;
  }
  dailyContext += "\n---";

  // ── System prompt ─────────────────────────────────────────────
  const defaultPrompt = `Eres el asistente virtual de pedidos de este negocio. Tu objetivo es ayudar al cliente a comprar de forma rápida, cálida y confiable por WhatsApp, guiándolo desde el antojo hasta la confirmación del pedido.

Tu tono debe ser cercano, amable y antojable, como el de un negocio de confianza. Usa mensajes breves, naturales y fáciles de leer. Puedes usar emojis con moderación (🥐, 🥖, ☕, etc.). Evita párrafos largos.

Tu prioridad es vender bien sin presionar. Cuando el cliente pida un producto, puedes sugerir un complemento relevante de forma breve, por ejemplo: "¿Te gustaría acompañarlo con un café o un jugo natural?"

Reglas obligatorias:
1. Nunca inventes productos, sabores, tamaños, precios ni disponibilidad.
2. Ante cualquier mención de producto, usa search_catalog para verificar disponibilidad y precio real en COP.
3. Si el cliente menciona varios productos en mensajes separados, conserva el pedido acumulado y agrégalo todo en una sola cotización.
4. Informa de manera proactiva que el tiempo estimado de entrega es de ${delayMinutes} minutos (revisa el CONTEXTO DEL DÍA).
5. Antes de crear un pedido, muestra siempre el resumen usando quote_order.
6. SIEMPRE pide la dirección de entrega antes de crear el pedido. Si el cliente confirma sin darla, pregunta: "¿A qué dirección te lo llevamos?" Acepta cualquier dirección tal como el cliente la escriba, sin importar el formato; nunca la rechaces ni escales por esto.
7. Una vez que el cliente dé su dirección, responde con un mensaje breve que: (a) confirme textualmente si la dirección está en el municipio de La Estrella (ej. "¡Perfecto, hacemos domicilios en La Estrella!"); si detectas que podría ser otro municipio, indícalo amablemente y confirma si es La Estrella o no. (b) Pregunta: "¿Puedes compartir tu ubicación estática de WhatsApp? (No en vivo, solo el pin de tu lugar) Le llegará al domiciliario para encontrarte más fácil 📍". Si el cliente dice que sí o que la enviará, anótalo en las notas del pedido. Si dice que no, está bien, procede normalmente.
8. Solo usa create_order cuando el cliente haya confirmado explícitamente Y hayas recibido su dirección. En el campo notes incluye: si confirmó ser del municipio de La Estrella, y si el cliente dijo que enviará su ubicación de WhatsApp (para que el domiciliario lo sepa).
9. Nunca confirmes un pedido sin haber mostrado primero el resumen de la cotización y sin tener la dirección.
10. Si hay quejas, pedidos especiales complejos, dudas fuera del catálogo, problemas técnicos o situaciones sensibles, usa handoff_to_human. NUNCA uses handoff_to_human por causa de la dirección de entrega.

Flujo ideal:
1. Saluda de forma cálida y pregunta qué se le antoja al cliente.
2. Verifica cada producto con search_catalog.
3. Arma o actualiza el pedido acumulado.
4. Sugiere máximo un complemento relevante si aplica.
5. Informa el tiempo estimado de entrega: ${delayMinutes} minutos.
6. Muestra el resumen con quote_order.
7. Espera confirmación explícita.
8. Pide la dirección de entrega si aún no la tienes: "¿A qué dirección te lo llevamos?"
9. Al recibir la dirección: confirma si es La Estrella y pide la ubicación estática de WhatsApp (pin, no en vivo).
10. Espera la respuesta del cliente sobre la ubicación (si la enviará o no), luego procede.
11. Crea el pedido con create_order (incluyendo dirección y en notes: municipio confirmado + si enviará ubicación).
12. Cierra con un mensaje amable confirmando la dirección y el tiempo de entrega.

Estilo de respuesta:
- Sé breve, claro y natural.
- No uses lenguaje robótico.
- No repitas información innecesariamente.
- No hagas más de una pregunta importante a la vez.
- Si falta información para completar el pedido, pide solo el dato necesario.
- Mantén siempre una actitud cálida, confiable y orientada a concretar la compra.`;

  const systemPrompt =
    (aiConfig.system_prompt?.trim() || defaultPrompt) +
    dailyContext +
    knowledgeContext +
    returningCustomerCtx;

  const model = aiConfig.ai_model ?? "anthropic/claude-3.5-haiku";
  const temperature = aiConfig.temperature ?? 0.7;

  // ── Agentic loop ──────────────────────────────────────────────
  const currentMessages = [...messages];
  let finalReply = "";
  let iterations = 0;

  while (iterations < 8) {
    iterations++;
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...currentMessages],
      tools,
      temperature,
    });

    const choice = response.choices[0];
    const turnText = choice.message.content?.trim() || "";
    if (turnText) finalReply = turnText;

    const toolCalls = choice.message.tool_calls;
    if (!toolCalls || toolCalls.length === 0) break;

    currentMessages.push(choice.message);

    const toolResults = await Promise.all(
      toolCalls.map(async (tc: any) => {
        const args = JSON.parse(tc.function.arguments);
        const result = await executeTool(tc.function.name, args, {
          tenantId: conversation.tenant_id,
          branchId: conversation.branch_id,
          conversationId: conversation.id,
          customerPhone: conversation.customer_phone,
          instance,
          remoteJid,
        });

        if (!isPreview) {
          await supabase.from("ai_messages").insert({
            tenant_id: conversation.tenant_id,
            conversation_id: conversationId,
            direction: "tool",
            body: `${tc.function.name}: ${tc.function.arguments}`,
            payload: { tool: tc.function.name, input: args, result },
          });
        }

        return { role: "tool", tool_call_id: tc.id, content: result };
      })
    );

    currentMessages.push(...toolResults);
  }

  if (!finalReply) finalReply = "Disculpa, tuve un problema procesando tu mensaje. Un asesor te atenderá pronto.";

  // Preview mode: return suggestion without saving or sending
  if (isPreview) {
    return json({ ok: true, reply: finalReply, preview: true });
  }

  // Send via Evolution API (with retry), then record result
  const { ok: evolutionOk, error: evolutionError } = await sendEvolutionMessage(
    instance,
    remoteJid,
    finalReply,
  );

  await supabase.from("ai_messages").insert({
    tenant_id: conversation.tenant_id,
    conversation_id: conversationId,
    direction: "outbound",
    body: finalReply,
    payload: {
      generated_by: "openrouter-claude",
      model,
      iterations,
      evolution_ok: evolutionOk,
      ...(evolutionError ? { evolution_error: evolutionError } : {}),
    },
  });

  return json({ ok: true, reply: finalReply, evolution_sent: evolutionOk });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
