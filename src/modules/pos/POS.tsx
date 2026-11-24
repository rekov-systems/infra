import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useOpenSession } from "@/hooks/useOpenSession";
import { useCart } from "@/stores/cart";
import { useHardware } from "@/hooks/useHardware";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CategoryBar } from "./CategoryBar";
import { ProductGrid } from "./ProductGrid";
import { TicketPanel } from "./TicketPanel";
import { PaymentDialog, type PayMethod } from "./PaymentDialog";
import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { Search, Wallet, LockKeyhole, UtensilsCrossed, UserRound, X, Heart, ScanLine, Minus, Plus, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { CHANNELS, resolvePrice, type SalesChannel } from "@/lib/channels";
import { cn } from "@/lib/utils";
import { ModifierSelector, validateModifiers, type SelectedModifier } from "@/components/shared/ModifierSelector";
import { isCategoryActive } from "@/modules/products/Categories";
import { useProducts } from "@/hooks/useProducts";
import { BrandBar } from "@/components/shared/BrandBar";
import { TickRail } from "@/components/shared/TickRail";
import { LiveDot } from "@/components/shared/LiveDot";
import { useDevMode } from "@/hooks/useDevMode";

export default function POS() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId, branchId, branches, activeChannels } = useTenantContext();
  const { devMode } = useDevMode();
  const { lines, total, clear, add } = useCart();
  const { data: openSession } = useOpenSession(branchId);
  const { onBarcodeScanned, printTicket, openDrawer } = useHardware();

  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [channel, setChannel] = useState<SalesChannel>("pos");
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdown, setCustomerDropdown] = useState(false);
  const [modifierProduct, setModifierProduct] = useState<any | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<SelectedModifier[]>([]);
  const [modifierGroups, setModifierGroups] = useState<any[]>([]);
  const [upsellProduct, setUpsellProduct] = useState<any | null>(null);
  const [upsellItems, setUpsellItems] = useState<any[]>([]);

  /* Zoom: 1=compact (5 cols / 72px), 2=medium (4 cols / 96px), 3=large (3 cols / 128px) */
  const [zoom, setZoom] = useState(2);
  const zoomInputRef = useRef<HTMLInputElement>(null);
  const ZOOM_COLS:  Record<number, number> = { 1: 5, 2: 4, 3: 3 };
  const ZOOM_THUMB: Record<number, number> = { 1: 72, 2: 96, 3: 128 };

  const branchName = branches.find((b) => b.id === branchId)?.name ?? "—";

  const { data: todayMetrics } = useQuery({
    queryKey: ["pos-today-metrics", branchId],
    enabled: !!branchId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("sales")
        .select("id, total")
        .eq("branch_id", branchId!)
        .eq("status", "completed")
        .gte("created_at", today.toISOString());
      const count      = data?.length ?? 0;
      const totalSales = data?.reduce((s, r) => s + Number(r.total), 0) ?? 0;
      return { count, totalSales, avgTicket: count ? Math.round(totalSales / count) : 0 };
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["pos-categories", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("categories")
          .select("id, name, color, schedule_enabled, schedule_from, schedule_until, schedule_days, status, sort_order")
          .eq("tenant_id", tenantId!)
          .eq("status", "active")
          .order("name");
        
        if (error) throw error;

        const now = new Date().toISOString();
        if (data && data.length > 0) {
          await db.categories.bulkPut(data.map(c => ({ 
            ...c, 
            tenant_id: tenantId!, 
            schedule_days: (c.schedule_days as unknown as string[]) ?? null, 
            _cached_at: now 
          })));
        }
        return (data ?? []).filter(isCategoryActive);
      } catch {
        const cached = await db.categories.where("tenant_id").equals(tenantId!).toArray();
        return cached.filter(isCategoryActive as any);
      }
    },
  });

  const { data: tenant } = useQuery({
    queryKey: ["pos-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name, receipt_config")
        .eq("id", tenantId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: products } = useProducts(tenantId);

  const { data: stocks } = useQuery({
    queryKey: ["pos-stocks", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase.from("inventory_stocks").select("product_id, quantity").eq("branch_id", branchId!);
      return data ?? [];
    },
  });

  const { data: branchProducts } = useQuery({
    queryKey: ["pos-branch-products", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("branch_products")
          .select("product_id, branch_id, is_available, local_price")
          .eq("branch_id", branchId!);
        const now = new Date().toISOString();
        if (data && data.length > 0) {
          await db.branch_products.bulkPut(data.map(bp => ({
            id: `${bp.product_id}:${bp.branch_id}`,
            product_id: bp.product_id,
            branch_id: bp.branch_id,
            is_available: bp.is_available,
            local_price: bp.local_price ?? null,
            _cached_at: now,
          })));
        }
        return data ?? [];
      } catch {
        const cached = await db.branch_products.where("branch_id").equals(branchId!).toArray();
        return cached.map(bp => ({
          product_id: bp.product_id,
          branch_id: bp.branch_id,
          is_available: bp.is_available,
          local_price: bp.local_price,
        }));
      }
    },
  });

  const { data: channelPrices } = useQuery({
    queryKey: ["pos-channel-prices", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_channel_prices")
        .select("product_id, branch_id, channel, price")
        .eq("tenant_id", tenantId!);
      return data ?? [];
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-pos", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("customers")
        .select("id, name, phone, document_number, loyalty_points")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
  });
  
  const { data: tables } = useQuery({
    queryKey: ["pos-tables", branchId],
    enabled: !!branchId && channel === "tables",
    queryFn: async () => {
      const { data } = await supabase.from("tables")
        .select("id, name, status")
        .eq("branch_id", branchId!)
        .order("name");
      return data ?? [];
    },
  });

  const selectedCustomer = customers?.find((c) => c.id === customerId);
  const filteredCustomers = customers?.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone ?? "").includes(customerSearch) ||
      (c.document_number ?? "").includes(customerSearch)
  ) ?? [];

  const { data: pendingTables } = useQuery({
    queryKey: ["pos-pending-tables", branchId],
    enabled: !!branchId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { count } = await supabase
        .from("table_orders")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId!)
        .eq("status", "sent_to_cashier");
      return count ?? 0;
    },
  });

  const stockMap = useMemo(() => {
    const m: Record<string, number> = {};
    (stocks ?? []).forEach((s) => { m[s.product_id] = Number(s.quantity); });
    return m;
  }, [stocks]);

  // Filter products by branch availability (if branch catalog has any rows for that branch).
  // If no branch_products row exists for a product, it's available by default (greenfield mode).
  const branchAvailability = useMemo(() => {
    const m: Record<string, boolean> = {};
    (branchProducts ?? []).forEach((bp) => { m[bp.product_id] = bp.is_available; });
    return m;
  }, [branchProducts]);

  // Compute resolved price per product for the active channel
  const priced = useMemo(() => {
    const list = products ?? [];
    return list
      .filter((p) => branchAvailability[p.id] !== false) // hidden only if explicitly disabled
      .map((p) => ({
        ...p,
        price: resolvePrice(
          p.id,
          Number(p.price),
          branchId,
          channel,
          channelPrices ?? [],
          branchProducts ?? []
        ),
      }));
  }, [products, branchAvailability, branchProducts, channelPrices, branchId, channel]);

  const filtered = useMemo(() => {
    let list = priced;
    if (activeCat !== "all") list = list.filter((p) => p.category_id === activeCat);
    if (search)
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode ?? "").toLowerCase().includes(search.toLowerCase())
      );
    return list;
  }, [priced, activeCat, search]);

  const handleAddProduct = useCallback(async (product: any) => {
    const { data: groups } = await supabase
      .from("modifier_groups")
      .select("*, modifier_options(*)")
      .eq("product_id", product.id)
      .order("sort_order");
    
    const activeGroups = (groups ?? []).filter((g) =>
      (g.modifier_options ?? []).some((o) => o.is_available)
    );

    if (activeGroups.length > 0) {
      setModifierGroups(activeGroups);
      setModifierProduct(product);
      setPendingModifiers([]);
    } else {
      add(product);
      // Upselling: show complementary products
      const { data: comps } = await supabase
        .from("product_complementaries")
        .select("complementary_id, products!complementary_id(id, name, price, image_url, category_id)")
        .eq("product_id", product.id)
        .order("sort_order")
        .limit(3);
      
      const items = (comps ?? []).map((c) => c.products).filter(Boolean);
      if (items.length > 0) {
        setUpsellProduct(product);
        setUpsellItems(items);
      }
    }
  }, [add]);

  const confirmModifiers = async () => {
    if (!modifierProduct) return;
    const validationError = validateModifiers(modifierGroups, pendingModifiers);
    if (validationError) return toast.error(validationError);
    const extraPrice = pendingModifiers.reduce((s, m) => s + m.price_delta, 0);
    add({ ...modifierProduct, price: Number(modifierProduct.price) + extraPrice, _modifiers: pendingModifiers });
    setModifierProduct(null);
    setPendingModifiers([]);
    setModifierGroups([]);

    // Fetch complementary products for upselling
    const { data: comps } = await supabase
      .from("product_complementaries")
      .select("complementary_id, products!complementary_id(id, name, price, image_url, category_id)")
      .eq("product_id", modifierProduct.id)
      .order("sort_order")
      .limit(3);
    const items = (comps ?? []).map((c: any) => c.products).filter(Boolean);
    if (items.length > 0) { setUpsellProduct(modifierProduct); setUpsellItems(items); }
  };

  // Escáner de código de barras → añade automáticamente al carrito
  useEffect(() => {
    return onBarcodeScanned((code) => {
      const product = priced.find(
        (p) => p.barcode === code || p.sku === code
      );
      if (product) {
        handleAddProduct(product);
        toast.success(`${product.name} añadido`, { duration: 1500 });
      } else {
        toast.error(`Código "${code}" no encontrado`, { duration: 2500 });
      }
    });
  }, [onBarcodeScanned, priced, handleAddProduct]);

  const totalNum = total();

  const isPos = channel === "pos";
  const canCharge = isPos ? !!openSession : true;

  const checkoutMutation = useOfflineMutation({
    type: 'CHECKOUT_SALE',
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.rpc("checkout_sale", payload);
      if (error) throw error;
      return data as string;
    }
  });

  const finalize = async (method: PayMethod, _tendered: number, tipAmount: number, couponCode?: string, discountAmount = 0) => {
    if (!tenantId || !branchId) return;
    if (lines.length === 0) return toast.error("Agrega productos al ticket");
    if (isPos && !openSession) return toast.error("Debes abrir caja antes de vender en presencial");

    setSubmitting(true);
    try {
      const items = lines.map((l) => ({
        product_id: l.product.id,
        quantity: l.quantity,
        unit_price: Number(l.product.price),
        tax_rate: Number(l.product.tax_rate),
        discount: l.discount || 0,
        modifiers: l.product._modifiers ?? [],
      }));
      const payableTotal = Math.max(0, totalNum - discountAmount + tipAmount);
      const payments = [{ method, amount: payableTotal, reference: null as string | null }];
      
      const saleId = await checkoutMutation.mutateAsync({
        _tenant_id: tenantId,
        _branch_id: branchId,
        _items: items,
        _payments: payments,
        _discount_total: discountAmount,
        _notes: null,
        _customer_id: customerId,
        _channel: channel,
        _tip_amount: tipAmount,
        _coupon_code: couponCode ?? null,
        _client_mutation_id: crypto.randomUUID(),
      });

      const queuedOffline = !saleId || typeof saleId !== "string";
      toast.success(
        queuedOffline
          ? `Venta guardada en cola · ${formatCurrency(payableTotal)}`
          : `Venta registrada · ${formatCurrency(payableTotal)}`
      );
      if (saleId && typeof saleId === "string") {
        try {
          const { data: sale } = await supabase
            .from("sales")
            .select("ticket_number, subtotal, tax_total, total, discount_total, tip_amount")
            .eq("id", saleId)
            .maybeSingle();

          const receiptConfig = (tenant?.receipt_config as Record<string, any>) ?? {};
          await printTicket({
            ticketNumber: sale?.ticket_number ?? saleId.slice(0, 8),
            businessName: tenant?.name ?? "POSS360T",
            branchName,
            items: lines.map((line) => ({
              name: line.product.name,
              quantity: line.quantity,
              unitPrice: Number(line.product.price),
              total: Number(line.product.price) * line.quantity - (line.discount || 0),
            })),
            subtotal: Number(sale?.subtotal ?? totalNum),
            discountTotal: Number(sale?.discount_total ?? discountAmount),
            taxTotal: Number(sale?.tax_total ?? 0),
            tipAmount: Number(sale?.tip_amount ?? tipAmount),
            total: Number(sale?.total ?? payableTotal),
            payments: payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
            notes: receiptConfig.footer_text || undefined,
            date: new Date().toISOString(),
          });
          if (method === "cash") await openDrawer();
        } catch (hwErr: any) {
          // La venta ya quedó registrada en BD; un fallo del hardware no debe
          // bloquear el cierre del ticket ni provocar que el cajero cobre dos veces.
          toast.warning("Venta registrada, pero la impresora o gaveta fallaron", {
            description: hwErr?.message ?? "Revisa el hardware antes del próximo ticket",
          });
        }
      }
      clear();
      setPaymentOpen(false);
      setCustomerId(null);
      setCustomerSearch("");
      qc.invalidateQueries({ queryKey: ["open-session"] });
      qc.invalidateQueries({ queryKey: ["pos-stocks"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    } catch (err: any) {
      toast.error(err.message ?? "No se pudo finalizar la venta");
    } finally { setSubmitting(false); }
  };

  const sendToTableMutation = useOfflineMutation({
    type: "UPSERT_TABLE_ORDER_ITEMS",
    mutationFn: async (payload: any) => upsertTableOrderItems(payload),
  });

  const handleSendToTable = async () => {
    if (!selectedTableId) return toast.error("Selecciona una mesa primero");
    if (lines.length === 0) return toast.error("Agrega productos al ticket");

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const items = lines.map((l) => {
        const unitPrice = Number(l.product.price);
        const qty = l.quantity;
        const disc = l.discount || 0;
        const taxRate = Number((l.product as any).tax_rate || 0);
        const lineBase = unitPrice * qty - disc;
        return {
          product_id: l.product.id,
          product_name: l.product.name,
          product_type: l.product.product_type || "simple",
          quantity: qty,
          unit_price: unitPrice,
          tax_rate: taxRate,
          discount: disc,
          modifiers: l.product._modifiers ?? [],
          line_total: lineBase + (lineBase * taxRate) / 100,
        };
      });
      
      const result = await sendToTableMutation.mutateAsync({
        tenant_id: tenantId!,
        branch_id: branchId!,
        table_id: selectedTableId,
        waiter_id: user?.id ?? null,
        items,
      });

      toast.success(
        result && typeof result === "string"
          ? "Comanda enviada a la mesa"
          : "Comanda guardada en cola offline"
      );
      clear();
      setSelectedTableId(null);
      qc.invalidateQueries({ queryKey: ["pos-tables"] });
      qc.invalidateQueries({ queryKey: ["table-orders-open"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["pending-table-orders"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2" && lines.length > 0 && canCharge) { e.preventDefault(); setPaymentOpen(true); }
      if (e.key === "Escape" && paymentOpen) setPaymentOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lines.length, canCharge, paymentOpen]);

  const zoomPct = ((zoom - 1) / 2) * 100;
  useLayoutEffect(() => {
    zoomInputRef.current?.style.setProperty("--zp", `${zoomPct}%`);
  }, [zoomPct]);

  return (
    <div className="h-screen flex flex-col g-pos-root">

      {/* ── Brand bar ───────────────────────────────────────── */}
      <div className="flex items-stretch shrink-0">
        <div className="flex-1">
          <BrandBar
            branch={branchName}
            session={`Caja · ${branchName}`}
            channel={CHANNELS.find((c) => c.id === channel)?.label ?? "Local"}
            showSync={!!openSession}
          />
        </div>
        <Link
          to="/dashboard"
          className="flex items-center gap-1.5 shrink-0 px-4 border-l text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Volver al panel principal"
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="hidden sm:inline font-medium">Panel</span>
        </Link>
      </div>

      {/* ── Sub-header: channels + metrics ticker ─────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card/60 flex-wrap shrink-0">
        <span className="eyebrow eyebrow-muted text-[9px] shrink-0">CANAL</span>

        {CHANNELS.filter(c => activeChannels.includes(c.id)).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChannel(c.id)}
            className={cn("chan-chip", channel === c.id && "is-active")}
          >
            {c.label}
          </button>
        ))}

        {/* Table selector (inline when tables channel active) */}
        {channel === "tables" && (tables ?? []).length > 0 && (
          <>
            <div className="h-5 w-px bg-border mx-1 shrink-0" />
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hidden">
              {(tables ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTableId(t.id)}
                  className={cn(
                    "chan-chip shrink-0",
                    selectedTableId === t.id && "is-active",
                    t.status === "occupied" && selectedTableId !== t.id && "border-amber-400/40 text-amber-600"
                  )}
                >
                  <span className={cn("live-dot shrink-0 w-1.5 h-1.5",
                    t.status === "available" ? "bg-[#10B981]" : "live-dot-amber")} />
                  {t.name}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Today's metrics ticker */}
        {todayMetrics && (
          <TickRail items={[
            { key: "VENTAS HOY", value: formatCurrency(todayMetrics.totalSales) },
            { key: "TICKETS",    value: String(todayMetrics.count) },
            { key: "PROM",       value: formatCurrency(todayMetrics.avgTicket) },
          ]} />
        )}

        {/* Pending tables badge */}
        {(pendingTables ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => navigate("/cash")}
            className="s-pill s-pill-blue gap-1"
          >
            <UtensilsCrossed className="h-3 w-3" />
            {pendingTables} mesa{pendingTables !== 1 ? "s" : ""}
          </button>
        )}

        {/* Cash session status */}
        {isPos && (openSession ? (
          <span className="s-pill s-pill-green">
            <LiveDot /> Caja abierta
          </span>
        ) : (
          <span className="s-pill s-pill-danger">
            <LockKeyhole className="h-3 w-3" /> Sin caja
          </span>
        ))}
      </div>

      {/* ── No-session warning ───────────────────────────── */}
      {isPos && !openSession && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 flex items-center justify-between gap-3 shrink-0">
          <span className="text-sm"><strong>Caja cerrada</strong> · Abre la caja para registrar ventas presenciales.</span>
          <Button asChild size="sm" variant="default"><Link to="/cash">Abrir caja</Link></Button>
        </div>
      )}

      {/* ── Main body ────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[1fr_420px] lg:grid-rows-1 overflow-hidden min-h-0">

        {/* LEFT: catalog */}
        <div className="flex flex-col overflow-hidden min-h-0 border-r">

          {/* Search row */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
            {/* Search input */}
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[14px] border bg-card focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="search"
                placeholder="Buscar producto, SKU o código de barras…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd className="hidden sm:inline-flex h-5 px-1.5 items-center rounded border border-border font-mono text-[10px] text-muted-foreground bg-muted">F2</kbd>
            </div>

            {/* EAN scan button */}
            <button type="button" className="chan-chip shrink-0">
              <ScanLine className="h-3.5 w-3.5" /> EAN
            </button>

            {/* Customer selector */}
            <div className="relative shrink-0">
              {selectedCustomer ? (
                <div className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-primary/30 bg-primary/10 text-sm font-medium text-primary">
                  <UserRound className="h-3.5 w-3.5" />
                  {selectedCustomer.name}
                  {selectedCustomer.loyalty_points !== undefined && (
                    <Badge variant="outline" className="h-5 px-1.5 gap-0.5 text-[10px] font-black border-amber-500/30 bg-amber-500/10 text-amber-600">
                      <Heart className="h-2 w-2 fill-current" /> {selectedCustomer.loyalty_points}
                    </Badge>
                  )}
                  <button type="button" aria-label="Limpiar cliente"
                    onClick={() => { setCustomerId(null); setCustomerSearch(""); }}
                    className="text-primary/60 hover:text-primary ml-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <>
                  <UserRound className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Cliente…"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setCustomerDropdown(true); }}
                    onFocus={() => setCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setCustomerDropdown(false), 200)}
                    className="h-9 pl-8 pr-3 rounded-full border border-border bg-card text-sm w-36 focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  {customerDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute top-full right-0 mt-1 w-60 bg-popover border rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                      {filteredCustomers.slice(0, 10).map((c) => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setCustomerId(c.id); setCustomerSearch(""); setCustomerDropdown(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-muted flex flex-col">
                          <span className="text-sm font-medium">{c.name}</span>
                          {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Category chips */}
          <div className="px-4 border-b shrink-0">
            <CategoryBar
              categories={categories ?? []}
              active={activeCat}
              onChange={setActiveCat}
              productCount={filtered.length}
            />
          </div>

          {/* Catalog panel */}
          <div className="flex flex-col flex-1 min-h-0 px-4 py-3 gap-2">
            {/* Catalog header: eyebrow + zoom rail */}
            <div className="flex items-center justify-between shrink-0">
              <span className="eyebrow eyebrow-blue">
                CATÁLOGO · {filtered.length} ÍTEMS
              </span>
              <div className="flex items-center gap-3">
                {/* Zoom rail */}
                <div className="zoom-rail">
                  <button type="button" aria-label="Reducir" onClick={() => setZoom((z) => Math.max(1, z - 1))}>
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    ref={zoomInputRef}
                    type="range" min={1} max={3} step={1} value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    aria-label="Tamaño de productos"
                  />
                  <button type="button" aria-label="Ampliar" onClick={() => setZoom((z) => Math.min(3, z + 1))}>
                    <Plus className="h-3 w-3" />
                  </button>
                  <Search className="h-3 w-3 ml-1 text-muted-foreground" />
                </div>
                <span className="text-[11px] text-muted-foreground hidden sm:block">
                  Esta sucursal
                </span>
              </div>
            </div>

            {/* Product grid */}
            <ProductGrid
              products={filtered}
              stockMap={stockMap}
              devMode={devMode}
              onSelect={handleAddProduct}
              thumbHeight={ZOOM_THUMB[zoom]}
              columns={ZOOM_COLS[zoom]}
            />
          </div>
        </div>

        {/* RIGHT: ticket */}
        <TicketPanel
          canCharge={canCharge}
          reasonDisabled={isPos && !openSession ? "Abre caja para cobrar" : undefined}
          onCharge={() => setPaymentOpen(true)}
          onSendToTable={channel === "tables" ? handleSendToTable : undefined}
        />
      </div>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        total={totalNum}
        tenantId={tenantId}
        submitting={submitting}
        onConfirm={finalize}
      />

      {/* Upselling dialog */}
      <Dialog open={!!upsellProduct && upsellItems.length > 0} onOpenChange={open => { if (!open) { setUpsellProduct(null); setUpsellItems([]); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">¿Agregar algo más?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {upsellItems.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(Number(p.price))}</p>
                </div>
                <Button size="sm" variant="outline" className="shrink-0"
                  onClick={() => { add(p); setUpsellProduct(null); setUpsellItems([]); }}>
                  Agregar
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => { setUpsellProduct(null); setUpsellItems([]); }}>
            No, gracias
          </Button>
        </DialogContent>
      </Dialog>

      {/* Modifier selection dialog */}
      <Dialog open={!!modifierProduct} onOpenChange={open => { if (!open) { setModifierProduct(null); setPendingModifiers([]); setModifierGroups([]); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{modifierProduct?.name}</DialogTitle>
          </DialogHeader>
          {modifierProduct && (
            <>
              <ModifierSelector
                productId={modifierProduct.id}
                selected={pendingModifiers}
                onChange={setPendingModifiers}
              />
              <Button className="w-full mt-2" onClick={confirmModifiers}>
                Agregar al carrito
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function upsertTableOrderItems(payload: {
  tenant_id: string;
  branch_id: string;
  table_id: string;
  waiter_id: string | null;
  items: any[];
  _client_mutation_id?: string;
}) {
  const { data, error } = await supabase.rpc("upsert_table_order_items", {
    _tenant_id: payload.tenant_id,
    _branch_id: payload.branch_id,
    _table_id: payload.table_id,
    _waiter_id: payload.waiter_id,
    _items: payload.items,
    _client_mutation_id: payload._client_mutation_id ?? null,
  });
  if (error) throw error;
  return data as string;
}
