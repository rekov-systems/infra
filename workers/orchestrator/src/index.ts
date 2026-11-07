export interface Env {
  ERPNEXT_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("rekov-orchestrator: add Telnyx webhooks, Workers AI, ERPNext API here", {
      status: 200,
      headers: { "content-type": "text/plain;charset=utf-8" },
    });
  },
};
