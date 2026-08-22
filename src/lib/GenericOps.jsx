import React, { useState, useEffect, useCallback } from "react";
import { FONT_IMPORT, CARBON, BORDER, OFFWHITE, GREEN, GRAY, RED } from "./theme.js";
import { uid, todayStr, fmtUSD, fmtARS, fmtDate } from "./utils.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips, StatCard } from "./ui.jsx";
import FacturacionModule from "./Facturacion.jsx";

function fmtAmount(n, currency) {
  return currency === "usd" ? fmtUSD(n) : fmtARS(n);
}

function defaultFormFor(fields) {
  const form = {};
  for (const f of fields) {
    if (f.type === "date") form[f.key] = todayStr();
    else if (f.type === "select") form[f.key] = f.options[0];
    else form[f.key] = "";
  }
  return form;
}

function fieldDisplay(f, value) {
  if (!value) return "-";
  if (f.type === "date") return fmtDate(value);
  return value;
}

// ---------- generic CRUD module (list + form) ----------
function CrudModule({ module, data, persist, showToast, currency }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("Todas");
  const [form, setForm] = useState(defaultFormFor(module.fields));

  const items = data[module.id] || [];
  const filtered = module.statusField && filter !== "Todas" ? items.filter((it) => it[module.statusField] === filter) : items;

  const addItem = () => {
    const missing = module.fields.filter((f) => f.required && !String(form[f.key] || "").trim());
    if (missing.length > 0) {
      showToast(`Completá ${missing.map((f) => f.label.toLowerCase()).join(" y ")}`);
      return;
    }
    const entry = { id: uid(), ...form };
    persist({ ...data, [module.id]: [entry, ...items] });
    setForm(defaultFormFor(module.fields));
    setShowForm(false);
    showToast(module.addedMsg || "Agregado correctamente");
  };

  const removeItem = (id) => persist({ ...data, [module.id]: items.filter((it) => it.id !== id) });
  const updateStatus = (id, value) =>
    persist({ ...data, [module.id]: items.map((it) => (it.id === id ? { ...it, [module.statusField]: value } : it)) });

  return (
    <div>
      <PageHeader
        title={module.label}
        subtitle={`${items.length} ${module.countLabel || "registrados"}`}
        action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : `+ ${module.addLabel || "Nuevo"}`}</Btn>}
      />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {module.fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                {f.type === "select" ? (
                  <Select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                ) : (
                  <Input
                    type={f.type === "text" ? "text" : f.type}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                )}
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addItem}>Guardar</Btn></div>
        </Card>
      )}

      {module.statusField && (
        <FilterChips options={["Todas", ...module.statusOptions]} value={filter} onChange={setFilter} />
      )}

      {filtered.length === 0 ? <Card><EmptyState text={module.emptyText || "Todavía no hay nada cargado."} /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((it) => (
            <Card key={it.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{it[module.titleField]}</div>
                    {(module.tagFields || []).map((k) => it[k] && <Badge key={k} tone="gray">{it[k]}</Badge>)}
                    {module.statusField && <Badge tone={module.statusTone ? module.statusTone(it[module.statusField]) : "gray"}>{it[module.statusField]}</Badge>}
                  </div>
                  {module.subtitleFields?.length > 0 && (
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>
                      {module.subtitleFields.map((k) => fieldDisplay(module.fields.find((f) => f.key === k) || {}, it[k])).filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {module.amountField && (
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: GREEN }}>
                      {fmtAmount(it[module.amountField], currency)}
                    </div>
                  )}
                  {module.statusField && (
                    <Select value={it[module.statusField]} onChange={(e) => updateStatus(it.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>
                      {module.statusOptions.map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  )}
                  <Btn variant="danger" onClick={() => removeItem(it.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Caja module (ingresos / egresos) ----------
const CASH_FIELDS = [
  { key: "type", label: "Tipo", type: "select", options: ["Ingreso", "Egreso"] },
  { key: "concept", label: "Concepto", type: "text", required: true, placeholder: "Venta, alquiler, insumos..." },
  { key: "amount", label: "Monto", type: "number", required: true, placeholder: "1000" },
  { key: "date", label: "Fecha", type: "date" },
];

function CashModule({ data, persist, showToast, currency }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultFormFor(CASH_FIELDS));

  const cash = data.cash || [];
  const balance = cash.reduce((s, c) => s + (c.type === "Ingreso" ? Number(c.amount) : -Number(c.amount)), 0);
  const income = cash.filter((c) => c.type === "Ingreso").reduce((s, c) => s + Number(c.amount), 0);
  const expense = cash.filter((c) => c.type === "Egreso").reduce((s, c) => s + Number(c.amount), 0);

  const addEntry = () => {
    if (!form.concept || !form.amount) { showToast("Completá concepto y monto"); return; }
    persist({ ...data, cash: [{ id: uid(), ...form }, ...cash] });
    setForm(defaultFormFor(CASH_FIELDS));
    setShowForm(false);
    showToast("Movimiento registrado");
  };
  const removeEntry = (id) => persist({ ...data, cash: cash.filter((c) => c.id !== id) });

  return (
    <div>
      <PageHeader title="Caja" subtitle="Ingresos y egresos" action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo movimiento"}</Btn>} />

      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <StatCard label="Saldo" value={fmtAmount(balance, currency)} tone={balance >= 0 ? GREEN : RED} />
        <StatCard label="Ingresos" value={fmtAmount(income, currency)} />
        <StatCard label="Egresos" value={fmtAmount(expense, currency)} />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {CASH_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                {f.type === "select" ? (
                  <Select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </Select>
                ) : (
                  <Input type={f.type} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
                )}
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addEntry}>Guardar movimiento</Btn></div>
        </Card>
      )}

      {cash.length === 0 ? <Card><EmptyState text="Todavía no hay movimientos de caja." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cash.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{c.concept}</div>
                    <Badge tone={c.type === "Ingreso" ? "green" : "red"}>{c.type}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{fmtDate(c.date)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: c.type === "Ingreso" ? GREEN : RED }}>
                    {c.type === "Ingreso" ? "+" : "-"}{fmtAmount(c.amount, currency)}
                  </div>
                  <Btn variant="danger" onClick={() => removeEntry(c.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ product, data, setPage }) {
  const stats = product.modules.map((m) => ({
    label: m.label,
    value: (data[m.id] || []).length,
    onClick: () => setPage(m.id),
  }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Resumen general de ${product.businessName || product.name}`}
        action={product.businessUrl && <Btn variant="secondary" href={product.businessUrl}>Visitar sitio ↗</Btn>}
      />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 14, marginBottom: 20 }}>
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>
      <Card>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE, marginBottom: 8 }}>
          80% hecho, 20% a tu medida
        </div>
        <div style={{ fontFamily: "Inter", fontSize: 13, color: GRAY }}>
          Este es el dashboard base de {product.name}. Elegí un módulo del menú para cargar datos — el resto se configura a medida de tu negocio.
        </div>
      </Card>
    </div>
  );
}

// ---------- App shell ----------
export default function GenericOps({ product }) {
  const storageKey = `enlata2-${product.id}-data`;
  const emptyData = product.modules.reduce((acc, m) => ({ ...acc, [m.id]: [] }), {});

  const [data, setData] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setData(emptyData);
    setLoaded(false);
    setPage("dashboard");
    (async () => {
      try {
        const res = await window.storage.get(storageKey, false);
        if (res && res.value) setData({ ...emptyData, ...JSON.parse(res.value) });
        else if (product.demoSeed) await persist({ ...emptyData, ...product.demoSeed() });
      } catch (e) { /* first run */ }
      finally { setLoaded(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await window.storage.set(storageKey, JSON.stringify(next), false); }
    catch (e) { console.error("Storage error", e); }
  }, [storageKey]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const loadDemo = () => { if (product.demoSeed) { persist({ ...emptyData, ...product.demoSeed() }); showToast("Datos demo cargados"); } };
  const clearAll = () => { persist(emptyData); showToast("Datos borrados"); };

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: "Inter" }}>Cargando {product.name}...</div>;
  }

  const NAV = [{ id: "dashboard", label: "Dashboard", icon: "▦" }, ...product.modules.map((m) => ({ id: m.id, label: m.label, icon: m.icon || "●" }))];

  return (
    <div style={{ background: CARBON, minHeight: 600, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <style>{FONT_IMPORT}</style>
      <div className="ops-shell" style={{ display: "flex", minHeight: 600 }}>
        <div className="ops-sidebar" style={{ width: 210, background: "#0E0E11", borderRight: `1px solid ${BORDER}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 20px 8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: CARBON }}>{product.num}</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{product.name.replace(" OPS", "")}<span style={{ color: GREEN }}> OPS</span></div>
          </div>
          <div className="ops-nav-list" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {NAV.map((n) => (
              <div key={n.id} onClick={() => setPage(n.id)} className="ops-nav-item" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 8, cursor: "pointer",
                fontFamily: "Inter", fontSize: 13, fontWeight: 500,
                background: page === n.id ? "rgba(184,255,61,0.1)" : "transparent",
                color: page === n.id ? GREEN : GRAY,
              }}>
                <span style={{ width: 16, textAlign: "center", fontSize: 13 }}>{n.icon}</span>
                {n.label}
              </div>
            ))}
          </div>
          <div style={{ marginTop: "auto", padding: "12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {product.demoSeed && (
              <>
                <Btn variant="secondary" onClick={loadDemo} style={{ fontSize: 11.5, padding: "7px 10px", width: "100%" }}>Cargar datos demo</Btn>
                <Btn variant="ghost" onClick={clearAll} style={{ fontSize: 11, padding: "5px 10px" }}>Borrar todo</Btn>
              </>
            )}
            {product.businessUrl && (
              <a href={product.businessUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "Inter", fontSize: 11.5, color: GREEN, textDecoration: "none" }}>
                {product.businessName || product.name} ↗
              </a>
            )}
            <div style={{ fontFamily: "Inter", fontSize: 11, color: "#5A5A5E" }}>
              ENLATA2 · Software que ya viene listo.
            </div>
          </div>
        </div>

        <div className="ops-content" style={{ flex: 1, padding: "24px 28px", position: "relative", minWidth: 0 }}>
          {toast && <div style={{ position: "absolute", top: 16, right: 28, background: GREEN, color: CARBON, padding: "8px 16px", borderRadius: 8, fontFamily: "Inter", fontWeight: 600, fontSize: 13, zIndex: 10 }}>{toast}</div>}
          {page === "dashboard" && <Dashboard product={product} data={data} setPage={setPage} />}
          {product.modules.map((m) => page === m.id && (
            m.type === "cash"
              ? <CashModule key={m.id} data={data} persist={persist} showToast={showToast} currency={product.currency} />
              : m.type === "invoicing"
              ? (
                <FacturacionModule
                  key={m.id}
                  data={data}
                  persist={persist}
                  showToast={showToast}
                  fmtMoney={(n) => fmtAmount(n, product.currency)}
                  negocio={{ nombre: product.businessName || product.name }}
                />
              )
              : <CrudModule key={m.id} module={m} data={data} persist={persist} showToast={showToast} currency={product.currency} />
          ))}
        </div>
      </div>
    </div>
  );
}
