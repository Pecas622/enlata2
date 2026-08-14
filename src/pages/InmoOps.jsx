import React, { useState, useEffect, useCallback } from "react";
import { FONT_IMPORT, CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "../lib/theme.js";
import { uid, todayStr, daysBetween, fmtDate } from "../lib/utils.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips } from "../lib/ui.jsx";

const STORAGE_KEY = "inmoops-full-data";
const MP_COMMISSION_RATE = 0.0604;

const PROPERTY_TYPES = ["Casa", "Departamento", "PH", "Terreno", "Local comercial", "Oficina", "Quinta", "Galpón", "Otro"];
const OPERATIONS = ["Venta", "Alquiler", "Alquiler temporario"];
const PROPERTY_STATUSES = ["Disponible", "Reservada", "En negociación", "Vendida", "Alquilada", "Pausada"];
const AMENITIES = ["Balcón", "Terraza", "Patio", "Jardín", "Piscina", "Parrilla", "Lavadero", "Seguridad", "Aire acondicionado", "Calefacción", "Ascensor", "Apto mascotas"];
const CLIENT_TYPES = ["Comprador", "Vendedor", "Inquilino", "Propietario", "Inversor"];
const CLIENT_STATUSES = ["Nuevo", "Contactado", "Interesado", "Visita programada", "Negociación", "Cerrado", "Perdido"];
const LEAD_CHANNELS = ["WhatsApp", "Instagram", "Facebook", "Web", "Portal inmobiliario", "Teléfono", "Referido", "Otro"];
const LEAD_STAGES = ["Nuevo", "Contactado", "Interesado", "Visita", "Negociación", "Cerrado"];
const VISIT_STATUSES = ["Programada", "Confirmada", "Realizada", "Cancelada", "Reprogramada"];
const TASK_TYPES = ["Llamar cliente", "Contactar propietario", "Coordinar visita", "Solicitar documentación", "Actualizar publicación", "Hacer seguimiento", "Otro"];
const TASK_PRIORITIES = ["Baja", "Media", "Alta"];
const TASK_STATUSES = ["Pendiente", "En curso", "Completada"];
const OPERATION_STATUSES = ["En proceso", "Reserva", "Contrato", "Cerrada", "Cancelada"];

const EMPTY_DATA = {
  properties: [], clients: [], owners: [], leads: [], visits: [], tasks: [],
  operations: [], commissionPayments: [], config: { agencyName: "Tu Inmobiliaria", commissionPercent: "4" },
};

// unlike GenericOps/AutoOps money values, property prices here can carry a per-record currency
function fmtMoney(n, currency = "USD") {
  const num = Number(n) || 0;
  return num.toLocaleString("es-AR", { style: "currency", currency, maximumFractionDigits: 0 });
}
function waLink(phone, text) {
  const clean = (phone || "").replace(/[^\d]/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text || "")}`;
}
function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------- atoms unique to INMO OPS (mini stat with semantic tone + bar chart) ----------
function MiniStat({ label, value, tone }) {
  const color = tone === "warn" ? AMBER : tone === "bad" ? RED : tone === "good" ? GREEN : OFFWHITE;
  return (
    <Card>
      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 21, color }}>{value}</div>
    </Card>
  );
}
function Bars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, padding: "6px 2px" }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 10.5, color: GRAY, fontFamily: "Inter" }}>{d.value}</div>
          <div style={{ width: "100%", height: Math.max(4, (d.value / max) * 84), background: GREEN, borderRadius: 4, opacity: 0.85 }} />
          <div style={{ fontSize: 10.5, color: GRAY, fontFamily: "Inter", textAlign: "center" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}
function last6Months() {
  const arr = []; const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "") });
  }
  return arr;
}

// ---------- Demo data seeder ----------
function seedDemoData() {
  const zones = ["Godoy Cruz", "Chacras de Coria", "Ciudad", "Guaymallén", "Luján de Cuyo"];
  const types = ["Casa", "Departamento", "PH", "Departamento", "Casa"];
  const properties = Array.from({ length: 14 }).map((_, i) => ({
    id: uid(), code: `PR-${100 + i}`, title: `${types[i % 5]} en ${zones[i % 5]}`, type: types[i % 5],
    operation: i % 3 === 0 ? "Alquiler" : "Venta", status: PROPERTY_STATUSES[i % 4],
    address: `Calle ${i + 100}`, city: "Mendoza", province: "Mendoza", neighborhood: zones[i % 5], zip: "5500",
    price: String((i % 3 === 0 ? 300 : 90000) + i * 4000), currency: "USD", expenses: String(15000 + i * 500),
    totalArea: String(80 + i * 10), coveredArea: String(60 + i * 8), bedrooms: String(2 + (i % 3)), bathrooms: String(1 + (i % 2)),
    garages: String(i % 2), age: String(i % 20), floors: "1", rooms: String(3 + (i % 3)),
    amenities: AMENITIES.filter((_, ai) => (ai + i) % 3 === 0), ownerName: `Propietario ${i + 1}`, advisor: ["Ana", "Lucas", "Sofía"][i % 3],
    entryDate: todayStr(),
  }));
  const clients = Array.from({ length: 10 }).map((_, i) => ({
    id: uid(), name: ["Juan", "María", "Carlos", "Ana", "Pedro", "Lucía", "Diego", "Sofía", "Martín", "Valentina"][i],
    lastName: "Gómez", dni: `${28000000 + i}`, phone: `+54 9 261 555 0${100 + i}`, whatsapp: `+54 9 261 555 0${100 + i}`,
    email: "", type: CLIENT_TYPES[i % 5], budget: String(80000 + i * 5000), currency: "USD", zone: zones[i % 5],
    propertyType: types[i % 5], operation: i % 3 === 0 ? "Alquiler" : "Venta", bedrooms: String(2 + (i % 3)),
    notes: "", status: CLIENT_STATUSES[i % CLIENT_STATUSES.length], timeline: [{ id: uid(), date: todayStr(), type: "Nota", note: "Cliente cargado desde datos demo" }],
  }));
  const leads = Array.from({ length: 8 }).map((_, i) => ({
    id: uid(), clientName: clients[i % clients.length].name, propertyTitle: properties[i].title,
    date: todayStr(), channel: LEAD_CHANNELS[i % LEAD_CHANNELS.length], message: "Consulta por disponibilidad y precio.",
    advisor: ["Ana", "Lucas", "Sofía"][i % 3], stage: LEAD_STAGES[i % LEAD_STAGES.length],
  }));
  const visits = Array.from({ length: 6 }).map((_, i) => ({
    id: uid(), propertyTitle: properties[i + 2].title, clientName: clients[i].name, advisor: ["Ana", "Lucas", "Sofía"][i % 3],
    date: todayStr(), time: `${10 + i}:00`, status: VISIT_STATUSES[i % 5], notes: "",
  }));
  const tasks = Array.from({ length: 6 }).map((_, i) => ({
    id: uid(), title: TASK_TYPES[i % TASK_TYPES.length], description: "", responsible: ["Ana", "Lucas", "Sofía"][i % 3],
    dueDate: todayStr(), priority: TASK_PRIORITIES[i % 3], status: TASK_STATUSES[i % 3],
  }));
  const owners = Array.from({ length: 5 }).map((_, i) => ({
    id: uid(), name: `Propietario ${i + 1}`, phone: `+54 9 261 555 02${i}0`, propertiesLinked: properties[i].title,
    requestedPrice: properties[i].price, suggestedPrice: String(Number(properties[i].price) * 0.95), agreedCommission: "4",
    contractStatus: "Vigente", notes: "",
  }));
  const operations = Array.from({ length: 4 }).map((_, i) => {
    const p = properties[i]; const price = Number(p.price);
    return { id: uid(), type: p.operation, propertyTitle: p.title, clientName: clients[i].name, ownerName: p.ownerName,
      advisor: p.advisor, price, currency: p.currency, date: todayStr(), commissionPercent: "4", status: OPERATION_STATUSES[i % 5] };
  });
  return { properties, clients, owners, leads, visits, tasks, operations, commissionPayments: [], config: { agencyName: "Tu Inmobiliaria", commissionPercent: "4" } };
}

// ---------- App shell ----------
export default function App() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [role, setRole] = useState("Administrador");

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

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2400); };
  const loadDemo = () => { persist(seedDemoData()); showToast("Datos demo cargados"); };
  const clearAll = () => { persist(EMPTY_DATA); showToast("Datos borrados"); };

  const ALL_NAV = [
    { id: "dashboard", label: "Dashboard", roles: ["Administrador", "Gerente", "Asesor", "Administrativo"] },
    { id: "properties", label: "Propiedades", roles: ["Administrador", "Gerente", "Asesor"] },
    { id: "clients", label: "Clientes / CRM", roles: ["Administrador", "Gerente", "Asesor", "Administrativo"] },
    { id: "leads", label: "Leads", roles: ["Administrador", "Gerente", "Asesor"] },
    { id: "visits", label: "Visitas", roles: ["Administrador", "Gerente", "Asesor"] },
    { id: "tasks", label: "Tareas", roles: ["Administrador", "Gerente", "Asesor"] },
    { id: "owners", label: "Propietarios", roles: ["Administrador", "Gerente"] },
    { id: "operations", label: "Operaciones", roles: ["Administrador", "Gerente", "Administrativo"] },
    { id: "matching", label: "Matching", roles: ["Administrador", "Gerente", "Asesor"] },
    { id: "commissions", label: "Comisiones", roles: ["Administrador", "Gerente"] },
    { id: "reports", label: "Reportes", roles: ["Administrador", "Gerente"] },
    { id: "config", label: "Configuración", roles: ["Administrador"] },
  ];
  const NAV = ALL_NAV.filter((n) => n.roles.includes(role));
  useEffect(() => { if (!NAV.find((n) => n.id === page)) setPage("dashboard"); }, [role]); // eslint-disable-line

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: "Inter" }}>Cargando INMO OPS...</div>;
  }

  return (
    <div style={{ background: CARBON, minHeight: 680, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <style>{FONT_IMPORT}</style>
      <div className="ops-shell" style={{ display: "flex", minHeight: 680 }}>
        <div className="ops-sidebar" style={{ width: 220, background: "#0E0E11", borderRight: `1px solid ${BORDER}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 16px 8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: CARBON }}>02</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>INMO<span style={{ color: GREEN }}>OPS</span></div>
          </div>

          <div style={{ padding: "0 8px 14px 8px" }}>
            <div style={{ fontSize: 10.5, color: GRAY, marginBottom: 4, fontFamily: "Inter", textTransform: "uppercase" }}>Ver como</div>
            <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ fontSize: 12, padding: "7px 8px" }}>
              {["Administrador", "Gerente", "Asesor", "Administrativo"].map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>

          <div className="ops-nav-list" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {NAV.map((n) => (
              <div key={n.id} onClick={() => setPage(n.id)} className="ops-nav-item" style={{
                padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "Inter", fontSize: 13, fontWeight: 500,
                background: page === n.id ? "rgba(184,255,61,0.1)" : "transparent", color: page === n.id ? GREEN : GRAY,
              }}>{n.label}</div>
            ))}
          </div>

          <div style={{ marginTop: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
            <Btn variant="secondary" onClick={loadDemo} style={{ fontSize: 11.5, padding: "7px 10px", width: "100%" }}>Cargar datos demo</Btn>
            <Btn variant="ghost" onClick={clearAll} style={{ fontSize: 11, padding: "5px 10px" }}>Borrar todo</Btn>
            <div style={{ fontFamily: "Inter", fontSize: 10.5, color: "#5A5A5E", marginTop: 4 }}>ENLATA2 · Software que ya viene listo.</div>
          </div>
        </div>

        <div className="ops-content" style={{ flex: 1, padding: "24px 28px", position: "relative", overflowY: "auto", minWidth: 0 }}>
          {toast && <div style={{ position: "absolute", top: 16, right: 28, background: GREEN, color: CARBON, padding: "8px 16px", borderRadius: 8, fontFamily: "Inter", fontWeight: 600, fontSize: 13, zIndex: 10 }}>{toast}</div>}
          {page === "dashboard" && <Dashboard data={data} setPage={setPage} />}
          {page === "properties" && <Properties data={data} persist={persist} showToast={showToast} />}
          {page === "clients" && <Clients data={data} persist={persist} showToast={showToast} />}
          {page === "leads" && <Leads data={data} persist={persist} showToast={showToast} />}
          {page === "visits" && <Visits data={data} persist={persist} showToast={showToast} />}
          {page === "tasks" && <Tasks data={data} persist={persist} showToast={showToast} />}
          {page === "owners" && <Owners data={data} persist={persist} showToast={showToast} />}
          {page === "operations" && <Operations data={data} persist={persist} showToast={showToast} />}
          {page === "matching" && <Matching data={data} />}
          {page === "commissions" && <Commissions data={data} persist={persist} showToast={showToast} />}
          {page === "reports" && <Reports data={data} />}
          {page === "config" && <Config data={data} persist={persist} showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// ==================== DASHBOARD ====================
function Dashboard({ data, setPage }) {
  const [period, setPeriod] = useState("Este mes");
  const inPeriod = (dateStr) => {
    if (!dateStr) return false;
    if (period === "Este mes") return dateStr.slice(0, 7) === todayStr().slice(0, 7);
    if (period === "Últimos 3 meses") return daysBetween(dateStr, todayStr()) <= 90;
    return true; // "Histórico"
  };

  const active = data.properties.filter((p) => !["Vendida", "Alquilada", "Pausada"].includes(p.status)).length;
  const sold = data.properties.filter((p) => p.status === "Vendida").length;
  const rented = data.properties.filter((p) => p.status === "Alquilada").length;
  const available = data.properties.filter((p) => p.status === "Disponible").length;
  const newClients = data.clients.filter((c) => inPeriod(c.timeline?.[c.timeline.length - 1]?.date)).length || data.clients.length;
  const pendingLeads = data.leads.filter((l) => l.stage !== "Cerrado").length;
  const visitsToday = data.visits.filter((v) => v.date === todayStr()).length;
  const opsInProcess = data.operations.filter((o) => !["Cerrada", "Cancelada"].includes(o.status)).length;
  const pendingTasks = data.tasks.filter((t) => t.status !== "Completada").length;

  const closedOps = data.operations.filter((o) => o.status === "Cerrada" && inPeriod(o.date));
  const salesOps = closedOps.filter((o) => o.type === "Venta");
  const rentalOps = closedOps.filter((o) => o.type !== "Venta");
  const commissionTotal = closedOps.reduce((s, o) => s + (Number(o.price) * Number(o.commissionPercent || 0)) / 100, 0);

  const overdueTasks = data.tasks.filter((t) => t.status !== "Completada" && t.dueDate < todayStr());
  const upcomingVisits = data.visits.filter((v) => v.date >= todayStr() && v.status !== "Cancelada").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  const stats = [
    { label: "Propiedades activas", value: active, onClick: () => setPage("properties") },
    { label: "Vendidas", value: sold, onClick: () => setPage("properties") },
    { label: "Alquiladas", value: rented, onClick: () => setPage("properties") },
    { label: "Disponibles", value: available, onClick: () => setPage("properties") },
    { label: "Nuevos clientes", value: newClients, onClick: () => setPage("clients") },
    { label: "Consultas pendientes", value: pendingLeads, onClick: () => setPage("leads") },
    { label: "Visitas hoy", value: visitsToday, onClick: () => setPage("visits") },
    { label: "Operaciones en proceso", value: opsInProcess, onClick: () => setPage("operations") },
    { label: "Tareas pendientes", value: pendingTasks, onClick: () => setPage("tasks"), tone: overdueTasks.length > 0 ? "warn" : undefined },
    { label: "Ventas cerradas (período)", value: salesOps.length, onClick: () => setPage("operations") },
    { label: "Alquileres cerrados (período)", value: rentalOps.length, onClick: () => setPage("operations") },
    { label: "Comisiones del período", value: fmtMoney(commissionTotal), onClick: () => setPage("commissions"), tone: "good" },
  ];

  const byType = {}; data.properties.forEach((p) => { byType[p.type] = (byType[p.type] || 0) + 1; });
  const propertiesByType = Object.entries(byType).map(([label, value]) => ({ label, value }));
  const byOperation = {}; data.properties.forEach((p) => { byOperation[p.operation] = (byOperation[p.operation] || 0) + 1; });
  const propertiesByOperation = Object.entries(byOperation).map(([label, value]) => ({ label, value }));
  const leadsByMonth = last6Months().map((m) => ({ label: m.label, value: data.leads.filter((l) => (l.date || "").slice(0, 7) === m.key).length }));
  const opsByMonth = last6Months().map((m) => ({ label: m.label, value: data.operations.filter((o) => o.status === "Cerrada" && (o.date || "").slice(0, 7) === m.key).length }));
  const conversion = data.leads.length ? Math.round((data.leads.filter((l) => l.stage === "Cerrado").length / data.leads.length) * 100) : 0;
  const commissionByMonth = last6Months().map((m) => {
    const ops = data.operations.filter((o) => o.status === "Cerrada" && (o.date || "").slice(0, 7) === m.key);
    return { label: m.label, value: Math.round(ops.reduce((s, o) => s + (Number(o.price) * Number(o.commissionPercent || 0)) / 100, 0) / 100) };
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen general de tu inmobiliaria"
        action={<FilterChips options={["Este mes", "Últimos 3 meses", "Histórico"]} value={period} onChange={setPeriod} />} />

      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} onClick={s.onClick} style={{ cursor: "pointer" }}><MiniStat label={s.label} value={s.value} tone={s.tone} /></div>
        ))}
      </div>

      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Propiedades por tipo</div>{propertiesByType.length ? <Bars data={propertiesByType} /> : <EmptyState text="Sin propiedades." />}</Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Venta vs. Alquiler</div>{propertiesByOperation.length ? <Bars data={propertiesByOperation} /> : <EmptyState text="Sin propiedades." />}</Card>
      </div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Consultas recibidas</div><Bars data={leadsByMonth} /></Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Operaciones cerradas / mes</div><Bars data={opsByMonth} /></Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Comisiones (x100 USD) / mes</div><Bars data={commissionByMonth} /></Card>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY }}>Conversión de leads (período histórico)</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: GREEN }}>{conversion}%</div>
        </div>
      </Card>

      {(overdueTasks.length > 0 || upcomingVisits.length > 0) && (
        <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {overdueTasks.length > 0 && (
            <Card style={{ borderColor: "#3A1F1F" }}>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Tareas vencidas</div>
              {overdueTasks.slice(0, 5).map((t) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12.5, fontFamily: "Inter" }}>
                  <span style={{ color: OFFWHITE }}>{t.title} — {t.responsible}</span><Badge tone="red">{fmtDate(t.dueDate)}</Badge>
                </div>
              ))}
            </Card>
          )}
          {upcomingVisits.length > 0 && (
            <Card>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Próximas visitas</div>
              {upcomingVisits.map((v) => (
                <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12.5, fontFamily: "Inter" }}>
                  <span style={{ color: OFFWHITE }}>{v.propertyTitle} — {v.clientName}</span><span style={{ color: GRAY }}>{fmtDate(v.date)} {v.time}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== PROPIEDADES ====================
const emptyProperty = { code: "", title: "", type: PROPERTY_TYPES[0], operation: "Venta", status: "Disponible", address: "", city: "", province: "", neighborhood: "", zip: "", price: "", currency: "USD", expenses: "", totalArea: "", coveredArea: "", bedrooms: "", bathrooms: "", garages: "", age: "", floors: "", rooms: "", amenities: [], ownerName: "", advisor: "", entryDate: todayStr() };

function Properties({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [operationFilter, setOperationFilter] = useState("Todas");
  const [ficha, setFicha] = useState(null);
  const [form, setForm] = useState(emptyProperty);
  const [search, setSearch] = useState("");

  const filtered = data.properties.filter((p) =>
    (statusFilter === "Todas" || p.status === statusFilter) &&
    (operationFilter === "Todas" || p.operation === operationFilter) &&
    (!search || `${p.title} ${p.code} ${p.address} ${p.neighborhood}`.toLowerCase().includes(search.toLowerCase()))
  );

  const addProperty = () => {
    if (!form.title || !form.price) { showToast("Completá título y precio"); return; }
    persist({ ...data, properties: [{ id: uid(), ...form, code: form.code || `PR-${100 + data.properties.length}` }, ...data.properties] });
    setForm(emptyProperty); setShowForm(false); showToast("Propiedad agregada");
  };
  const removeProperty = (id) => persist({ ...data, properties: data.properties.filter((p) => p.id !== id) });
  const updateProperty = (id, patch) => persist({ ...data, properties: data.properties.map((p) => p.id === id ? { ...p, ...patch } : p) });
  const copyLink = (p) => { navigator.clipboard?.writeText(`https://tuinmobiliaria.com/propiedades/${(p.title || "propiedad").toLowerCase().replace(/\s+/g, "-")}-${p.code}`); showToast("Enlace copiado"); };

  const statusCounts = Object.fromEntries(["Todas", ...PROPERTY_STATUSES].map((s) => [s, s === "Todas" ? data.properties.length : data.properties.filter((p) => p.status === s).length]));
  const opCounts = Object.fromEntries(["Todas", ...OPERATIONS].map((o) => [o, o === "Todas" ? data.properties.length : data.properties.filter((p) => p.operation === o).length]));

  return (
    <div>
      <PageHeader title="Propiedades" subtitle={`${data.properties.length} publicadas`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva propiedad"}</Btn>} />

      <Input placeholder="Buscar por título, código, dirección o barrio..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 14 }} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Información general</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Código"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="auto" /></Field>
            <Field label="Título"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Casa 3 amb. en Chacras de Coria" /></Field>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Operación"><Select value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })}>{OPERATIONS.map((o) => <option key={o}>{o}</option>)}</Select></Field>
            <Field label="Estado"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{PROPERTY_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Ubicación</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Dirección"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label="Barrio"><Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></Field>
            <Field label="Ciudad"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Mendoza" /></Field>
            <Field label="Provincia"><Input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Mendoza" /></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Características</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Precio"><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="Expensas"><Input type="number" value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} /></Field>
            <Field label="Sup. total (m²)"><Input type="number" value={form.totalArea} onChange={(e) => setForm({ ...form, totalArea: e.target.value })} /></Field>
            <Field label="Sup. cubierta (m²)"><Input type="number" value={form.coveredArea} onChange={(e) => setForm({ ...form, coveredArea: e.target.value })} /></Field>
            <Field label="Dormitorios"><Input type="number" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></Field>
            <Field label="Baños"><Input type="number" value={form.bathrooms} onChange={(e) => setForm({ ...form, bathrooms: e.target.value })} /></Field>
            <Field label="Cocheras"><Input type="number" value={form.garages} onChange={(e) => setForm({ ...form, garages: e.target.value })} /></Field>
            <Field label="Ambientes"><Input type="number" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} /></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Características adicionales</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {AMENITIES.map((a) => (
              <div key={a} onClick={() => setForm({ ...form, amenities: form.amenities.includes(a) ? form.amenities.filter((x) => x !== a) : [...form.amenities, a] })}
                style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontFamily: "Inter", fontWeight: 600,
                  background: form.amenities.includes(a) ? GREEN : "transparent", color: form.amenities.includes(a) ? CARBON : GRAY, border: `1px solid ${form.amenities.includes(a) ? GREEN : BORDER}` }}>{a}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Propietario"><Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} /></Field>
            <Field label="Asesor responsable"><Input value={form.advisor} onChange={(e) => setForm({ ...form, advisor: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addProperty}>Guardar propiedad</Btn></div>
        </Card>
      )}

      <div style={{ marginBottom: 10 }}><FilterChips options={["Todas", ...OPERATIONS]} value={operationFilter} onChange={setOperationFilter} counts={opCounts} /></div>
      <div style={{ marginBottom: 16 }}><FilterChips options={["Todas", ...PROPERTY_STATUSES]} value={statusFilter} onChange={setStatusFilter} counts={statusCounts} /></div>

      {filtered.length === 0 ? <Card><EmptyState text="No hay propiedades para mostrar." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 220, cursor: "pointer" }} onClick={() => setFicha(p)}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{p.title}</div>
                    <Badge tone={p.status === "Disponible" ? "green" : p.status === "Reservada" ? "amber" : "gray"}>{p.status}</Badge>
                    <Badge tone="gray">{p.operation}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.code} · {p.neighborhood} · {p.bedrooms} dorm · {p.totalArea} m²</div>
                </div>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: GREEN, marginRight: 10 }}>{fmtMoney(p.price, p.currency)}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" onClick={() => copyLink(p)}>Copiar enlace</Btn>
                  <Btn variant="danger" onClick={() => removeProperty(p.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {ficha && <PropertyModal property={ficha} onClose={() => setFicha(null)} onUpdate={(patch) => { updateProperty(ficha.id, patch); setFicha({ ...ficha, ...patch }); }} onCopyLink={() => copyLink(ficha)} />}
    </div>
  );
}

