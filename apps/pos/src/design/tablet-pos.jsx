/* global React, I, GearMark, Eyebrow, Pill, LiveDot, Divider, Lockup, BrandBar, TickRail, COP */
const { useState, useMemo } = React;

/* ===== Demo data ===== */
const CATS = [
  { id: "all",    label: "Todos",       hue: "blue",   n: 142 },
  { id: "burg",   label: "Hamburguesas", hue: "rose",  n: 18 },
  { id: "pizza",  label: "Pizzas",       hue: "amber", n: 14 },
  { id: "beb",    label: "Bebidas",      hue: "cyan",  n: 32 },
  { id: "post",   label: "Postres",      hue: "violet", n: 12 },
  { id: "comb",   label: "Combos",       hue: "green", n: 9 },
  { id: "extra",  label: "Adicionales",  hue: "slate", n: 22 },
  { id: "des",    label: "Desayunos",    hue: "lime",  n: 11 },
];

const PRODS = [
  { id: 1, n: "Smash Doble Tocineta", cat: "burg", hue: "rose",  px: 28900, sku: "SMSH-2T", st: 24 },
  { id: 2, n: "Burger Clásica",        cat: "burg", hue: "rose",  px: 22500, sku: "BCL-01", st: 41 },
  { id: 3, n: "Pollo Crispy BBQ",      cat: "burg", hue: "rose",  px: 24900, sku: "BPB-03", st: 18 },
  { id: 4, n: "Pizza Pepperoni 30cm",  cat: "pizza", hue: "amber", px: 38000, sku: "PZ-PEP", st: 12 },
  { id: 5, n: "Pizza Hawaiana 30cm",   cat: "pizza", hue: "amber", px: 36500, sku: "PZ-HAW", st: 10 },
  { id: 6, n: "Pizza Cuatro Quesos",   cat: "pizza", hue: "amber", px: 39900, sku: "PZ-4Q",  st: 6 },
  { id: 7, n: "Limonada Cerezada",     cat: "beb",   hue: "cyan",  px: 9500,  sku: "BEB-LCZ", st: 80 },
  { id: 8, n: "Coca Cola 350ml",       cat: "beb",   hue: "cyan",  px: 5500,  sku: "BEB-CC", st: 220 },
  { id: 9, n: "Cerveza Club Colombia", cat: "beb",   hue: "cyan",  px: 8900,  sku: "BEB-CLU", st: 64 },
  { id: 10, n: "Brownie con Helado",   cat: "post",  hue: "violet", px: 14500, sku: "PST-BHL", st: 14 },
  { id: 11, n: "Cheesecake Maracuyá",  cat: "post",  hue: "violet", px: 13900, sku: "PST-CCM", st: 9 },
  { id: 12, n: "Combo Smash + Fries",  cat: "comb",  hue: "green", px: 32500, sku: "CMB-SF", st: 999 },
  { id: 13, n: "Combo Familiar Pizza", cat: "comb",  hue: "green", px: 78000, sku: "CMB-FP", st: 999 },
  { id: 14, n: "Papas Rústicas",       cat: "extra", hue: "slate", px: 7900,  sku: "EX-PR",  st: 60 },
  { id: 15, n: "Aros de Cebolla",      cat: "extra", hue: "slate", px: 8500,  sku: "EX-AC",  st: 38 },
  { id: 16, n: "Huevos Rancheros",     cat: "des",   hue: "lime",  px: 18900, sku: "DES-HR", st: 22 },
];

function ProductTile({ p, onAdd }) {
  const letter = p.n[0];
  return (
    <div className={`tile hue-${p.hue}`} onClick={() => onAdd(p)}>
      <div className="tile-thumb">
        <div className="tile-thumb-letter">{letter}</div>
        {p.st < 12 && (
          <div style={{ position: "absolute", top: 8, right: 8 }}>
            <Pill kind="warn" style={{ padding: "2px 8px", fontSize: 9 }}>{p.st} STOCK</Pill>
          </div>
        )}
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div className="pt-name" style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "#fff",
                      lineHeight: 1.25, height: 32, overflow: "hidden", textWrap: "pretty" }}>
          {p.n}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
          <span className="pt-price" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, color: "#fff" }}>
            {COP(p.px)}
          </span>
          <span className="pt-sku" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "hsl(213 30% 55%)" }}>{p.sku}</span>
        </div>
      </div>
    </div>
  );
}

function CategoryRail({ cats, active, onPick }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0" }}>
      {cats.map(c => (
        <button key={c.id} className={`chan-chip ${active === c.id ? "is-active" : ""}`} onClick={() => onPick(c.id)} title={`Filtrar por ${c.label}`}>
          {c.label}
          <span style={{ fontSize: 10, opacity: .7 }}>{c.n}</span>
        </button>
      ))}
    </div>
  );
}

