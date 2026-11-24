const RATE_BUCKETS = new Map<string, number[]>();

type JsonBody = Record<string, unknown>;

export function requestIdFrom(req: Request): string {
  return req.headers.get("x-request-id") || crypto.randomUUID();
}

export function jsonResponse(body: JsonBody, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function logWebhook(level: "info" | "warn" | "error", message: string, context: Record<string, unknown>) {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function isIpAllowed(req: Request, allowlistCsv?: string | null): boolean {
  if (!allowlistCsv) return true;
  const clientIp = getClientIp(req);
  const allowlist = allowlistCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return true;
  return allowlist.includes(clientIp);
}

export function checkRateLimit(
  key: string,
  limit = 120,
  windowMs = 60_000,
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const hits = RATE_BUCKETS.get(key) ?? [];
  const fresh = hits.filter((t) => now - t < windowMs);
  if (fresh.length >= limit) {
    RATE_BUCKETS.set(key, fresh);
    return { ok: false, remaining: 0 };
  }
  fresh.push(now);
  RATE_BUCKETS.set(key, fresh);
  return { ok: true, remaining: Math.max(0, limit - fresh.length) };
}

export function timestampIsFresh(
  timestampHeader: string | null,
  maxSkewMs = 5 * 60_000,
): boolean {
  if (!timestampHeader) return false;
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;

  // Accept seconds or milliseconds
  const millis = ts < 1_000_000_000_000 ? ts * 1000 : ts;
  return Math.abs(Date.now() - millis) <= maxSkewMs;
}

export async function verifyHmacSha256(
  secret: string,
  message: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const provided = signatureHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (expected.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return mismatch === 0;
}