function PropertyModal({ property: p, onClose, onUpdate, onCopyLink }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 26, maxWidth: 620, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: OFFWHITE }}>{p.title}</div>
            <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.code} · {p.address}, {p.neighborhood}</div>
          </div>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>
        <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
          <MiniStat label="Precio" value={fmtMoney(p.price, p.currency)} />
          <MiniStat label="Dormitorios" value={p.bedrooms || "-"} />
          <MiniStat label="Sup. total" value={`${p.totalArea || "-"} m²`} />
          <MiniStat label="Expensas" value={fmtMoney(p.expenses, p.currency)} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {(p.amenities || []).map((a) => <Badge key={a} tone="gray">{a}</Badge>)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => onUpdate({ status: "Reservada" })}>Reservar</Btn>
          <Btn variant="secondary" onClick={() => onUpdate({ status: p.operation === "Venta" ? "Vendida" : "Alquilada" })}>Marcar {p.operation === "Venta" ? "vendida" : "alquilada"}</Btn>
          <Btn variant="secondary" href={waLink("", `Hola, te comparto la ficha de "${p.title}". Precio: ${fmtMoney(p.price, p.currency)}.`)}>WhatsApp</Btn>
          <Btn variant="secondary" onClick={onCopyLink}>Copiar enlace público</Btn>
          <Btn variant="secondary" onClick={() => window.print()}>Imprimir ficha</Btn>
        </div>
      </div>
    </div>
  );
}

