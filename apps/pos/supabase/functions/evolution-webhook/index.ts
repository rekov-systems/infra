import { createClient } from "npm:@supabase/supabase-js@2";
import {
  checkRateLimit,
  getClientIp,
  isIpAllowed,
  jsonResponse,
  logWebhook,
  requestIdFrom,
  timestampIsFresh,
  verifyHmacSha256,
} from "../_shared/webhook-security.ts";
import { downloadMediaAsBase64, transcribeAudio } from "../_shared/media.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature, x-evolution-signature, x-webhook-timestamp, x-evolution-timestamp, x-request-id",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// @ts-ignore – available in Supabase Edge Runtime
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const requestId = requestIdFrom(req);
  const ip = getClientIp(req);
  if (req.method !== "POST") return json({ error: "Method not allowed", request_id: requestId }, 405);

  const rate = checkRateLimit(`evolution:${ip}`, 240, 60_000);
  if (!rate.ok) return json({ error: "Rate limit exceeded", request_id: requestId }, 429);
  if (!isIpAllowed(req, Deno.env.get("EVOLUTION_IP_ALLOWLIST"))) {
    logWebhook("warn", "evolution_webhook_ip_rejected", { request_id: requestId, ip });
    return json({ error: "IP not allowed", request_id: requestId }, 403);
  }

  const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  const timestamp = req.headers.get("x-webhook-timestamp") ?? req.headers.get("x-evolution-timestamp");
  if (!timestampIsFresh(timestamp)) {
    return json({ error: "Stale or invalid timestamp", request_id: requestId }, 401);
  }

  const rawBody = await req.text();
  if (secret) {
    const signature = req.headers.get("x-webhook-signature") ?? req.headers.get("x-evolution-signature");
    const validSignature = await verifyHmacSha256(secret, `${timestamp}.${rawBody}`, signature);
    if (!validSignature) {
      logWebhook("warn", "evolution_webhook_invalid_signature", { request_id: requestId, ip });
      return json({ error: "Invalid webhook signature", request_id: requestId }, 401);
    }
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON", request_id: requestId }, 400);
  }

  try {
    const event = payload.event ?? payload.type ?? "";
    const data = payload.data ?? payload;
    const instance = String(payload.instance ?? data.instance ?? data.instanceName ?? "");
    const remoteJid = String(
      data.key?.remoteJid ?? data.remoteJid ?? data.from ?? data.sender ?? data.chatId ?? "",
    );
    const fromMe = Boolean(data.key?.fromMe ?? data.fromMe ?? false);
    const audioMsg = data.message?.audioMessage;
    const imageMsg = data.message?.imageMessage;

    let text = String(
      data.message?.conversation ??
        data.message?.extendedTextMessage?.text ??
        // Replies to interactive button/list messages
        data.message?.buttonsResponseMessage?.selectedDisplayText ??
        data.message?.listResponseMessage?.singleSelectReply?.selectedRowId ??
        data.text ??
        data.body ??
        "",
    ).trim();

    type MediaAttachment = {
      type: "audio" | "image";
      base64: string;
      mimeType: string;
      caption?: string;
    };
    let mediaAttachment: MediaAttachment | null = null;

    // Process media messages if no text was extracted
    if (!text) {
      const evoBase = Deno.env.get("EVOLUTION_API_URL") ?? "";
      const evoKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";

      if (audioMsg && evoBase && evoKey) {
        const base64 = await downloadMediaAsBase64(evoBase, evoKey, instance, data.message);
        if (base64) {
          const groqKey = Deno.env.get("GROQ_API_KEY");
          if (groqKey) {
            text = await transcribeAudio(groqKey, base64, audioMsg.mimetype ?? "audio/ogg");
          }
          mediaAttachment = { type: "audio", base64, mimeType: audioMsg.mimetype ?? "audio/ogg" };
        }
        text = text || "[Mensaje de audio - transcripción no disponible]";
      } else if (imageMsg && evoBase && evoKey) {
        const base64 = await downloadMediaAsBase64(evoBase, evoKey, instance, data.message);
        if (base64) {
          mediaAttachment = {
            type: "image",
            base64,
            mimeType: imageMsg.mimetype ?? "image/jpeg",
            caption: imageMsg.caption,
          };
        }
        text = imageMsg.caption?.trim() || "[Imagen compartida por el cliente]";
      }
    }

    // Ignore outgoing messages, missing info, non-message events
    if (fromMe || !remoteJid || (!text && !mediaAttachment) || (event && !String(event).toLowerCase().includes("message"))) {
      return json({ ok: true, ignored: true, request_id: requestId });
    }

    const { data: config, error: configError } = await supabase
      .from("ai_channel_configs")
      .select("tenant_id, branch_id, phone_number, config")
      .eq("channel", "whatsapp")
      .eq("is_active", true)
      .filter("config->>evolution_instance", "eq", instance)
      .maybeSingle();
    if (configError) return json({ error: "Error loading channel config", request_id: requestId }, 500);
    if (!config) return json({ ok: false, error: "No active AI channel config for this Evolution instance", request_id: requestId }, 404);

    const customerPhone = remoteJid.replace(/@.*/, "");
    const externalId = `${instance}:${remoteJid}`;

    const { data: conversation, error: convError } = await supabase
      .from("ai_conversations")
      .upsert({
        tenant_id: config.tenant_id,
        branch_id: config.branch_id,
        channel: "whatsapp",
        external_conversation_id: externalId,
        customer_phone: customerPhone,
        last_message_at: new Date().toISOString(),
      }, { onConflict: "channel,external_conversation_id", ignoreDuplicates: false })
      .select("id, status")
      .single();
    if (convError) return json({ error: "Error upserting conversation", request_id: requestId }, 500);

    const evolutionMsgId = String(data.key?.id ?? data.messageId ?? data.id ?? "");
    if (evolutionMsgId) {
      const { count } = await supabase
        .from("ai_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversation.id)
        .eq("direction", "inbound")
        .filter("payload->>'_evo_msg_id'", "eq", evolutionMsgId);
      if (count && count > 0) {
        return json({ ok: true, deduplicated: true, request_id: requestId });
      }
    }

    await supabase.from("ai_messages").insert({
      tenant_id: config.tenant_id,
      conversation_id: conversation.id,
      direction: "inbound",
      body: text,
      media_type: mediaAttachment?.type ?? null,
      payload: {
        ...payload,
        _evo_msg_id: evolutionMsgId || undefined,
        _transcribed: audioMsg && mediaAttachment ? true : undefined,
      },
    });

    if (conversation.status !== "handoff") {
      const agentPromise = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-order-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          conversation_id: conversation.id,
          message: text,
          instance,
          remote_jid: remoteJid,
          media_attachment: mediaAttachment,
        }),
        signal: AbortSignal.timeout(120_000),
      }).then(async (res) => {
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          logWebhook("error", "evolution_ai_agent_http_error", {
            request_id: requestId,
            status: res.status,
            body,
          });
        }
      }).catch((err) => {
        logWebhook("error", "evolution_ai_agent_fetch_error", {
          request_id: requestId,
          error: err?.message ?? String(err),
        });
      });

      if (typeof EdgeRuntime !== "undefined") {
        EdgeRuntime.waitUntil(agentPromise);
      } else {
        await agentPromise;
      }
    }

    return json({ ok: true, conversation_id: conversation.id, status: conversation.status, request_id: requestId });
  } catch (error) {
    logWebhook("error", "evolution_webhook_unhandled_error", {
      request_id: requestId,
      ip,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Unhandled webhook error", request_id: requestId }, 500);
  }
});

function json(body: unknown, status = 200) {
  return jsonResponse(body as Record<string, unknown>, status, corsHeaders);
}
