import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useWhatsAppNotifs } from "@/contexts/WhatsAppNotifsContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Bot, Send, UserRound, MessageCircle, RefreshCw, HandshakeIcon,
  Search, Zap, Sparkles, Loader2, Settings2, Trash2, Plus, Package,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { PageHeader } from "@/components/shared/PageHeader";
import { canAccessRoles } from "@/lib/roles";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Abierta", className: "bg-success text-success-foreground" },
  handoff: { label: "Con asesor", className: "bg-yellow-500 text-white" },
  closed: { label: "Cerrada", className: "bg-muted text-muted-foreground" },
};

export default function WhatsAppInbox() {
  const { tenantId, branchId, roles } = useTenantContext();
  const { clearUnread } = useWhatsAppNotifs();
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Product search state
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");

  // Quick replies state
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [manageQrOpen, setManageQrOpen] = useState(false);
  const [newQrTitle, setNewQrTitle] = useState("");
  const [newQrBody, setNewQrBody] = useState("");

  const isAdmin = canAccessRoles(roles, ["owner", "admin", "manager"]);

  // Clear unread counter when inbox is open
  useEffect(() => { clearUnread(); }, [clearUnread]);

  // ── Data queries ─────────────────────────────────────────────

  const { data: conversations = [] } = useQuery({
    queryKey: ["wa-conversations", tenantId],
    enabled: !!tenantId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_conversations")
        .select("id, channel, customer_phone, customer_name, status, last_message_at, branch_id, branches(name)")
        .eq("tenant_id", tenantId!)
        .order("last_message_at", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["wa-messages", selectedId],
    enabled: !!selectedId,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_messages")
        .select("id, direction, body, created_at, payload")
        .eq("conversation_id", selectedId!)
        .in("direction", ["inbound", "outbound"])
        .order("created_at", { ascending: true })
        .limit(100);
      return data ?? [];
    },
  });

  // Product search
  const { data: productResults = [], isFetching: searchingProducts } = useQuery({
    queryKey: ["wa-product-search", productQuery, tenantId, branchId],
    enabled: productSearchOpen && productQuery.trim().length > 1 && !!tenantId && !!branchId,
    queryFn: async () => {
      const { data } = await supabase.rpc("ai_search_catalog", {
        _tenant_id: tenantId!,
        _branch_id: branchId!,
        _query: productQuery.trim(),
        _limit: 8,
      });
      return data ?? [];
    },
  });

  // Quick replies
  const { data: quickReplies = [], refetch: refetchQr } = useQuery({
    queryKey: ["wa-quick-replies", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("wa_quick_replies")
        .select("id, title, body, sort_order")
        .eq("tenant_id", tenantId!)
        .order("sort_order")
        .order("title");
      return data ?? [];
    },
  });

  // ── Realtime subscriptions ────────────────────────────────────

  useEffect(() => {
    if (!selectedId) return;
    const ch = supabase.channel(`wa-msgs-${selectedId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "ai_messages",
        filter: `conversation_id=eq.${selectedId}`,
      }, () => { qc.invalidateQueries({ queryKey: ["wa-messages", selectedId] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selectedId, qc]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel("wa-convs")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_conversations" },
        () => { qc.invalidateQueries({ queryKey: ["wa-conversations", tenantId] }); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, qc]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Actions ───────────────────────────────────────────────────

  const selectedConv = conversations.find((c: any) => c.id === selectedId);

  const sendReply = async () => {
    if (!reply.trim() || !selectedId) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp-message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ conversation_id: selectedId, text: reply.trim() }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error enviando");
      setReply("");
      qc.invalidateQueries({ queryKey: ["wa-messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["wa-conversations", tenantId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const retakeBot = async () => {
    if (!selectedId) return;
    await supabase.from("ai_conversations").update({ status: "open", handoff_reason: null }).eq("id", selectedId);
    qc.invalidateQueries({ queryKey: ["wa-conversations", tenantId] });
    toast.success("El bot retomará la conversación");
  };

  const insertProductText = (product: any) => {
    const formatted = `📦 *${product.name}* — $${Number(product.price).toLocaleString("es-CO")} COP`;
    setReply((prev) => (prev ? `${prev}\n${formatted}` : formatted));
    setProductSearchOpen(false);
    setProductQuery("");
  };

  const insertQuickReply = (body: string) => {
    setReply(body);
    setQuickRepliesOpen(false);
  };

  const askAiSuggestion = async () => {
    if (!selectedId) return;
    const lastInbound = [...messages].reverse().find((m: any) => m.direction === "inbound");
    if (!lastInbound) { toast.error("No hay mensaje del cliente para analizar"); return; }

    setAiSuggesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-order-agent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ conversation_id: selectedId, message: lastInbound.body, preview: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error generando sugerencia");
      if (data.reply) {
        setReply(data.reply);
        toast.success("Sugerencia lista — puedes editarla antes de enviar");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAiSuggesting(false);
    }
  };

  // ── Quick reply CRUD ──────────────────────────────────────────

  const saveQuickReply = async () => {
    if (!newQrTitle.trim() || !newQrBody.trim() || !tenantId) return;
    const { error } = await supabase.from("wa_quick_replies").insert({
      tenant_id: tenantId,
      title: newQrTitle.trim(),
      body: newQrBody.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setNewQrTitle("");
    setNewQrBody("");
    refetchQr();
    toast.success("Respuesta guardada");
  };

  const deleteQuickReply = async (id: string) => {
    await supabase.from("wa_quick_replies").delete().eq("id", id);
    refetchQr();
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left: conversation list */}
      <div className="w-80 shrink-0 border-r flex flex-col">
        <div className="p-4 border-b">
          <PageHeader
        eyebrow="OPERACIÓN · MENSAJERÍA" title="WhatsApp" description={`${conversations.length} conversaciones`} />
        </div>
        <ScrollArea className="flex-1">
          {conversations.map((conv: any) => {
            const badge = STATUS_BADGE[conv.status] ?? STATUS_BADGE.open;
            return (
              <button
                type="button"
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b hover:bg-accent/50 transition-colors",
                  selectedId === conv.id && "bg-accent"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-sm truncate">
                      {conv.customer_name || conv.customer_phone || "Desconocido"}
                    </span>
                  </div>
                  <Badge className={`text-[10px] shrink-0 ${badge.className}`}>{badge.label}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex justify-between">
                  <span>{(conv.branches as any)?.name ?? "—"}</span>
                  <span>{formatDistanceToNow(new Date(conv.last_message_at), { locale: es, addSuffix: true })}</span>
                </div>
              </button>
            );
          })}
          {conversations.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Sin conversaciones aún
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: chat */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{selectedConv.customer_name || selectedConv.customer_phone}</p>
              <p className="text-xs text-muted-foreground">{selectedConv.customer_phone}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={(STATUS_BADGE[selectedConv.status] ?? STATUS_BADGE.open).className}>
                {(STATUS_BADGE[selectedConv.status] ?? STATUS_BADGE.open).label}
              </Badge>
              {selectedConv.status === "handoff" && (
                <Button size="sm" variant="outline" onClick={retakeBot} title="Devolver al bot">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reactivar bot
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3 max-w-2xl mx-auto">
              {messages.map((msg: any) => {
                const isInbound = msg.direction === "inbound";
                const isBot = msg.direction === "outbound" && msg.payload?.generated_by?.includes("claude");
                return (
                  <div key={msg.id} className={cn("flex", isInbound ? "justify-start" : "justify-end")}>
                    <div className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                      isInbound
                        ? "bg-muted text-foreground rounded-tl-none"
                        : "bg-primary text-primary-foreground rounded-tr-none"
                    )}>
                      {!isInbound && (
                        <div className="flex items-center gap-1 mb-1 opacity-70 text-xs">
                          {isBot ? <Bot className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                          {isBot ? "Bot" : "Asesor"}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                      <p className={cn("text-[10px] mt-1", isInbound ? "text-muted-foreground" : "opacity-60")}>
                        {new Date(msg.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Toolbar + Reply input */}
          <div className="p-4 border-t space-y-2">
            {selectedConv.status === "handoff" && (
              <p className="text-xs text-yellow-600 flex items-center gap-1">
                <HandshakeIcon className="h-3 w-3" /> Conversación en manos del asesor. El bot no responderá.
              </p>
            )}

            {/* Toolbar */}
            <div className="flex items-center gap-1 flex-wrap">
              {/* Product search */}
              <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    <Package className="h-3 w-3" /> Producto
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Buscar producto</p>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-7 h-8 text-sm"
                      placeholder="Nombre, SKU…"
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {searchingProducts && (
                      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                      </div>
                    )}
                    {productResults.map((p: any) => (
                      <button
                        type="button"
                        key={p.product_id}
                        onClick={() => insertProductText(p)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-sm flex justify-between items-center gap-2"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ${Number(p.price).toLocaleString("es-CO")}
                        </span>
                      </button>
                    ))}
                    {!searchingProducts && productQuery.length > 1 && productResults.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">Sin resultados</p>
                    )}
                    {productQuery.length <= 1 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">Escribe al menos 2 caracteres</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Quick replies */}
              <Popover open={quickRepliesOpen} onOpenChange={setQuickRepliesOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    <Zap className="h-3 w-3" /> Respuestas
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Respuestas rápidas</p>
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => { setQuickRepliesOpen(false); setManageQrOpen(true); }}
                        title="Gestionar respuestas"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {quickReplies.map((qr: any) => (
                      <button
                        type="button"
                        key={qr.id}
                        onClick={() => insertQuickReply(qr.body)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-accent"
                      >
                        <p className="text-xs font-medium">{qr.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{qr.body}</p>
                      </button>
                    ))}
                    {quickReplies.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        {isAdmin ? "Sin respuestas aún — usa el ⚙ para crear" : "Sin respuestas preGuardadas"}
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* AI suggestion */}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={askAiSuggestion}
                disabled={aiSuggesting}
                title="Genera una sugerencia de respuesta basada en la conversación"
              >
                {aiSuggesting
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Sparkles className="h-3 w-3" />}
                {aiSuggesting ? "Pensando…" : "¿Cómo respondería?"}
              </Button>
            </div>

            {/* Reply input */}
            <div className="flex gap-2">
              <Input
                placeholder="Escribe una respuesta…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                disabled={sending}
              />
              <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <MessageCircle className="h-12 w-12 mx-auto opacity-20" />
            <p>Selecciona una conversación</p>
          </div>
        </div>
      )}

      {/* ── Manage quick replies dialog ─────────────────────────── */}
      <Dialog open={manageQrOpen} onOpenChange={setManageQrOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestionar respuestas rápidas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Existing */}
            <div className="max-h-52 overflow-y-auto space-y-1">
              {quickReplies.map((qr: any) => (
                <div key={qr.id} className="flex items-start gap-2 p-2 rounded border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{qr.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{qr.body}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => deleteQuickReply(qr.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {quickReplies.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin respuestas aún</p>
              )}
            </div>

            {/* New reply form */}
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium">Nueva respuesta</p>
              <Input
                placeholder="Título corto (ej. Saludo, Horarios…)"
                value={newQrTitle}
                onChange={(e) => setNewQrTitle(e.target.value)}
              />
              <Textarea
                placeholder="Texto del mensaje…"
                value={newQrBody}
                onChange={(e) => setNewQrBody(e.target.value)}
                rows={3}
              />
              <Button
                size="sm"
                onClick={saveQuickReply}
                disabled={!newQrTitle.trim() || !newQrBody.trim()}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
