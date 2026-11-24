/* global React, I, GearMark, Eyebrow, Pill, LiveDot, Divider, Lockup, BrandBar, TickRail, COP */
const { useState } = React;

/* ===== Desktop dashboard (1440x900) ===== */
function DesktopPOS() {
  const nav = [
    { ic: I.Layout, l: "Dashboard", active: true },
    { ic: I.Cart,   l: "Terminal POS" },
    { ic: I.Table,  l: "Mesas" },
    { ic: I.Bike,   l: "Domicilios", n: 4 },
    { ic: I.Receipt, l: "Órdenes digitales", n: 12 },
    { ic: I.Pkg,    l: "Inventario" },
    { ic: I.Box,    l: "Productos" },
    { ic: I.Wallet, l: "Caja" },
    { ic: I.Users,  l: "Clientes" },
    { ic: I.Chart,  l: "Reportes" },
    { ic: I.Bag,    l: "Compras" },
    { ic: I.Bolt,   l: "Producción" },
  ];

  const channels = [
    { l: "Local",  v: 2.4, c: "#007BFF", pct: 58 },
    { l: "Rappi",  v: 1.1, c: "#FF441F", pct: 26 },
    { l: "DiDi",   v: 0.4, c: "#FAD400", pct: 10 },
    { l: "Uber",   v: 0.18, c: "#06D6A0", pct: 4 },
    { l: "Domicilio", v: 0.08, c: "#7C3AED", pct: 2 },
  ];

  const top = [
    { n: "Smash Doble Tocineta", c: 142, sales: 4103800, hue: "rose" },
    { n: "Pizza Pepperoni 30cm",  c: 98,  sales: 3724000, hue: "amber" },
    { n: "Combo Familiar Pizza",  c: 41,  sales: 3198000, hue: "green" },
    { n: "Limonada Cerezada",     c: 287, sales: 2726500, hue: "cyan" },
    { n: "Cerveza Club Colombia", c: 198, sales: 1762200, hue: "cyan" },
  ];

  const feed = [
    { t: "15:42", ch: "Local",  id: "A-1284", who: "Camila R.",  amt: 86200,  pay: "Efectivo", dot: "green" },
    { t: "15:41", ch: "Rappi",  id: "RP-99812", who: "WebHook",  amt: 64900,  pay: "Plataforma", dot: "blue" },
    { t: "15:39", ch: "DiDi",   id: "DD-44128", who: "WebHook",  amt: 142400, pay: "Plataforma", dot: "blue" },
    { t: "15:38", ch: "Mesa 8", id: "M-08-A",   who: "Mauricio A.", amt: 312500, pay: "Tarjeta", dot: "green" },
    { t: "15:36", ch: "Local",  id: "A-1283",   who: "Camila R.",  amt: 22500,  pay: "QR Nequi", dot: "green" },
    { t: "15:34", ch: "Domicilio", id: "DM-441",  who: "Andrés M.", amt: 96400, pay: "Mixto", dot: "amber" },
    { t: "15:30", ch: "Uber",   id: "UE-5512",  who: "WebHook", amt: 38900, pay: "Plataforma", dot: "blue" },
  ];

  return (
    <div className="ab-shell s-bg-navy ab-desktop">
      {/* Sidebar */}
      <aside className="ab-sidebar">
        <div style={{ padding: "0 8px 14px" }}>
          <Lockup size={32} sub="OPERACIÓN · CENTRO MAYOR" />
        </div>
        <div className="sidebar-branch-card">
          <Eyebrow color="blue">SUCURSAL ACTIVA</Eyebrow>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Centro Mayor</div>
            <I.ChevronD size={14} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 10, color: "#6EE7B7" }}>
            <LiveDot /> 4 cajas activas · Sync OK
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map((n, i) => {
            const Ico = n.ic;
            return (
              <div key={i} className={`nav-item ${n.active ? "is-active" : ""}`} title={n.l}>
                <Ico size={16} />
                <span style={{ flex: 1 }}>{n.l}</span>
                {n.n != null && <span style={{ background: "hsl(213 100% 50% / .25)", color: "#7AB6FF",
                  padding: "1px 8px", borderRadius: 9999, fontSize: 10, fontWeight: 700 }}>{n.n}</span>}
              </div>
            );
          })}
        </nav>

        <div className="s-glass sidebar-user-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg, #1F5A9C, #007BFF)",
                          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>CR</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Camila R.</div>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>Owner · Caja #02</div>
            </div>
            <button className="btn-icon" title="Ajustes de perfil" style={{ background: "transparent", border: 0, padding: 4, cursor: "pointer" }}>
              <I.Settings size={14} color="#94a3b8" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ab-main">
        {/* Top bar */}
        <div className="ab-topbar">
          <div>
            <Eyebrow>DASHBOARD · OPERACIÓN EN VIVO</Eyebrow>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>
              Buenas tardes, <span className="gradient-text">Camila</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div className="topbar-search">
            <I.Search size={14} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="Buscar producto, ticket, cliente…" 
              aria-label="Buscar en el sistema"
              style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 13 }}
            />
            <span className="kbd">⌘K</span>
          </div>
          <Pill><LiveDot /> SYSTEM OK</Pill>
          <button className="btn btn-ghost" title="Notificaciones" style={{ width: 38, height: 38, padding: 0 }}>
            <I.Bell size={16} />
          </button>
          <button className="btn btn-primary" title="Iniciar nueva venta">
            <I.Plus size={14} /> Nueva venta
          </button>
        </div>

        <div className="ab-content">
          {/* LEFT column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            {/* KPI strip */}
            <div className="kpi-grid">
              <div className="s-glass kpi-main-card">
                <Eyebrow color="blue">VENTAS HOY · TIEMPO REAL</Eyebrow>
                <div className="big-number" style={{ fontSize: 56, marginTop: 8 }}>$ 4.18M</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11, color: "#10B981" }}>
                  <I.Trend size={12} /> +18.4% vs ayer · meta 92%
                </div>
                <div className="meter" style={{ marginTop: 10 }}><i style={{ width: "92%" }} /></div>
                {/* sparkline */}
                <div className="bars" style={{ marginTop: 12 }}>
                  {[40, 55, 30, 70, 45, 90, 60, 80, 50, 95, 65, 88, 72, 100, 78, 92, 70, 84].map((h, i) =>
                    <i key={i} style={{ height: `${h}%` }} />)}
                </div>
              </div>

              {[
                { ey: "TICKETS", v: "63", tr: "+6", ic: I.Receipt },
                { ey: "TICKET PROM", v: "$ 66.388", tr: "+$ 4.2K", ic: I.Tag },
                { ey: "EFECTIVO EN CAJA", v: "$ 1.245k", tr: "Arqueo OK", ic: I.Cash },
              ].map((k, i) => {
                const Ico = k.ic;
                return (
                  <div key={i} className="s-glass" style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Eyebrow>{k.ey}</Eyebrow>
                      <Ico size={14} color="#475569" />
                    </div>
                    <div className="big-number-plain" style={{ fontSize: 28, marginTop: 10 }}>{k.v}</div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "#10B981" }}>{k.tr}</div>
                  </div>
                );
              })}
            </div>

            {/* Channels + production */}
            <div className="channels-prod-grid">
              <div className="s-glass channels-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <Eyebrow color="blue">MIX POR CANAL · HOY</Eyebrow>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginTop: 2 }}>
                      Local domina · plataformas digitales 42%
                    </div>
                  </div>
                  <Pill kind="mute">Últimas 8h</Pill>
                </div>
                {/* Stacked bar */}
                <div style={{ display: "flex", height: 14, borderRadius: 9999, overflow: "hidden",
                               border: "1px solid hsl(215 45% 22%)" }}>
                  {channels.map((c, i) => (
                    <div key={i} style={{ width: `${c.pct}%`, background: c.c }} />
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14 }}>
                  {channels.map((c, i) => (
                    <div key={i}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#cbd5e1" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 9999, background: c.c }} /> {c.l}
                      </div>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginTop: 4 }}>${c.v}M</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{c.pct}% del mix</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="s-glass kds-card">
                <Eyebrow color="blue">COCINA · KDS</Eyebrow>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                  {[
                    { l: "En cola",  v: 7,  c: "#FCD34D", ic: I.Clock },
                    { l: "Preparando", v: 4, c: "#7AB6FF", ic: I.Flame },
                    { l: "Listas",   v: 2, c: "#10B981", ic: I.Check },
                    { l: "Demoradas", v: 1, c: "#F87171", ic: I.Bell },
                  ].map((k, i) => {
                    const Ico = k.ic;
                    return (
                      <div key={i} style={{ padding: 12, borderRadius: 12, background: "hsl(216 60% 12%)",
                                            border: "1px solid hsl(215 45% 22%)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <Eyebrow style={{ color: k.c, fontSize: 9 }}>{k.l}</Eyebrow>
                          <Ico size={12} color={k.c} />
                        </div>
                        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, marginTop: 4 }}>{k.v}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "hsl(216 60% 12%)",
                              border: "1px dashed hsl(215 45% 26%)", fontSize: 11, color: "#94a3b8" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <LiveDot kind="amber" /> <strong style={{ color: "#FCD34D" }}>Mesa 03</strong> espera 14m · llamar mesero
                  </div>
                </div>
              </div>
            </div>

            {/* Top productos */}
            <div className="s-glass top-products-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <Eyebrow color="blue">TOP PRODUCTOS · ÚLTIMOS 7 DÍAS</Eyebrow>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>
                    El <span className="gradient-text">Smash Doble</span> dispara el ticket promedio
                  </div>
                </div>
                <button className="btn btn-ghost" title="Ver informe completo de productos" style={{ fontSize: 11 }}>
                  Ver todos <I.ArrowR size={12} />
                </button>
              </div>
              <div>
                {top.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 44px 1fr 80px 100px 140px",
                                        gap: 12, alignItems: "center", padding: "10px 0",
                                        borderBottom: i < top.length - 1 ? "1px solid hsl(215 30% 18%)" : 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#64748b" }}>#{i + 1}</div>
                    <div className={`hue-${p.hue}`} style={{ width: 44, height: 44, borderRadius: 10, position: "relative", overflow: "hidden" }}>
                      <div className="tile-thumb" style={{ height: 44 }}>
                        <div className="tile-thumb-letter" style={{ fontSize: 22 }}>{p.n[0]}</div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.n}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748b" }}>{p.c} unidades vendidas</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{p.c}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{COP(p.sales)}</div>
                    <div className="meter"><i style={{ width: `${100 - i * 14}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT column: live feed */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="s-glass live-feed-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Eyebrow color="blue">FEED EN VIVO</Eyebrow>
                <Pill><LiveDot /> AUTO</Pill>
              </div>
              <div style={{ marginTop: 12 }}>
                {feed.map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
                                        borderBottom: i < feed.length - 1 ? "1px dashed hsl(215 30% 22%)" : 0 }}>
                    <LiveDot kind={f.dot} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748b" }}>{f.t}</span>
                        <Pill kind="mute" style={{ padding: "1px 8px", fontSize: 9 }}>{f.ch}</Pill>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7AB6FF" }}>{f.id}</span>
                      </div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        <span style={{ color: "#94a3b8" }}>{f.who} · {f.pay}</span>
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{COP(f.amt)}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                <span>63 movimientos hoy</span>
                <button className="btn-link" title="Ver historial completo de movimientos" style={{ background: "transparent", border: 0, color: "#7AB6FF", cursor: "pointer", fontSize: 11 }}>
                  Ver historial →
                </button>
              </div>
            </div>

            <div className="s-glass inventory-alerts-card">
              <Eyebrow color="blue">INVENTARIO · ALERTAS</Eyebrow>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { n: "Pizza Cuatro Quesos", st: 6,  min: 12, hue: "amber" },
                  { n: "Cheesecake Maracuyá", st: 9,  min: 15, hue: "violet" },
                  { n: "Pizza Hawaiana 30cm", st: 10, min: 14, hue: "amber" },
                ].map((it, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10,
                                        borderRadius: 10, background: "hsl(216 60% 12%)", border: "1px solid hsl(215 45% 22%)" }}>
                    <div className={`hue-${it.hue}`} style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", position: "relative" }}>
                      <div className="tile-thumb" style={{ height: 36 }}>
                        <div className="tile-thumb-letter" style={{ fontSize: 18 }}>{it.n[0]}</div>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{it.n}</div>
                      <div style={{ fontSize: 10, color: "#FCD34D" }}>Quedan {it.st} · mín {it.min}</div>
                    </div>
                    <button className="btn btn-ghost" title={`Reabastecer ${it.n}`} style={{ padding: "4px 10px", fontSize: 11 }}>
                      Reabastecer
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="s-glass rappi-webhook-card">
              <Eyebrow color="blue">RAPPI · WEBHOOK</Eyebrow>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill kind="green"><LiveDot /> CONECTADO</Pill>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748b" }}>v3.2 · ping 142ms</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                  {[
                    { l: "Eventos hoy", v: "318" },
                    { l: "Aceptadas", v: "26" },
                    { l: "Rechazadas", v: "0" },
                  ].map((s, i) => (
                    <div key={i}>
                      <Eyebrow style={{ fontSize: 8 }}>{s.l}</Eyebrow>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginTop: 2 }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.DesktopPOS = DesktopPOS;
