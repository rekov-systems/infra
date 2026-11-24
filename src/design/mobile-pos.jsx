/* global React, I, GearMark, Eyebrow, Pill, LiveDot, Divider, Lockup, BrandBar, COP */
const { useState } = React;

/* ===== Mobile waiter view (390x844) ===== */
function MobilePOS() {
  const [tab, setTab] = useState("mesas");
  const [openTable, setOpenTable] = useState(null);

  const tables = [
    { id: 1,  guests: 2, status: "occupied",  total: 86200, time: "12m", waiter: "JR" },
    { id: 2,  guests: 0, status: "empty" },
    { id: 3,  guests: 4, status: "attention", total: 142800, time: "34m", waiter: "JR", note: "Llamado a mesero" },
    { id: 4,  guests: 0, status: "empty" },
    { id: 5,  guests: 3, status: "occupied",  total: 67400, time: "8m",  waiter: "MA" },
    { id: 6,  guests: 0, status: "empty" },
    { id: 7,  guests: 2, status: "occupied",  total: 38900, time: "21m", waiter: "JR" },
    { id: 8,  guests: 6, status: "occupied",  total: 312500, time: "45m", waiter: "MA" },
    { id: 9,  guests: 0, status: "empty" },
    { id: 10, guests: 4, status: "attention", total: 96400, time: "52m", waiter: "MA", note: "Cobro pendiente" },
    { id: 11, guests: 0, status: "empty" },
    { id: 12, guests: 2, status: "occupied",  total: 28900, time: "5m",  waiter: "JR" },
  ];

  return (
    <div className="ab-shell s-bg-navy ab-mobile">
      {/* Status bar imitation */}
      <div className="status-bar-mock">
        <span>15:42</span>
        <div className="mp-sync-row">
          <LiveDot /> <span className="mp-sync-text">SYNC OK</span>
        </div>
        <div className="mp-wifi-row">
          <I.Wifi size={13} /><span>92%</span>
        </div>
      </div>

      {/* Top brand row */}
      <div className="brand-row-mobile">
        <GearMark size={26} />
        <div className="mp-brand-title-wrap">
          <div className="mp-brand-title">
            POS<span className="mp-brand-360">360</span><span className="mp-brand-t">T</span>
          </div>
          <Eyebrow className="mp-brand-subtitle">MESERO · CENTRO MAYOR</Eyebrow>
        </div>
        <div className="mp-flex-1" />
        <button className="btn btn-ghost mp-bell-btn" title="Notificaciones" aria-label="Notificaciones">
          <I.Bell size={16} />
        </button>
      </div>

      {/* Greeting & impact card */}
      <div className="greeting-impact-card-wrapper">
        <div className="s-glass mp-greeting-card">
          <Eyebrow color="blue">TURNO ACTIVO · 5h 12m</Eyebrow>
          <div className="mp-greeting-title">
            Hola, <span className="gradient-text">Juan R.</span>
          </div>
          <div className="mp-stats-grid">
            <div>
              <Eyebrow className="mp-stat-label">MESAS</Eyebrow>
              <div className="big-number-plain mp-stat-val-plain">5</div>
            </div>
            <div>
              <Eyebrow className="mp-stat-label">VENTAS</Eyebrow>
              <div className="big-number mp-stat-val">$ 642k</div>
            </div>
            <div>
              <Eyebrow className="mp-stat-label">PROPINA</Eyebrow>
              <div className="mp-stat-val-green">$ 51k</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="quick-actions-grid">
        {[
          { ic: I.Plus, l: "Nueva", kind: "blue", title: "Nueva venta" },
          { ic: I.Bike, l: "Domicilio", kind: "green", title: "Registrar domicilio" },
          { ic: I.Scan, l: "Escanear", kind: "purple", title: "Escanear código EAN" },
          { ic: I.Receipt, l: "Cobrar", kind: "amber", title: "Cobrar pedido" },
        ].map((a) => {
          const Ico = a.ic;
          return (
            <button key={a.l} className="s-glass mp-action-btn" title={a.title} aria-label={a.title}>
              <div className={`mp-action-icon-wrap is-${a.kind}`}>
                <Ico size={18} />
              </div>
              <span className="mp-action-label">{a.l}</span>
            </button>
          );
        })}
      </div>

      {/* Tab pills */}
      <div className="tab-pills-row">
        {[
          { id: "mesas", l: "Mesas" },
          { id: "comandas", l: "Comandas", n: 7 },
          { id: "cuentas", l: "Cuentas", n: 2 },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} title={`Ver ${t.l}`}
            className={`chan-chip mp-tab-btn ${tab === t.id ? "is-active" : ""}`}>
            {t.l}
            {t.n != null && <span className="mp-tab-badge">{t.n}</span>}
          </button>
        ))}
      </div>

      {/* Mesas grid */}
      <div className="tables-grid-wrapper">
        <div className="mp-tables-header">
          <Eyebrow color="mute">SALÓN PRINCIPAL · 12 MESAS</Eyebrow>
          <div className="mp-tables-status">
            <span><LiveDot /> 5 ocupadas</span>
            <span><LiveDot kind="amber" /> 2 atención</span>
          </div>
        </div>
        <div className="tables-grid">
          {tables.map(t => (
            <div key={t.id} className={`tcard is-${t.status} mp-tcard-inner`} onClick={() => t.status !== "empty" && setOpenTable(t)}>
              <div className="mp-tcard-top">
                <Eyebrow className="mp-tcard-label">MESA</Eyebrow>
                {t.status === "occupied" && <span className="mp-tcard-time">{t.time}</span>}
                {t.status === "attention" && <LiveDot kind="amber" />}
              </div>
              <div className="mp-tcard-id">
                {String(t.id).padStart(2, "0")}
              </div>
              {t.status === "empty" ? (
                <div className="mp-tcard-empty">Disponible</div>
              ) : (
                <>
                  <div className="mp-tcard-guests">
                    <I.Users size={11} /> {t.guests} pers · {t.waiter}
                  </div>
                  <div className="mp-tcard-total">
                    {COP(t.total)}
                  </div>
                  {t.note && (
                    <div className="mp-tcard-note">
                      {t.note}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="tab-bar">
        {[
          { id: "home", ic: I.Home,    l: "Inicio", title: "Página de inicio" },
          { id: "mesas", ic: I.Table,  l: "Mesas", active: true, title: "Gestión de mesas" },
          { id: "ord",  ic: I.Receipt, l: "Órdenes", title: "Ver órdenes" },
          { id: "dom",  ic: I.Bike,    l: "Domicilio", title: "Gestión de domicilios" },
          { id: "yo",   ic: I.User,    l: "Yo", title: "Perfil de usuario" },
        ].map(t => {
          const Ico = t.ic;
          return (
            <button key={t.id} className={`tab mp-nav-btn ${t.active ? "is-active" : ""}`} title={t.title}>
              <Ico size={20} />
              <span>{t.l}</span>
            </button>
          );
        })}
      </nav>

      {/* Optional drawer overlay (table detail) */}
      {openTable && (
        <div className="drawer-overlay" onClick={() => setOpenTable(null)}>
          <div onClick={e => e.stopPropagation()} className="s-glass-strong drawer-content">
            <div className="mp-drawer-handle" />
            <div className="mp-drawer-header">
              <div>
                <Eyebrow color="blue">MESA</Eyebrow>
                <div className="mp-drawer-title">
                  Mesa {String(openTable.id).padStart(2, "0")}
                </div>
                <div className="mp-drawer-subtitle">{openTable.guests} comensales · Abierta {openTable.time}</div>
              </div>
              <Pill kind={openTable.status === "attention" ? "warn" : "green"}>
                <LiveDot kind={openTable.status === "attention" ? "amber" : "green"} />
                {openTable.status === "attention" ? "Atención" : "Activa"}
              </Pill>
            </div>
            <div className="mp-drawer-items">
              {[
                { n: "Smash Doble Tocineta", q: 2, p: 28900 },
                { n: "Limonada Cerezada", q: 4, p: 9500 },
                { n: "Combo Familiar Pizza", q: 1, p: 78000 },
              ].map((it) => (
                <div key={it.n} className="mp-drawer-item">
                  <span><span className="mp-drawer-item-qty">×{it.q}</span> {it.n}</span>
                  <span className="mp-drawer-item-price">{COP(it.p * it.q)}</span>
                </div>
              ))}
              <Divider />
              <div className="mp-drawer-total-row">
                <Eyebrow>TOTAL</Eyebrow>
                <div className="big-number mp-drawer-total-val">{COP(openTable.total)}</div>
              </div>
            </div>
            <div className="mp-drawer-actions">
              <button className="btn btn-ghost" title="Enviar orden a cocina" aria-label="Enviar orden a cocina"><I.Send size={14} /> A cocina</button>
              <button className="btn btn-success" title="Proceder al cobro de la mesa" aria-label="Proceder al cobro de la mesa"><I.Receipt size={14} /> Cobrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.MobilePOS = MobilePOS;