/* ===== Tablet POS Terminal ===== */
function ZoomRail({ value, onChange, min = 1, max = 3 }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="zoom-rail" title="Tamaño de los productos">
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="Reducir tamaño"><I.Minus size={12} /></button>
      <input type="range" min={min} max={max} step={1} value={value}
             aria-label="Control deslizante de tamaño de productos"
             onChange={e => onChange(Number(e.target.value))}
             style={{ "--zp": pct + "%" }} />
      <button onClick={() => onChange(Math.min(max, value + 1))} aria-label="Aumentar tamaño"><I.Plus size={12} /></button>
      <I.Search size={12} style={{ marginLeft: 2 }} />
    </div>
  );
}

function TabletPOS() {
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState([
    { ...PRODS[0], qty: 1 },
    { ...PRODS[6], qty: 2 },
    { ...PRODS[13], qty: 1 },
  ]);
  const [chan, setChan] = useState("local");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(2); // 1=compacto, 2=medio, 3=grande
  const COLS = { 1: 5, 2: 4, 3: 3 }[zoom];
  const THUMB = { 1: 72, 2: 96, 3: 128 }[zoom];

  const filtered = useMemo(() => {
    return PRODS.filter(p => (cat === "all" || p.cat === cat) &&
      (search === "" || p.n.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())));
  }, [cat, search]);

  const subtotal = cart.reduce((s, l) => s + l.px * l.qty, 0);
  const iva = Math.round(subtotal * 0.08);
  const total = subtotal + iva;
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  function addToCart(p) {
    setCart(c => {
      const ex = c.find(x => x.id === p.id);
      if (ex) return c.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { ...p, qty: 1 }];
    });
  }
  function adjust(id, delta) {
    setCart(c => c.map(x => x.id === id ? { ...x, qty: Math.max(0, x.qty + delta) } : x).filter(x => x.qty > 0));
  }
  function remove(id) { setCart(c => c.filter(x => x.id !== id)); }

  return (
    <div className="ab-shell s-bg-navy ab-tablet">
      <BrandBar branch="Sucursal · Centro Mayor" session="Caja #02 · Camila R." channel="Local — Mostrador" />
      {/* Subheader: channels + ticker + actions */}
      <div className="pos-subheader">
        <Eyebrow>CANAL DE VENTA</Eyebrow>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "local",  label: "Local",   ic: I.Cart, title: "Venta local" },
            { id: "rappi",  label: "Rappi",   ic: I.Bike, title: "Venta Rappi" },
            { id: "didi",   label: "DiDi",    ic: I.Bike, title: "Venta DiDi Food" },
            { id: "ubr",    label: "Uber",    ic: I.Bike, title: "Venta Uber Eats" },
            { id: "dom",    label: "Domicilio", ic: I.Bike, title: "Venta a domicilio propia" },
          ].map(c => {
            const Ico = c.ic;
            return (
              <button key={c.id} className={`chan-chip ${chan === c.id ? "is-active" : ""}`} onClick={() => setChan(c.id)} title={c.title}>
                <Ico size={13} /> {c.label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        <TickRail items={[
          { k: "VENTAS HOY", v: "$ 4.182.500" },
          { k: "TICKETS",    v: "63" },
          { k: "TICKET PROM", v: "$ 66.388" },
          { k: "EFECTIVO",   v: "$ 1.245.000" },
        ]} />
      </div>

      {/* Body: products / cart */}
      <div className="tablet-body">
        {/* LEFT: Search + categories + grid */}
        <div className="tablet-left-panel">
          {/* Search bar */}
          <div style={{ display: "flex", gap: 10 }}>
            <div className="pos-search">
              <I.Search size={18} color="hsl(213 30% 60%)" />
              <input 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto, código o EAN…" 
                aria-label="Buscar producto"
              />
              <span className="kbd">F2</span>
            </div>
            <button className="btn btn-ghost" title="Escanear código de barras" style={{ height: 46, padding: "0 16px" }}>
              <I.Scan size={18} /> Escanear EAN
            </button>
            <button className="btn btn-ghost" title="Asignar cliente al pedido" style={{ height: 46, padding: "0 16px" }}>
              <I.User size={18} /> Cliente
            </button>
          </div>

          {/* Categories */}
          <CategoryRail cats={CATS} active={cat} onPick={setCat} />

          {/* Product grid */}
          <div className="pos-catalog-panel" style={{ "--tile-cols": COLS, "--thumb-h": THUMB + "px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
              <Eyebrow color="blue">CATÁLOGO · {filtered.length} ÍTEMS</Eyebrow>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ZoomRail value={zoom} onChange={setZoom} />
                <div style={{ display: "flex", gap: 6, alignItems: "center", color: "#94a3b8", fontSize: 11 }}>
                  <I.Filter size={12} /> Disponibles · Esta sucursal
                </div>
              </div>
            </div>
            <div className="pos-catalog-grid">
              {filtered.map(p => <ProductTile key={p.id} p={p} onAdd={addToCart} />)}
            </div>
          </div>
        </div>

        {/* RIGHT: Ticket / payment */}
        <aside className="pos-aside">
          {/* Header */}
          <div className="tablet-aside-header">
            <div>
              <Eyebrow color="blue">PEDIDO ACTIVO</Eyebrow>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                <span className="ticket-num" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>
                  Ticket <span className="gradient-text">#A-1284</span>
                </span>
              </div>
              <div className="ticket-meta" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                15:42 · Mostrador · Local
              </div>
            </div>
            <button className="btn btn-ghost" title="Mantener pedido en espera" style={{ padding: "6px 12px", fontSize: 11 }}>
              <I.Pkg size={14} /> Mantener
            </button>
          </div>

          {/* Items */}
          <div className="cart-items-wrapper">
            {cart.length === 0 ? (
              <div style={{ padding: "48px 12px", textAlign: "center", color: "#64748b" }}>
                <I.Cart size={28} />
                <div style={{ marginTop: 10, fontSize: 13 }}>Toca un producto para empezar</div>
              </div>
            ) : cart.map(l => (
              <div key={l.id} className="cart-line">
                <div style={{ width: 42, height: 42, borderRadius: 10,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontFamily: "var(--font-display)", fontWeight: 700, color: "#fff", overflow: "hidden", position: "relative" }}
                     className={`hue-${l.hue}`}>
                  <div className="tile-thumb" style={{ position: "absolute", inset: 0, height: "100%" }} />
                  <span style={{ position: "relative", zIndex: 1 }}>{l.n[0]}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cl-name" style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.n}</div>
                  <div className="cl-meta" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748b" }}>{l.sku} · {COP(l.px)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button className="btn btn-ghost" title="Quitar uno" style={{ width: 28, height: 28, padding: 0 }} onClick={() => adjust(l.id, -1)}><I.Minus size={14} /></button>
                  <span style={{ width: 24, textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 700 }}>{l.qty}</span>
                  <button className="btn btn-ghost" title="Agregar uno" style={{ width: 28, height: 28, padding: 0 }} onClick={() => adjust(l.id, 1)}><I.Plus size={14} /></button>
                </div>
                <div className="cl-total" style={{ width: 80, textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>
                  {COP(l.px * l.qty)}
                </div>
                <button title="Eliminar ítem" onClick={() => remove(l.id)} style={{ background: "transparent", border: 0, color: "#475569", cursor: "pointer" }}><I.X size={14} /></button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="pos-aside-foot" style={{ padding: "12px 18px" }}>
            <div className="totals-row" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", padding: "4px 0" }}>
              <span>Subtotal · {itemCount} ítems</span><span>{COP(subtotal)}</span>
            </div>
            <div className="totals-row" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", padding: "4px 0" }}>
              <span>IVA 8%</span><span>{COP(iva)}</span>
            </div>
            <div className="totals-row is-disc" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#10B981", padding: "4px 0" }}>
              <span>Descuento aplicado</span><span>— $ 0</span>
            </div>
            <Divider />
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "12px 0 6px" }}>
              <Eyebrow>TOTAL A COBRAR</Eyebrow>
              <div className="big-number" style={{ fontSize: 44 }}>{COP(total)}</div>
            </div>

            {/* Payment row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
              {[
                { ic: I.Cash,   l: "Efectivo", title: "Pago en efectivo" },
                { ic: I.Card,   l: "Tarjeta", title: "Pago con tarjeta" },
                { ic: I.Qr,     l: "QR / Nequi", title: "Pago por QR / Nequi" },
                { ic: I.Wallet, l: "Mixto", title: "Pago combinado" },
              ].map((m, i) => {
                const Ico = m.ic;
                return (
                  <button key={i} className="btn btn-ghost" title={m.title} style={{ flexDirection: "column", padding: "10px 6px", gap: 4 }}>
                    <Ico size={18} />
                    <span style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase" }}>{m.l}</span>
                  </button>
                );
              })}
            </div>

            <button className="btn btn-success" title={`Cobrar ${COP(total)} (F12)`} style={{ width: "100%", marginTop: 10, height: 56, fontSize: 16 }}>
              <I.Check size={20} /> Cobrar {COP(total)} <span className="kbd" style={{ marginLeft: 6 }}>F12</span>
            </button>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button className="btn btn-ghost" title="Aplicar descuento manual" style={{ flex: 1 }}><I.Tag size={14} /> Descuento</button>
              <button className="btn btn-ghost" title="Imprimir pre-cuenta" style={{ flex: 1 }}><I.Print size={14} /> Pre-cuenta</button>
              <button className="btn btn-danger" title="Vaciar carrito" style={{ width: 44 }}><I.Trash size={14} /></button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

window.TabletPOS = TabletPOS;
window._POS_DATA = { CATS, PRODS };
