const MIME_TO_EXT: Record<string, string> = {
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/webm": ".webm",
  "audio/wav": ".wav",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function mimeToExt(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[base] ?? ".bin";
}

/**
 * Downloads media from Evolution API and returns it as a base64 string.
 * Returns empty string on any failure — callers must handle the fallback.
 */
export async function downloadMediaAsBase64(
  evolutionBaseUrl: string,
  evolutionApiKey: string,
  instance: string,
  messageData: Record<string, any>,
): Promise<string> {
  try {
    const url = `${evolutionBaseUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instance}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
      body: JSON.stringify({ message: messageData }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[media] downloadMediaAsBase64 HTTP ${res.status}: ${body}`);
      return "";
    }
    const json = await res.json();
    const base64: string = json?.base64 ?? json?.data ?? "";
    if (!base64) {
      console.warn("[media] downloadMediaAsBase64: empty base64 in response", JSON.stringify(json).slice(0, 200));
    }
    return base64;
  } catch (e: any) {
    console.error("[media] downloadMediaAsBase64 error:", e?.message ?? e);
    return "";
  }
}

/**
 * Transcribes audio using Groq Whisper (whisper-large-v3).
 * Returns empty string on any failure — callers must handle the fallback.
 */
export async function transcribeAudio(
  groqApiKey: string,
  base64: string,
  mimeType: string,
): Promise<string> {
  try {
    const ext = mimeToExt(mimeType);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mimeType.split(";")[0].trim() });

    const form = new FormData();
    form.append("file", blob, `audio${ext}`);
    form.append("model", "whisper-large-v3");
    form.append("language", "es");
    form.append("response_format", "text");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqApiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[media] transcribeAudio HTTP ${res.status}: ${body}`);
      return "";
    }

    // Groq returns plain text when response_format=text
    const transcription = (await res.text()).trim();
    return transcription;
  } catch (e: any) {
    console.error("[media] transcribeAudio error:", e?.message ?? e);
    return "";
  }
}
