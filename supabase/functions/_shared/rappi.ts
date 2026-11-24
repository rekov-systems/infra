// Shared helpers for Rappi Partners API

const RAPPI_API_BASE = (Deno.env.get("RAPPI_API_BASE") ?? "https://services.dev.rappi.com").replace(/\/$/, "");
const CLIENT_ID = Deno.env.get("RAPPI_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("RAPPI_CLIENT_SECRET") ?? "";

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getRappiToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("RAPPI_CLIENT_ID/RAPPI_CLIENT_SECRET no configurados");
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;

  const res = await fetch(`${RAPPI_API_BASE}/api/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Rappi auth failed [${res.status}]: ${t}`);
  }
  const data = await res.json();
  const token = data.access_token ?? data.token;
  const expiresIn = Number(data.expires_in ?? 3000);
  if (!token) throw new Error("Rappi auth: token vacío en respuesta");
  cachedToken = { value: token, expiresAt: now + expiresIn * 1000 };
  return token;
}

export async function rappiFetch(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: any }> {
  const token = await getRappiToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`${RAPPI_API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body };
}

export async function verifyRappiSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("RAPPI_WEBHOOK_SECRET");
  const allowUnsigned = Deno.env.get("ALLOW_UNSIGNED_RAPPI_WEBHOOKS") === "true";
  if (!secret) return allowUnsigned;
  if (!signatureHeader) return false;

  // Compat: soporta firma sobre body o sobre "<timestamp>.<body>"
  const bodyOnly = await verifyHmacSha256(secret, rawBody, signatureHeader);
  if (bodyOnly) return true;
  if (timestampHeader) {
    return verifyHmacSha256(secret, `${timestampHeader}.${rawBody}`, signatureHeader);
  }
  return false;
}
import { verifyHmacSha256 } from "./webhook-security.ts";
