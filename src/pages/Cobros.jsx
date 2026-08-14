import React, { useState, useEffect, useCallback } from "react";
import { FONT_IMPORT, CARBON, CARD, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "../lib/theme.js";
import { uid, todayStr, addDays, daysBetween, fmtARS as fmtMoney, fmtDate } from "../lib/utils.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips } from "../lib/ui.jsx";
import { PRODUCTS as PRODUCT_CATALOG } from "../config/products.js";

const STORAGE_KEY = "enlata2-cobros-data";
const MP_COMMISSION_RATE = 0.0604; // 4.99% + IVA efectivo

const PRODUCTS = PRODUCT_CATALOG.map((p) => p.name);
const PAYMENT_METHODS = ["Transferencia", "Tarjeta (Mercado Pago)"];
const DAYS_TO_BLOCK = 10;

const EMPTY_DATA = { clients: [], payments: [] };

function computeStatus(client) {
  if (client.status === "Cancelado") return "Cancelado";
  if (!client.nextDueDate) return "Pendiente 1er pago";
  const diff = daysBetween(client.nextDueDate, todayStr());
  if (diff <= 0) return "Activo";
  if (diff > DAYS_TO_BLOCK) return "Bloqueado";
  return "Atrasado";
}

function statusTone(status) {
  if (status === "Activo") return "green";
  if (status === "Atrasado") return "amber";
  if (status === "Bloqueado") return "red";
  if (status === "Cancelado") return "gray";
  return "gray";
}

// ---------- App ----------
export default function App() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) setData({ ...EMPTY_DATA, ...JSON.parse(res.value) });
      } catch (e) { /* first run */ }
      finally { setLoaded(true); }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(next), false); }
    catch (e) { console.error("Storage error", e); }
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: "Inter" }}>Cargando panel...</div>;
  }

  const NAV = [
    { id: "dashboard", label: "Dashboard" },
    { id: "clients", label: "Suscripciones" },
    { id: "payments", label: "Movimientos" },
  ];

  return (
    <div style={{ background: CARBON, minHeight: 640, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <style>{FONT_IMPORT}</style>
      <div className="ops-shell" style={{ display: "flex", minHeight: 640 }}>
        <div className="ops-sidebar" style={{ width: 210, background: "#0E0E11", borderRight: `1px solid ${BORDER}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 20px 8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: CARBON }}>$</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>PANEL DE<br /><span style={{ color: GREEN }}>COBROS</span></div>
          </div>
          <div className="ops-nav-list" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {NAV.map((n) => (
              <div key={n.id} onClick={() => setPage(n.id)} className="ops-nav-item" style={{
                padding: "10px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "Inter", fontSize: 13, fontWeight: 500,
                background: page === n.id ? "rgba(184,255,61,0.1)" : "transparent", color: page === n.id ? GREEN : GRAY,
              }}>{n.label}</div>
            ))}
          </div>
          <div style={{ marginTop: "auto", padding: "12px 10px", fontFamily: "Inter", fontSize: 11, color: "#5A5A5E" }}>
            ENLATA2 · Sin conexión real a pasarelas — estados manuales.
          </div>
        </div>

        <div className="ops-content" style={{ flex: 1, padding: "24px 28px", position: "relative", minWidth: 0 }}>
          {toast && <div style={{ position: "absolute", top: 16, right: 28, background: GREEN, color: CARBON, padding: "8px 16px", borderRadius: 8, fontFamily: "Inter", fontWeight: 600, fontSize: 13, zIndex: 10 }}>{toast}</div>}
          {page === "dashboard" && <Dashboard data={data} setPage={setPage} />}
          {page === "clients" && <ClientsPage data={data} persist={persist} showToast={showToast} />}
          {page === "payments" && <PaymentsPage data={data} />}
        </div>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ data, setPage }) {
  const withStatus = data.clients.map((c) => ({ ...c, computedStatus: computeStatus(c) }));
  const activos = withStatus.filter((c) => c.computedStatus === "Activo");
  const atrasados = withStatus.filter((c) => c.computedStatus === "Atrasado");
  const bloqueados = withStatus.filter((c) => c.computedStatus === "Bloqueado");
  const pendientes = withStatus.filter((c) => c.computedStatus === "Pendiente 1er pago");

  const mrr = [...activos, ...atrasados].reduce((s, c) => s + Number(c.amount), 0);

  const thisMonth = todayStr().slice(0, 7);
  const paymentsThisMonth = data.payments.filter((p) => p.date.slice(0, 7) === thisMonth);
  const grossThisMonth = paymentsThisMonth.reduce((s, p) => s + Number(p.amount), 0);
  const commissionThisMonth = paymentsThisMonth.reduce((s, p) => s + Number(p.commission), 0);
  const netThisMonth = grossThisMonth - commissionThisMonth;

  const stats = [
    { label: "MRR (suscripciones activas)", value: fmtMoney(mrr), onClick: () => setPage("clients") },
    { label: "Clientes activos", value: activos.length, onClick: () => setPage("clients") },
    { label: "Atrasados / Bloqueados", value: `${atrasados.length} / ${bloqueados.length}`, onClick: () => setPage("clients"), warn: atrasados.length + bloqueados.length > 0 },
    { label: "Pendientes de 1er pago", value: pendientes.length, onClick: () => setPage("clients") },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Estado general de suscripciones y cobros" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        {stats.map((s) => (
          <Card key={s.label} style={{ cursor: "pointer" }}>
            <div onClick={s.onClick}>
              <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 22, color: s.warn ? AMBER : OFFWHITE }}>{s.value}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <Card>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>Cobrado este mes (bruto)</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: OFFWHITE }}>{fmtMoney(grossThisMonth)}</div>
        </Card>
        <Card>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>Comisiones pagadas (MP)</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: RED }}>-{fmtMoney(commissionThisMonth)}</div>
        </Card>
        <Card>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>Neto real este mes</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: GREEN }}>{fmtMoney(netThisMonth)}</div>
        </Card>
      </div>

      {(atrasados.length > 0 || bloqueados.length > 0) && (
        <Card style={{ borderColor: bloqueados.length > 0 ? "#3A1F1F" : "#3A311F" }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE, marginBottom: 12 }}>Requieren atención</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...atrasados, ...bloqueados].map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                <div>
                  <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE, fontWeight: 500 }}>{c.name}</span>
                  <span style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginLeft: 8 }}>{c.product} · vencía {fmtDate(c.nextDueDate)}</span>
                </div>
                <Badge tone={statusTone(c.computedStatus)}>{c.computedStatus}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- Clients / Suscripciones ----------
function ClientsPage({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("Todas");
  const [form, setForm] = useState({ name: "", phone: "", product: PRODUCTS[0], amount: "100000", implementation: "200", method: PAYMENT_METHODS[0], startDate: todayStr() });

  const withStatus = data.clients.map((c) => ({ ...c, computedStatus: computeStatus(c) }));
  const filtered = filter === "Todas" ? withStatus : withStatus.filter((c) => c.computedStatus === filter);

  const addClient = () => {
    if (!form.name || !form.amount) { showToast("Completá nombre y monto mensual"); return; }
    const client = { id: uid(), ...form, status: "activo", nextDueDate: null };
    persist({ ...data, clients: [client, ...data.clients] });
    setForm({ name: "", phone: "", product: PRODUCTS[0], amount: "100000", implementation: "200", method: PAYMENT_METHODS[0], startDate: todayStr() });
    setShowForm(false);
    showToast("Cliente dado de alta — pendiente de primer pago");
  };

  const registrarPago = (client, tipo) => {
    // tipo: "implementacion" | "mensualidad"
    const amount = tipo === "implementacion" ? Number(client.implementation) : Number(client.amount);
    const isCard = client.method === PAYMENT_METHODS[1];
    const commission = isCard ? Math.round(amount * MP_COMMISSION_RATE) : 0;
    const payment = { id: uid(), clientId: client.id, clientName: client.name, product: client.product, type: tipo, amount, method: client.method, commission, net: amount - commission, date: todayStr() };

    const baseDate = client.nextDueDate && daysBetween(client.nextDueDate, todayStr()) < 0 ? client.nextDueDate : todayStr();
    const nextDueDate = tipo === "mensualidad" ? addDays(baseDate, 30) : client.nextDueDate || addDays(todayStr(), 30);

    const updatedClients = data.clients.map((c) => c.id === client.id ? { ...c, nextDueDate } : c);
    persist({ ...data, clients: updatedClients, payments: [payment, ...data.payments] });
    showToast(tipo === "implementacion" ? "Implementación registrada" : "Mensualidad registrada");
  };

  const cancelClient = (id) => {
    persist({ ...data, clients: data.clients.map((c) => c.id === id ? { ...c, status: "Cancelado" } : c) });
  };

  const removeClient = (id) => {
    persist({ ...data, clients: data.clients.filter((c) => c.id !== id) });
  };

  const statuses = ["Todas", "Pendiente 1er pago", "Activo", "Atrasado", "Bloqueado", "Cancelado"];

  return (
    <div>
      <PageHeader title="Suscripciones" subtitle={`${data.clients.length} clientes`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva suscripción"}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 14 }}>Alta de cliente</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Nombre / negocio"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Inmobiliaria Del Valle" /></Field>
            <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+54 9 261 555 0100" /></Field>
            <Field label="Producto">
              <Select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
                {PRODUCTS.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Implementación (pago único)"><Input type="number" value={form.implementation} onChange={(e) => setForm({ ...form, implementation: e.target.value })} /></Field>
            <Field label="Mensualidad"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Método de pago habitual">
              <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Fecha de alta"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addClient}>Dar de alta</Btn></div>
        </Card>
      )}

      <FilterChips options={statuses} value={filter} onChange={setFilter} />

      {filtered.length === 0 ? <Card><EmptyState text="No hay clientes en este estado." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{c.name}</div>
                    <Badge tone={statusTone(c.computedStatus)}>{c.computedStatus}</Badge>
                    <Badge tone="gray">{c.product}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>
                    {fmtMoney(c.amount)}/mes · {c.method} · {c.nextDueDate ? `próximo vencimiento ${fmtDate(c.nextDueDate)}` : "sin primer pago registrado"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!c.nextDueDate && c.computedStatus !== "Cancelado" && (
                    <Btn variant="secondary" onClick={() => registrarPago(c, "implementacion")}>Registrar implementación</Btn>
                  )}
                  {c.computedStatus !== "Cancelado" && (
                    <Btn onClick={() => registrarPago(c, "mensualidad")}>Registrar mensualidad</Btn>
                  )}
                  {c.computedStatus !== "Cancelado" && (
                    <Btn variant="danger" onClick={() => cancelClient(c.id)}>Cancelar</Btn>
                  )}
                  {c.computedStatus === "Cancelado" && (
                    <Btn variant="ghost" onClick={() => removeClient(c.id)}>Eliminar</Btn>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Payments / Movimientos ----------
function PaymentsPage({ data }) {
  const sorted = [...data.payments].sort((a, b) => b.date.localeCompare(a.date));
  const totalGross = sorted.reduce((s, p) => s + Number(p.amount), 0);
  const totalCommission = sorted.reduce((s, p) => s + Number(p.commission), 0);

  return (
    <div>
      <PageHeader title="Movimientos" subtitle={`${sorted.length} cobros registrados`} />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <Card><div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>Total cobrado (histórico)</div><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: OFFWHITE }}>{fmtMoney(totalGross)}</div></Card>
        <Card><div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>Comisiones pagadas (histórico)</div><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: RED }}>-{fmtMoney(totalCommission)}</div></Card>
        <Card><div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>% perdido en comisiones</div><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: AMBER }}>{totalGross ? ((totalCommission / totalGross) * 100).toFixed(1) : "0.0"}%</div></Card>
      </div>

      {sorted.length === 0 ? <Card><EmptyState text="Todavía no hay movimientos registrados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{p.clientName}</div>
                    <Badge tone="gray">{p.type === "implementacion" ? "Implementación" : "Mensualidad"}</Badge>
                    <Badge tone={p.method === PAYMENT_METHODS[1] ? "amber" : "green"}>{p.method}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.product} · {fmtDate(p.date)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{fmtMoney(p.amount)}</div>
                  {p.commission > 0 && <div style={{ fontFamily: "Inter", fontSize: 11, color: RED }}>-{fmtMoney(p.commission)} comisión</div>}
                  <div style={{ fontFamily: "Inter", fontSize: 11, color: GREEN }}>neto {fmtMoney(p.net)}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