// ==================== CLIENTES / CRM ====================
const emptyClient = { name: "", lastName: "", dni: "", phone: "", whatsapp: "", email: "", type: CLIENT_TYPES[0], budget: "", currency: "USD", zone: "", propertyType: "", operation: "Venta", bedrooms: "", notes: "", status: "Nuevo", timeline: [] };

function Clients({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyClient);
  const [statusFilter, setStatusFilter] = useState("Todos");

  const filtered = statusFilter === "Todos" ? data.clients : data.clients.filter((c) => c.status === statusFilter);
  const counts = Object.fromEntries(["Todos", ...CLIENT_STATUSES].map((s) => [s, s === "Todos" ? data.clients.length : data.clients.filter((c) => c.status === s).length]));

  const addClient = () => {
    if (!form.name || !form.phone) { showToast("Completá nombre y teléfono"); return; }
    persist({ ...data, clients: [{ id: uid(), ...form, timeline: [{ id: uid(), date: todayStr(), type: "Nota", note: "Cliente creado" }] }, ...data.clients] });
    setForm(emptyClient); setShowForm(false); showToast("Cliente agregado");
  };
  const removeClient = (id) => persist({ ...data, clients: data.clients.filter((c) => c.id !== id) });
  const updateClient = (id, patch) => persist({ ...data, clients: data.clients.map((c) => c.id === id ? { ...c, ...patch } : c) });
  const addTimelineEntry = (id, type, note) => {
    const c = data.clients.find((x) => x.id === id);
    updateClient(id, { timeline: [{ id: uid(), date: todayStr(), type, note }, ...(c.timeline || [])] });
  };

  return (
    <div>
      <PageHeader title="Clientes / CRM" subtitle={`${data.clients.length} contactos`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo cliente"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Apellido"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="DNI/CUIT"><Input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            <Field label="Teléfono/WhatsApp"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value, whatsapp: e.target.value })} placeholder="+54 9 261 555 0100" /></Field>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{CLIENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Presupuesto"><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
            <Field label="Zona de interés"><Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /></Field>
            <Field label="Tipo de propiedad buscada"><Select value={form.propertyType} onChange={(e) => setForm({ ...form, propertyType: e.target.value })}><option value="">-</option>{PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Operación"><Select value={form.operation} onChange={(e) => setForm({ ...form, operation: e.target.value })}>{OPERATIONS.map((o) => <option key={o}>{o}</option>)}</Select></Field>
            <Field label="Dormitorios"><Input type="number" value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></Field>
            <Field label="Estado"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addClient}>Guardar cliente</Btn></div>
        </Card>
      )}
      <div style={{ marginBottom: 16 }}><FilterChips options={["Todos", ...CLIENT_STATUSES]} value={statusFilter} onChange={setStatusFilter} counts={counts} /></div>
      {filtered.length === 0 ? <Card><EmptyState text="No hay clientes en este estado." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ cursor: "pointer", flex: 1, minWidth: 200 }} onClick={() => setDetail(c)}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{c.name} {c.lastName}</div>
                    <Badge tone="gray">{c.type}</Badge>
                    <Badge tone="gray">{c.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{c.phone}{c.zone ? " · busca en " + c.zone : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" href={waLink(c.whatsapp || c.phone, `Hola ${c.name}, te escribo de la inmobiliaria.`)}>WhatsApp</Btn>
                  <Btn variant="danger" onClick={() => removeClient(c.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {detail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={() => setDetail(null)}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 26, maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 19, color: OFFWHITE }}>{detail.name} {detail.lastName}</div>
              <Btn variant="ghost" onClick={() => setDetail(null)}>✕</Btn>
            </div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Seguimiento comercial</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
              {(detail.timeline || []).map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 10, fontSize: 12.5, fontFamily: "Inter" }}>
                  <span style={{ color: GRAY, minWidth: 70 }}>{fmtDate(t.date)}</span>
                  <span style={{ color: GREEN, fontWeight: 600 }}>{t.type}</span>
                  <span style={{ color: OFFWHITE }}>{t.note}</span>
                </div>
              ))}
            </div>
            <TimelineAdder onAdd={(type, note) => { addTimelineEntry(detail.id, type, note); setDetail({ ...detail, timeline: [{ id: uid(), date: todayStr(), type, note }, ...(detail.timeline || [])] }); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineAdder({ onAdd }) {
  const [type, setType] = useState("Llamada"); const [note, setNote] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Select value={type} onChange={(e) => setType(e.target.value)} style={{ flex: 1 }}>
        {["WhatsApp", "Llamada", "Email", "Nota", "Visita", "Tarea"].map((t) => <option key={t}>{t}</option>)}
      </Select>
      <Input placeholder="Detalle..." value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 2 }} />
      <Btn onClick={() => { if (note) { onAdd(type, note); setNote(""); } }}>Agregar</Btn>
    </div>
  );
}

// ==================== LEADS (Kanban) ====================
function Leads({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", propertyTitle: "", channel: LEAD_CHANNELS[0], message: "", advisor: "", stage: "Nuevo" });
  const [dragId, setDragId] = useState(null);

  const addLead = () => {
    if (!form.clientName) { showToast("Completá el nombre del cliente"); return; }
    persist({ ...data, leads: [{ id: uid(), ...form, date: todayStr() }, ...data.leads] });
    setForm({ clientName: "", propertyTitle: "", channel: LEAD_CHANNELS[0], message: "", advisor: "", stage: "Nuevo" });
    setShowForm(false); showToast("Lead creado");
  };
  const moveLead = (id, stage) => persist({ ...data, leads: data.leads.map((l) => l.id === id ? { ...l, stage } : l) });
  const removeLead = (id) => persist({ ...data, leads: data.leads.filter((l) => l.id !== id) });

  return (
    <div>
      <PageHeader title="Leads / Consultas" subtitle={`${data.leads.length} en el pipeline · arrastrá las tarjetas entre columnas`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo lead"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-lead" /></Field>
            <datalist id="cli-lead">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Propiedad consultada"><Input value={form.propertyTitle} onChange={(e) => setForm({ ...form, propertyTitle: e.target.value })} list="prop-lead" /></Field>
            <datalist id="prop-lead">{data.properties.map((p) => <option key={p.id} value={p.title} />)}</datalist>
            <Field label="Canal"><Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>{LEAD_CHANNELS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Responsable"><Input value={form.advisor} onChange={(e) => setForm({ ...form, advisor: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addLead}>Crear lead</Btn></div>
        </Card>
      )}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {LEAD_STAGES.map((stage) => (
          <div key={stage} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) moveLead(dragId, stage); setDragId(null); }}
            style={{ minWidth: 200, flex: "none", background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10 }}>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: GRAY, marginBottom: 10, textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              <span>{stage}</span><span>{data.leads.filter((l) => l.stage === stage).length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
              {data.leads.filter((l) => l.stage === stage).map((l) => (
                <div key={l.id} draggable onDragStart={() => setDragId(l.id)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", cursor: "grab" }}>
                  <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12.5, color: OFFWHITE }}>{l.clientName}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginTop: 3 }}>{l.propertyTitle}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <Badge tone="gray">{l.channel}</Badge>
                    <span onClick={() => removeLead(l.id)} style={{ color: RED, fontSize: 11, cursor: "pointer" }}>eliminar</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== VISITAS ====================
function Visits({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ propertyTitle: "", clientName: "", advisor: "", date: todayStr(), time: "10:00", status: "Programada", notes: "" });

  const addVisit = () => {
    if (!form.propertyTitle || !form.clientName) { showToast("Completá propiedad y cliente"); return; }
    persist({ ...data, visits: [{ id: uid(), ...form }, ...data.visits].sort((a, b) => a.date.localeCompare(b.date)) });
    setForm({ propertyTitle: "", clientName: "", advisor: "", date: todayStr(), time: "10:00", status: "Programada", notes: "" });
    setShowForm(false); showToast("Visita agendada");
  };
  const removeVisit = (id) => persist({ ...data, visits: data.visits.filter((v) => v.id !== id) });
  const updateStatus = (id, status) => persist({ ...data, visits: data.visits.map((v) => v.id === id ? { ...v, status } : v) });

  const grouped = {};
  data.visits.forEach((v) => { grouped[v.date] = grouped[v.date] || []; grouped[v.date].push(v); });
  const dates = Object.keys(grouped).sort();

  return (
    <div>
      <PageHeader title="Visitas" subtitle={`${data.visits.length} agendadas`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Agendar visita"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Propiedad"><Input value={form.propertyTitle} onChange={(e) => setForm({ ...form, propertyTitle: e.target.value })} list="prop-visit" /></Field>
            <datalist id="prop-visit">{data.properties.map((p) => <option key={p.id} value={p.title} />)}</datalist>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-visit" /></Field>
            <datalist id="cli-visit">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Asesor"><Input value={form.advisor} onChange={(e) => setForm({ ...form, advisor: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addVisit}>Guardar visita</Btn></div>
        </Card>
      )}
      {dates.length === 0 ? <Card><EmptyState text="No hay visitas agendadas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {dates.map((date) => (
            <div key={date}>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: GREEN, marginBottom: 8, textTransform: "uppercase" }}>{fmtDate(date)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grouped[date].map((v) => (
                  <Card key={v.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{v.time} — {v.propertyTitle}</div>
                          <Badge tone={v.status === "Realizada" ? "green" : v.status === "Cancelada" ? "red" : "gray"}>{v.status}</Badge>
                        </div>
                        <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{v.clientName} · {v.advisor}</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Select value={v.status} onChange={(e) => updateStatus(v.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{VISIT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                        <Btn variant="danger" onClick={() => removeVisit(v.id)}>Eliminar</Btn>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== TAREAS ====================
function Tasks({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: TASK_TYPES[0], description: "", responsible: "", dueDate: todayStr(), priority: "Media", status: "Pendiente" });
  const [statusFilter, setStatusFilter] = useState("Todas");

  const addTask = () => {
    if (!form.responsible) { showToast("Completá el responsable"); return; }
    persist({ ...data, tasks: [{ id: uid(), ...form }, ...data.tasks] });
    setForm({ title: TASK_TYPES[0], description: "", responsible: "", dueDate: todayStr(), priority: "Media", status: "Pendiente" });
    setShowForm(false); showToast("Tarea creada");
  };
  const removeTask = (id) => persist({ ...data, tasks: data.tasks.filter((t) => t.id !== id) });
  const updateStatus = (id, status) => persist({ ...data, tasks: data.tasks.map((t) => t.id === id ? { ...t, status } : t) });

  const filtered = statusFilter === "Todas" ? data.tasks : data.tasks.filter((t) => t.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div>
      <PageHeader title="Tareas" subtitle={`${data.tasks.filter((t) => t.status !== "Completada").length} pendientes`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva tarea"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Tipo"><Select value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}>{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Descripción"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Responsable"><Input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} /></Field>
            <Field label="Fecha límite"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
            <Field label="Prioridad"><Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{TASK_PRIORITIES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addTask}>Guardar tarea</Btn></div>
        </Card>
      )}
      <div style={{ marginBottom: 16 }}><FilterChips options={["Todas", ...TASK_STATUSES]} value={statusFilter} onChange={setStatusFilter} /></div>
      {sorted.length === 0 ? <Card><EmptyState text="No hay tareas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((t) => {
            const overdue = t.status !== "Completada" && t.dueDate < todayStr();
            return (
              <Card key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{t.title}</div>
                      <Badge tone={t.priority === "Alta" ? "red" : t.priority === "Media" ? "amber" : "gray"}>{t.priority}</Badge>
                      {overdue && <Badge tone="red">Vencida</Badge>}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{t.responsible} · vence {fmtDate(t.dueDate)}{t.description ? " · " + t.description : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Select value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                    <Btn variant="danger" onClick={() => removeTask(t.id)}>Eliminar</Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== PROPIETARIOS ====================
function Owners({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", propertiesLinked: "", requestedPrice: "", suggestedPrice: "", agreedCommission: "4", contractStatus: "Vigente", notes: "" });

  const addOwner = () => {
    if (!form.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, owners: [{ id: uid(), ...form }, ...data.owners] });
    setForm({ name: "", phone: "", propertiesLinked: "", requestedPrice: "", suggestedPrice: "", agreedCommission: "4", contractStatus: "Vigente", notes: "" });
    setShowForm(false); showToast("Propietario agregado");
  };
  const removeOwner = (id) => persist({ ...data, owners: data.owners.filter((o) => o.id !== id) });

  return (
    <div>
      <PageHeader title="Propietarios" subtitle={`${data.owners.length} propietarios`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo propietario"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Propiedad asociada"><Input value={form.propertiesLinked} onChange={(e) => setForm({ ...form, propertiesLinked: e.target.value })} list="prop-owner" /></Field>
            <datalist id="prop-owner">{data.properties.map((p) => <option key={p.id} value={p.title} />)}</datalist>
            <Field label="Precio solicitado"><Input type="number" value={form.requestedPrice} onChange={(e) => setForm({ ...form, requestedPrice: e.target.value })} /></Field>
            <Field label="Precio sugerido"><Input type="number" value={form.suggestedPrice} onChange={(e) => setForm({ ...form, suggestedPrice: e.target.value })} /></Field>
            <Field label="Comisión acordada (%)"><Input type="number" value={form.agreedCommission} onChange={(e) => setForm({ ...form, agreedCommission: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addOwner}>Guardar propietario</Btn></div>
        </Card>
      )}
      {data.owners.length === 0 ? <Card><EmptyState text="No hay propietarios cargados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.owners.map((o) => (
            <Card key={o.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{o.name}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{o.propertiesLinked} · comisión {o.agreedCommission}% · pide {fmtMoney(o.requestedPrice)}</div>
                </div>
                <Btn variant="danger" onClick={() => removeOwner(o.id)}>Eliminar</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== OPERACIONES ====================
function Operations({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Venta", propertyTitle: "", clientName: "", ownerName: "", advisor: "", price: "", currency: "USD", date: todayStr(), commissionPercent: data.config?.commissionPercent || "4", status: "En proceso" });

  const addOperation = () => {
    if (!form.propertyTitle || !form.price) { showToast("Completá propiedad y precio final"); return; }
    persist({ ...data, operations: [{ id: uid(), ...form }, ...data.operations] });
    setForm({ type: "Venta", propertyTitle: "", clientName: "", ownerName: "", advisor: "", price: "", currency: "USD", date: todayStr(), commissionPercent: data.config?.commissionPercent || "4", status: "En proceso" });
    setShowForm(false); showToast("Operación registrada");
  };
  const removeOperation = (id) => persist({ ...data, operations: data.operations.filter((o) => o.id !== id) });
  const updateStatus = (id, status) => persist({ ...data, operations: data.operations.map((o) => o.id === id ? { ...o, status } : o) });

  return (
    <div>
      <PageHeader title="Operaciones" subtitle={`${data.operations.length} operaciones`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva operación"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Venta</option><option>Alquiler</option></Select></Field>
            <Field label="Propiedad"><Input value={form.propertyTitle} onChange={(e) => setForm({ ...form, propertyTitle: e.target.value })} list="prop-op" /></Field>
            <datalist id="prop-op">{data.properties.map((p) => <option key={p.id} value={p.title} />)}</datalist>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-op" /></Field>
            <datalist id="cli-op">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Propietario"><Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} list="own-op" /></Field>
            <datalist id="own-op">{data.owners.map((o) => <option key={o.id} value={o.name} />)}</datalist>
            <Field label="Asesor"><Input value={form.advisor} onChange={(e) => setForm({ ...form, advisor: e.target.value })} /></Field>
            <Field label="Precio final"><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="Comisión (%)"><Input type="number" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 12, fontFamily: "Inter", fontSize: 13, color: GREEN }}>Comisión estimada: {fmtMoney((Number(form.price) * Number(form.commissionPercent)) / 100)}</div>
          <div style={{ marginTop: 14 }}><Btn onClick={addOperation}>Guardar operación</Btn></div>
        </Card>
      )}
      {data.operations.length === 0 ? <Card><EmptyState text="No hay operaciones registradas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.operations.map((o) => (
            <Card key={o.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{o.propertyTitle}</div>
                    <Badge tone="gray">{o.type}</Badge>
                    <Badge tone={o.status === "Cerrada" ? "green" : o.status === "Cancelada" ? "red" : "gray"}>{o.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{o.clientName} · {o.advisor} · {fmtDate(o.date)} · comisión {fmtMoney((Number(o.price) * Number(o.commissionPercent)) / 100)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: GREEN }}>{fmtMoney(o.price, o.currency)}</div>
                  <Select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{OPERATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                  <Btn variant="danger" onClick={() => removeOperation(o.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== MATCHING ====================
function computeMatch(client, property) {
  let score = 0, total = 0;
  total += 1; if (property.operation === client.operation) score += 1;
  total += 1; if (!client.propertyType || property.type === client.propertyType) score += 1;
  total += 1; if (!client.zone || (property.neighborhood || "").toLowerCase().includes((client.zone || "").toLowerCase())) score += 1;
  total += 1; if (!client.budget || Number(property.price) <= Number(client.budget) * 1.1) score += 1;
  total += 1; if (!client.bedrooms || Number(property.bedrooms) >= Number(client.bedrooms)) score += 1;
  return Math.round((score / total) * 100);
}

function Matching({ data }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id || "");
  const client = data.clients.find((c) => c.id === clientId);
  const matches = client ? data.properties
    .filter((p) => !["Vendida", "Alquilada", "Pausada"].includes(p.status))
    .map((p) => ({ property: p, score: computeMatch(client, p) }))
    .sort((a, b) => b.score - a.score) : [];

  return (
    <div>
      <PageHeader title="Matching cliente ↔ propiedad" subtitle="Encontrá propiedades compatibles con lo que busca cada cliente" />
      <Card style={{ marginBottom: 16 }}>
        <Field label="Cliente">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Seleccioná un cliente</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name} {c.lastName}</option>)}
          </Select>
        </Field>
        {client && (
          <div style={{ marginTop: 12, fontFamily: "Inter", fontSize: 12.5, color: GRAY }}>
            Busca: {client.propertyType || "cualquier tipo"} en {client.zone || "cualquier zona"} · {client.operation} · presupuesto {fmtMoney(client.budget, client.currency)} · {client.bedrooms || "-"} dorm mín.
          </div>
        )}
      </Card>
      {!client ? <EmptyState text="Seleccioná un cliente para ver coincidencias." /> : matches.length === 0 ? <EmptyState text="No hay propiedades activas para comparar." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {matches.map(({ property: p, score }) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{p.title}</div>
                    <Badge tone={score >= 80 ? "green" : score >= 50 ? "amber" : "gray"}>{score}% compatible</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.neighborhood} · {p.bedrooms} dorm · {fmtMoney(p.price, p.currency)}</div>
                </div>
                <Btn variant="secondary" href={waLink(client.whatsapp || client.phone, `Hola ${client.name}, te comparto una propiedad que puede interesarte: ${p.title} — ${fmtMoney(p.price, p.currency)}.`)}>Enviar por WhatsApp</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== COMISIONES ====================
function Commissions({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ operationId: "", amount: "", method: "Transferencia", date: todayStr() });

  const closedOps = data.operations.filter((o) => o.status === "Cerrada");
  const commissionFor = (o) => (Number(o.price) * Number(o.commissionPercent || 0)) / 100;
  const generated = closedOps.reduce((s, o) => s + commissionFor(o), 0);
  const collected = data.commissionPayments.reduce((s, p) => s + Number(p.amount), 0);
  const pending = generated - collected;
  const mpFees = data.commissionPayments.filter((p) => p.method === "Tarjeta (Mercado Pago)").reduce((s, p) => s + Number(p.amount) * MP_COMMISSION_RATE, 0);

  const addPayment = () => {
    if (!form.operationId || !form.amount) { showToast("Completá operación y monto"); return; }
    persist({ ...data, commissionPayments: [{ id: uid(), ...form }, ...data.commissionPayments] });
    setForm({ operationId: "", amount: "", method: "Transferencia", date: todayStr() });
    setShowForm(false); showToast("Cobro de comisión registrado");
  };

  return (
    <div>
      <PageHeader title="Comisiones" subtitle="Comisiones generadas, cobradas y pendientes" action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Registrar cobro"}</Btn>} />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Comisión estimada/generada" value={fmtMoney(generated)} />
        <MiniStat label="Comisión cobrada" value={fmtMoney(collected)} tone="good" />
        <MiniStat label="Comisión pendiente" value={fmtMoney(pending)} tone={pending > 0 ? "warn" : undefined} />
        <MiniStat label="Comisiones MP estimadas" value={fmtMoney(mpFees)} tone="warn" />
      </div>
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Operación">
              <Select value={form.operationId} onChange={(e) => setForm({ ...form, operationId: e.target.value })}>
                <option value="">-</option>
                {closedOps.map((o) => <option key={o.id} value={o.id}>{o.propertyTitle} — {fmtMoney(commissionFor(o))}</option>)}
              </Select>
            </Field>
            <Field label="Monto cobrado"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Medio de pago"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option>Transferencia</option><option>Efectivo</option><option>Tarjeta (Mercado Pago)</option></Select></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addPayment}>Guardar cobro</Btn></div>
        </Card>
      )}
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Operaciones cerradas</div>
      {closedOps.length === 0 ? <Card><EmptyState text="No hay operaciones cerradas todavía." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {closedOps.map((o) => (
            <Card key={o.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>{o.propertyTitle} — {o.advisor}</span>
                <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(commissionFor(o))}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== REPORTES ====================
function Reports({ data }) {
  const closedOps = data.operations.filter((o) => o.status === "Cerrada");
  const sales = closedOps.filter((o) => o.type === "Venta");
  const rentals = closedOps.filter((o) => o.type !== "Venta");
  const totalCommission = closedOps.reduce((s, o) => s + (Number(o.price) * Number(o.commissionPercent || 0)) / 100, 0);
  const activeProps = data.properties.filter((p) => !["Vendida", "Alquilada", "Pausada"].includes(p.status)).length;
  const soldProps = data.properties.filter((p) => p.status === "Vendida").length;
  const leadsGenerated = data.leads.length;
  const leadsConverted = data.leads.filter((l) => l.stage === "Cerrado").length;
  const visitsDone = data.visits.filter((v) => v.status === "Realizada").length;

  const byAdvisor = {};
  closedOps.forEach((o) => { byAdvisor[o.advisor || "Sin asignar"] = (byAdvisor[o.advisor || "Sin asignar"] || 0) + 1; });
  const bySource = {};
  data.leads.forEach((l) => { bySource[l.channel] = (bySource[l.channel] || 0) + 1; });

  const exportOps = () => downloadCSV("operaciones.csv", data.operations.map((o) => ({ propiedad: o.propertyTitle, tipo: o.type, cliente: o.clientName, asesor: o.advisor, precio: o.price, comision: (Number(o.price) * Number(o.commissionPercent || 0)) / 100, fecha: o.date, estado: o.status })));
  const exportProps = () => downloadCSV("propiedades.csv", data.properties.map((p) => ({ codigo: p.code, titulo: p.title, tipo: p.type, operacion: p.operation, estado: p.status, precio: p.price })));

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Estadísticas generales" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Ventas cerradas" value={sales.length} />
        <MiniStat label="Alquileres cerrados" value={rentals.length} />
        <MiniStat label="Comisiones totales" value={fmtMoney(totalCommission)} tone="good" />
        <MiniStat label="Conversión de leads" value={leadsGenerated ? `${Math.round((leadsConverted / leadsGenerated) * 100)}%` : "0%"} />
        <MiniStat label="Propiedades activas" value={activeProps} />
        <MiniStat label="Propiedades vendidas" value={soldProps} />
        <MiniStat label="Leads generados" value={leadsGenerated} />
        <MiniStat label="Visitas realizadas" value={visitsDone} />
      </div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Rendimiento por asesor</div>
        {Object.keys(byAdvisor).length === 0 ? <EmptyState text="Sin operaciones todavía." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(byAdvisor).map(([name, count]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "Inter" }}>
                <span style={{ color: OFFWHITE }}>{name}</span><span style={{ color: GREEN, fontWeight: 600 }}>{count} operaciones cerradas</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Fuentes de leads</div>
        {Object.keys(bySource).length === 0 ? <EmptyState text="Sin leads todavía." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(bySource).map(([name, count]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "Inter" }}>
                <span style={{ color: OFFWHITE }}>{name}</span><span style={{ color: GRAY }}>{count} leads</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={exportOps}>Exportar operaciones (CSV)</Btn>
        <Btn variant="secondary" onClick={exportProps}>Exportar propiedades (CSV)</Btn>
      </div>
    </div>
  );
}

// ==================== CONFIGURACIÓN ====================
function Config({ data, persist, showToast }) {
  const [agencyName, setAgencyName] = useState(data.config?.agencyName || "");
  const [commissionPercent, setCommissionPercent] = useState(data.config?.commissionPercent || "4");

  const saveConfig = () => { persist({ ...data, config: { ...data.config, agencyName, commissionPercent } }); showToast("Configuración guardada"); };

  const roles = [
    { name: "Administrador", desc: "Acceso total al sistema." },
    { name: "Gerente", desc: "Operaciones, propiedades, clientes, reportes y equipo." },
    { name: "Asesor", desc: "Sus clientes, propiedades, leads, visitas y tareas." },
    { name: "Administrativo", desc: "Clientes, documentación y operaciones." },
  ];

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos de la agencia, comisiones y automatizaciones" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Datos de la agencia</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Nombre de la inmobiliaria" style={{ flex: 1 }} />
          <Input type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} placeholder="% comisión default" style={{ width: 160 }} />
          <Btn onClick={saveConfig}>Guardar</Btn>
        </div>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Roles y permisos</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {roles.map((r) => (
            <div key={r.name} style={{ display: "flex", gap: 10 }}>
              <Badge tone="green">{r.name}</Badge>
              <span style={{ fontFamily: "Inter", fontSize: 12.5, color: GRAY }}>{r.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: GRAY, marginTop: 10, fontFamily: "Inter" }}>Probá el selector "Ver como" en el panel lateral para simular cada rol.</div>
      </Card>
      <Card>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 8 }}>Automatizaciones (n8n + WhatsApp Business API)</div>
        <div style={{ fontSize: 12.5, color: GRAY, fontFamily: "Inter", marginBottom: 10 }}>Requieren conectar n8n y WhatsApp Business API del lado del backend — no están activas en este prototipo.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Nuevo lead → crear cliente automáticamente", "Nueva consulta → asignar asesor", "Visita mañana → enviar recordatorio", "Lead sin respuesta 3 días → crear tarea", "Propiedad vendida → cambiar estado", "Nuevo cliente → sugerir propiedades compatibles"].map((a) => (
            <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", color: OFFWHITE, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span>{a}</span><Badge tone="gray">A conectar</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
