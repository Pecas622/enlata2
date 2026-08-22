import React, { useState, useEffect, useCallback } from "react";
import { FONT_IMPORT, CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "../lib/theme.js";
import { uid, todayStr, addDays, daysBetween, fmtUSD as fmtMoney, fmtDate } from "../lib/utils.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips } from "../lib/ui.jsx";
import FacturacionModule from "../lib/Facturacion.jsx";

const STORAGE_KEY = "autoops-full-data";
const MP_COMMISSION_RATE = 0.0604;

const VEHICLE_CATEGORIES = ["Auto", "Camioneta", "Moto", "Camión"];
const VEHICLE_STATUSES = ["Disponible", "Reservado", "En preparación", "En negociación", "Vendido", "Entregado", "Retirado"];
const FUELS = ["Nafta", "Diésel", "Híbrido", "Eléctrico", "GNC"];
const TRANSMISSIONS = ["Manual", "Automática"];
const CLIENT_STATUSES = ["Nuevo", "Contactado", "Interesado", "Visita", "Test drive", "Negociación", "Reserva", "Venta", "Perdido"];
const LEAD_CHANNELS = ["WhatsApp", "Instagram", "Facebook", "Mercado Libre", "Web", "TikTok", "Teléfono", "Referido", "Salón"];
const LEAD_STAGES = ["Nuevo", "Contactado", "Interesado", "Visita", "Test drive", "Negociación", "Reserva", "Venta"];
const EVAL_ITEMS = ["Carrocería", "Pintura", "Motor", "Caja", "Interior", "Neumáticos", "Mecánica", "Documentación"];
const EVAL_OPTIONS = ["Bueno", "Regular", "Malo"];
const SALE_STATUSES = ["Negociación", "Reserva", "Documentación", "Pago", "Entrega", "Cerrada", "Cancelada"];
const RESERVATION_STATUSES = ["Activa", "Confirmada", "Vencida", "Cancelada", "Convertida en venta"];
const TESTDRIVE_STATUSES = ["Programado", "Confirmado", "Realizado", "Cancelado"];

const EMPTY_DATA = {
  vehicles: [], clients: [], leads: [], tradeIns: [], purchases: [], sales: [],
  financings: [], reservations: [], testDrives: [], cash: [], sellers: [], facturas: [],
  config: { agencyName: "Tu Concesionaria", brands: ["Toyota", "VW", "Ford", "Chevrolet"] },
};

function daysSince(dateStr) { return daysBetween(dateStr, todayStr()); }
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

// ---------- atoms unique to AUTO OPS (mini stat with semantic tone + bar chart) ----------
function MiniStat({ label, value, tone }) {
  const color = tone === "warn" ? AMBER : tone === "bad" ? RED : tone === "good" ? GREEN : OFFWHITE;
  return (
    <Card>
      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 21, color }}>{value}</div>
    </Card>
  );
}
function Bars({ data, unit }) {
  // data: [{label, value}]
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, padding: "6px 2px" }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 10.5, color: GRAY, fontFamily: "Inter" }}>{unit ? unit(d.value) : d.value}</div>
          <div style={{ width: "100%", height: Math.max(4, (d.value / max) * 84), background: GREEN, borderRadius: 4, opacity: 0.85 }} />
          <div style={{ fontSize: 10.5, color: GRAY, fontFamily: "Inter", textAlign: "center" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Demo data seeder ----------
function seedDemoData() {
  const brands = [["Toyota", "Corolla"], ["VW", "Amarok"], ["Ford", "Ranger"], ["Chevrolet", "Onix"], ["Honda", "CR-V"], ["Fiat", "Cronos"], ["Renault", "Kangoo"], ["Peugeot", "208"]];
  const vehicles = Array.from({ length: 15 }).map((_, i) => {
    const [brand, model] = brands[i % brands.length];
    const category = i % 5 === 0 ? "Camioneta" : i % 7 === 0 ? "Moto" : "Auto";
    const entry = addDays(todayStr(), -Math.floor(Math.random() * 90));
    return {
      id: uid(), domain: `AB${100 + i}CD`, brand, model, version: "1.6 GL", year: String(2018 + (i % 7)),
      km: String(Math.floor(Math.random() * 90000)), color: ["Blanco", "Gris", "Negro", "Rojo"][i % 4],
      fuel: FUELS[i % FUELS.length], transmission: TRANSMISSIONS[i % 2], engine: "1.6L", bodyType: category === "Camioneta" ? "Pick-up" : "Sedán",
      category, purchasePrice: String(15000 + i * 900), listPrice: String(18000 + i * 1000), minPrice: String(17000 + i * 950),
      cashPrice: String(17500 + i * 950), financedPrice: String(19000 + i * 1050), currency: "USD",
      status: VEHICLE_STATUSES[i % 5], chassisNumber: `CH${1000 + i}`, engineNumber: `MT${2000 + i}`,
      location: "Salón principal", entryDate: entry, publishDate: entry, provider: "Particular",
      salesperson: ["Juan", "María", "Carlos"][i % 3], expenses: [{ id: uid(), concept: "Transferencia", amount: 500 }],
    };
  });
  const clients = Array.from({ length: 10 }).map((_, i) => ({
    id: uid(), name: ["Juan", "María", "Carlos", "Ana", "Pedro", "Lucía", "Diego", "Sofía", "Martín", "Valentina"][i],
    lastName: "Pérez", dni: `${30000000 + i}`, cuit: "", phone: `+54 9 261 555 0${100 + i}`, whatsapp: `+54 9 261 555 0${100 + i}`,
    email: "", address: "", birthDate: "", occupation: "", notes: "", budget: String(20000 + i * 1000),
    wantedVehicle: brands[i % brands.length].join(" "), wantedBrand: brands[i % brands.length][0], wantedModel: brands[i % brands.length][1],
    minYear: "2020", maxKm: "60000", paymentMethod: i % 2 === 0 ? "Contado" : "Financiado", needsFinancing: i % 2 !== 0, hasTradeIn: i % 3 === 0,
    status: CLIENT_STATUSES[i % CLIENT_STATUSES.length], timeline: [{ id: uid(), date: todayStr(), type: "Nota", note: "Cliente cargado desde datos demo" }],
  }));
  const leads = Array.from({ length: 8 }).map((_, i) => ({
    id: uid(), clientName: clients[i % clients.length].name, vehicleTitle: `${vehicles[i].brand} ${vehicles[i].model}`,
    date: addDays(todayStr(), -i), channel: LEAD_CHANNELS[i % LEAD_CHANNELS.length], message: "Consulta por disponibilidad y precio.",
    salesperson: ["Juan", "María", "Carlos"][i % 3], stage: LEAD_STAGES[i % LEAD_STAGES.length],
  }));
  const sales = Array.from({ length: 5 }).map((_, i) => {
    const v = vehicles[i]; const price = Number(v.listPrice);
    return {
      id: uid(), clientName: clients[i].name, vehicleTitle: `${v.brand} ${v.model}`, vehicleId: v.id, salesperson: v.salesperson,
      price, cash: price, transfer: 0, card: 0, tradeIn: 0, financing: 0, commissionPercent: "3", date: addDays(todayStr(), -i * 3), status: "Cerrada",
    };
  });
  const tradeIns = Array.from({ length: 4 }).map((_, i) => ({
    id: uid(), clientName: clients[i + 2].name, brand: brands[(i + 2) % brands.length][0], model: brands[(i + 2) % brands.length][1],
    year: "2017", domain: `XY${200 + i}Z`, km: "70000", estimatedValue: String(9000 + i * 500), takenValue: String(8500 + i * 500),
    debt: "0", evaluation: Object.fromEntries(EVAL_ITEMS.map((it) => [it, EVAL_OPTIONS[i % 3]])), date: addDays(todayStr(), -i * 2),
  }));
  const testDrives = Array.from({ length: 5 }).map((_, i) => ({
    id: uid(), clientName: clients[i].name, vehicleTitle: `${vehicles[i + 1].brand} ${vehicles[i + 1].model}`,
    salesperson: ["Juan", "María", "Carlos"][i % 3], date: addDays(todayStr(), i - 1), time: "10:00", status: TESTDRIVE_STATUSES[i % 4],
  }));
  const cash = [
    { id: uid(), type: "Ingreso", concept: "Venta Toyota Corolla", amount: 18500, method: "Transferencia", date: todayStr() },
    { id: uid(), type: "Egreso", concept: "Publicidad redes", amount: 400, method: "Transferencia", date: addDays(todayStr(), -2) },
    { id: uid(), type: "Egreso", concept: "Comisión vendedor", amount: 550, method: "Transferencia", date: addDays(todayStr(), -1) },
  ];
  const financings = [
    { id: uid(), clientName: clients[3].name, vehicleTitle: `${vehicles[3].brand} ${vehicles[3].model}`, price: 22000, downPayment: 5000, financedAmount: 17000, installmentsCount: "12", rate: "35", date: todayStr() },
  ];
  const reservations = [
    { id: uid(), clientName: clients[4].name, vehicleTitle: `${vehicles[4].brand} ${vehicles[4].model}`, amount: 500, date: todayStr(), dueDate: addDays(todayStr(), 5), salesperson: "Juan", status: "Activa" },
  ];
  const purchases = [
    { id: uid(), provider: "Particular", vehicleTitle: `${vehicles[5].brand} ${vehicles[5].model}`, purchasePrice: 16000, transferExpense: 500, mechanicalExpense: 300, aestheticExpense: 150, otherExpense: 0, date: addDays(todayStr(), -10) },
  ];
  const sellers = [
    { id: uid(), name: "Juan", commissionPercent: "3", fixedCommission: "0", bonuses: "" },
    { id: uid(), name: "María", commissionPercent: "3.5", fixedCommission: "0", bonuses: "" },
    { id: uid(), name: "Carlos", commissionPercent: "3", fixedCommission: "0", bonuses: "" },
  ];
  return { vehicles, clients, leads, tradeIns, purchases, sales, financings, reservations, testDrives, cash, sellers, config: { agencyName: "Tu Concesionaria", brands: brands.map((b) => b[0]) } };
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
        else await persist(seedDemoData());
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
    { id: "dashboard", label: "Dashboard", roles: ["Administrador", "Gerente", "Vendedor", "Administrativo"] },
    { id: "inventory", label: "Inventario", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "clients", label: "Clientes / CRM", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "leads", label: "Leads", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "tradeins", label: "Permutas", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "purchases", label: "Compras", roles: ["Administrador", "Gerente"] },
    { id: "sales", label: "Ventas", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "financing", label: "Financiación", roles: ["Administrador", "Gerente", "Administrativo"] },
    { id: "reservations", label: "Reservas", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "testdrives", label: "Test Drives", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "cash", label: "Caja", roles: ["Administrador", "Gerente", "Administrativo"] },
    { id: "facturacion", label: "Facturación", roles: ["Administrador", "Gerente", "Administrativo"] },
    { id: "reports", label: "Reportes", roles: ["Administrador", "Gerente"] },
    { id: "config", label: "Configuración", roles: ["Administrador"] },
  ];
  const NAV = ALL_NAV.filter((n) => n.roles.includes(role));
  useEffect(() => { if (!NAV.find((n) => n.id === page)) setPage("dashboard"); }, [role]); // eslint-disable-line

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: "Inter" }}>Cargando AUTO OPS...</div>;
  }

  return (
    <div style={{ background: CARBON, minHeight: 680, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <style>{FONT_IMPORT}</style>
      <div className="ops-shell" style={{ display: "flex", minHeight: 680 }}>
        <div className="ops-sidebar" style={{ width: 220, background: "#0E0E11", borderRight: `1px solid ${BORDER}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 16px 8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: CARBON }}>04</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>AUTO<span style={{ color: GREEN }}>OPS</span></div>
          </div>

          <div style={{ padding: "0 8px 14px 8px" }}>
            <div style={{ fontSize: 10.5, color: GRAY, marginBottom: 4, fontFamily: "Inter", textTransform: "uppercase" }}>Ver como</div>
            <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ fontSize: 12, padding: "7px 8px" }}>
              {["Administrador", "Gerente", "Vendedor", "Administrativo"].map((r) => <option key={r}>{r}</option>)}
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
          {page === "inventory" && <Inventory data={data} persist={persist} showToast={showToast} />}
          {page === "clients" && <Clients data={data} persist={persist} showToast={showToast} />}
          {page === "leads" && <Leads data={data} persist={persist} showToast={showToast} />}
          {page === "tradeins" && <TradeIns data={data} persist={persist} showToast={showToast} />}
          {page === "purchases" && <Purchases data={data} persist={persist} showToast={showToast} />}
          {page === "sales" && <Sales data={data} persist={persist} showToast={showToast} />}
          {page === "financing" && <Financing data={data} persist={persist} showToast={showToast} />}
          {page === "reservations" && <Reservations data={data} persist={persist} showToast={showToast} />}
          {page === "testdrives" && <TestDrives data={data} persist={persist} showToast={showToast} />}
          {page === "cash" && <Cash data={data} persist={persist} showToast={showToast} />}
          {page === "facturacion" && (
            <FacturacionModule data={data} persist={persist} showToast={showToast} fmtMoney={fmtMoney} negocio={{ nombre: data.config?.agencyName }} />
          )}
          {page === "reports" && <Reports data={data} />}
          {page === "config" && <Config data={data} persist={persist} showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}


// ==================== DASHBOARD ====================
function Dashboard({ data, setPage }) {
  const stock = data.vehicles.filter((v) => !["Vendido", "Entregado", "Retirado"].includes(v.status));
  const reserved = data.vehicles.filter((v) => v.status === "Reservado").length;
  const sold = data.vehicles.filter((v) => v.status === "Vendido" || v.status === "Entregado").length;
  const published = data.vehicles.filter((v) => v.publishDate).length;

  const thisMonth = todayStr().slice(0, 7);
  const salesThisMonth = data.sales.filter((s) => (s.date || "").slice(0, 7) === thisMonth && s.status !== "Cancelada");
  const purchasesThisMonth = data.purchases.filter((p) => (p.date || "").slice(0, 7) === thisMonth);

  const estimatedGain = data.vehicles.reduce((s, v) => {
    const cost = Number(v.purchasePrice || 0) + (v.expenses || []).reduce((a, e) => a + Number(e.amount || 0), 0);
    return s + (Number(v.listPrice || 0) - cost);
  }, 0);
  const realizedGain = salesThisMonth.reduce((s, sale) => {
    const v = data.vehicles.find((x) => x.id === sale.vehicleId);
    const cost = v ? Number(v.purchasePrice || 0) + (v.expenses || []).reduce((a, e) => a + Number(e.amount || 0), 0) : 0;
    return s + (Number(sale.price || 0) - cost);
  }, 0);

  const tradeInsCount = data.tradeIns.length;
  const pendingLeads = data.leads.filter((l) => !["Venta", "Perdido"].includes(l.stage)).length;
  const newLeads = data.leads.filter((l) => l.stage === "Nuevo").length;
  const testDrivesScheduled = data.testDrives.filter((t) => t.status === "Programado" || t.status === "Confirmado").length;
  const pendingInstallments = data.financings.reduce((s, f) => s + installmentsFor(f).filter((i) => i.status !== "Pagada").length, 0);
  const expensesThisMonth = data.cash.filter((c) => c.type === "Egreso" && (c.date || "").slice(0, 7) === thisMonth).reduce((s, c) => s + Number(c.amount), 0);

  const daysInStockAlerts = stock.filter((v) => daysSince(v.entryDate) > 60).sort((a, b) => daysSince(b.entryDate) - daysSince(a.entryDate));
  const reservationAlerts = data.reservations.filter((r) => r.status === "Activa" && daysBetween(todayStr(), r.dueDate) <= 3).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdueInstallments = data.financings.flatMap((f) => installmentsFor(f).filter((i) => i.status !== "Pagada" && i.dueDate < todayStr()).map((i) => ({ ...i, clientName: f.clientName, vehicleTitle: f.vehicleTitle })));

  const stats = [
    { label: "Vehículos en stock", value: stock.length, onClick: () => setPage("inventory") },
    { label: "Publicados", value: published, onClick: () => setPage("inventory") },
    { label: "Reservados", value: reserved, onClick: () => setPage("inventory") },
    { label: "Vendidos (total)", value: sold, onClick: () => setPage("inventory") },
    { label: "Compras del mes", value: purchasesThisMonth.length, onClick: () => setPage("purchases") },
    { label: "Ventas del mes", value: salesThisMonth.length, onClick: () => setPage("sales") },
    { label: "Ganancia estimada (stock)", value: fmtMoney(estimatedGain), onClick: () => setPage("inventory") },
    { label: "Ganancia realizada (mes)", value: fmtMoney(realizedGain), onClick: () => setPage("sales") },
    { label: "Permutas ingresadas", value: tradeInsCount, onClick: () => setPage("tradeins") },
    { label: "Consultas / leads pendientes", value: pendingLeads, onClick: () => setPage("leads") },
    { label: "Leads nuevos", value: newLeads, onClick: () => setPage("leads"), tone: newLeads > 0 ? "good" : undefined },
    { label: "Test drives programados", value: testDrivesScheduled, onClick: () => setPage("testdrives") },
    { label: "Cuotas pendientes", value: pendingInstallments, onClick: () => setPage("financing") },
    { label: "Gastos del mes", value: fmtMoney(expensesThisMonth), onClick: () => setPage("cash") },
  ];

  const salesByMonth = last6Months().map((m) => ({ label: m.label, value: data.sales.filter((s) => (s.date || "").slice(0, 7) === m.key && s.status !== "Cancelada").length }));
  const purchasesByMonth = last6Months().map((m) => ({ label: m.label, value: data.purchases.filter((p) => (p.date || "").slice(0, 7) === m.key).length }));
  const gainByMonth = last6Months().map((m) => {
    const monthSales = data.sales.filter((s) => (s.date || "").slice(0, 7) === m.key && s.status !== "Cancelada");
    const gain = monthSales.reduce((s, sale) => {
      const v = data.vehicles.find((x) => x.id === sale.vehicleId);
      const cost = v ? Number(v.purchasePrice || 0) + (v.expenses || []).reduce((a, e) => a + Number(e.amount || 0), 0) : 0;
      return s + (Number(sale.price || 0) - cost);
    }, 0);
    return { label: m.label, value: Math.max(0, Math.round(gain / 100)) };
  });

  const bySeller = {};
  data.sales.forEach((s) => { if (s.status !== "Cancelada") bySeller[s.salesperson || "Sin asignar"] = (bySeller[s.salesperson || "Sin asignar"] || 0) + 1; });
  const salesBySeller = Object.entries(bySeller).map(([label, value]) => ({ label, value }));

  const byBrand = {};
  data.sales.forEach((s) => {
    const v = data.vehicles.find((x) => x.id === s.vehicleId);
    if (v && s.status !== "Cancelada") byBrand[v.brand] = (byBrand[v.brand] || 0) + 1;
  });
  const soldByBrand = Object.entries(byBrand).map(([label, value]) => ({ label, value }));

  const byChannel = {};
  data.leads.forEach((l) => { byChannel[l.channel] = (byChannel[l.channel] || 0) + 1; });
  const leadsByChannel = Object.entries(byChannel).map(([label, value]) => ({ label, value }));

  const avgDaysInStock = stock.length ? Math.round(stock.reduce((s, v) => s + daysSince(v.entryDate), 0) / stock.length) : 0;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Información en tiempo real de tu concesionaria" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} onClick={s.onClick} style={{ cursor: "pointer" }}>
            <MiniStat label={s.label} value={s.value} tone={s.tone} />
          </div>
        ))}
      </div>

      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ventas por mes</div><Bars data={salesByMonth} /></Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Compras por mes</div><Bars data={purchasesByMonth} /></Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ganancia mensual (x100 USD)</div><Bars data={gainByMonth} /></Card>
      </div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ventas por vendedor</div>{salesBySeller.length ? <Bars data={salesBySeller} /> : <EmptyState text="Sin ventas todavía." />}</Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Vendidos por marca</div>{soldByBrand.length ? <Bars data={soldByBrand} /> : <EmptyState text="Sin ventas todavía." />}</Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Origen de leads</div>{leadsByChannel.length ? <Bars data={leadsByChannel} /> : <EmptyState text="Sin leads todavía." />}</Card>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY }}>Tiempo promedio en stock</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 18, color: avgDaysInStock > 60 ? AMBER : OFFWHITE }}>{avgDaysInStock} días</div>
        </div>
      </Card>

      {(daysInStockAlerts.length > 0 || reservationAlerts.length > 0 || overdueInstallments.length > 0) && (
        <Card style={{ borderColor: "#3A1F1F" }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE, marginBottom: 12 }}>Alertas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {daysInStockAlerts.slice(0, 4).map((v) => (
              <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>{v.brand} {v.model}</span>
                <Badge tone="amber">{daysSince(v.entryDate)} días en stock</Badge>
              </div>
            ))}
            {reservationAlerts.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>Reserva {r.clientName} — {r.vehicleTitle}</span>
                <Badge tone="amber">vence {fmtDate(r.dueDate)}</Badge>
              </div>
            ))}
            {overdueInstallments.slice(0, 4).map((i) => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>Cuota {i.number} — {i.clientName}</span>
                <Badge tone="red">vencida {fmtDate(i.dueDate)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function last6Months() {
  const arr = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
    arr.push({ key, label });
  }
  return arr;
}
function installmentsFor(financing) {
  const n = Number(financing.installmentsCount) || 0;
  const value = n ? Number(financing.financedAmount) / n : 0;
  return Array.from({ length: n }).map((_, i) => {
    const dueDate = addDays(financing.date, 30 * (i + 1));
    const paid = financing.paidInstallments && financing.paidInstallments.includes(i);
    const status = paid ? "Pagada" : dueDate < todayStr() ? "Vencida" : "Pendiente";
    return { id: `${financing.id}-${i}`, index: i, number: i + 1, dueDate, amount: value, status };
  });
}

// ==================== INVENTARIO ====================
const emptyVehicle = { domain: "", brand: "", model: "", version: "", year: "", km: "0", color: "", fuel: FUELS[0], transmission: TRANSMISSIONS[0], engine: "", bodyType: "", category: "Auto", purchasePrice: "", listPrice: "", minPrice: "", cashPrice: "", financedPrice: "", currency: "USD", status: "Disponible", chassisNumber: "", engineNumber: "", location: "", entryDate: todayStr(), publishDate: todayStr(), provider: "", salesperson: "", expenses: [] };

function Inventory({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [ficha, setFicha] = useState(null);
  const [form, setForm] = useState(emptyVehicle);

  const filtered = data.vehicles.filter((v) =>
    (statusFilter === "Todos" || v.status === statusFilter) && (categoryFilter === "Todas" || v.category === categoryFilter)
  );

  const addVehicle = () => {
    if (!form.brand || !form.model || !form.listPrice) { showToast("Completá marca, modelo y precio publicado"); return; }
    persist({ ...data, vehicles: [{ id: uid(), ...form }, ...data.vehicles] });
    setForm(emptyVehicle); setShowForm(false); showToast("Vehículo agregado al stock");
  };
  const removeVehicle = (id) => persist({ ...data, vehicles: data.vehicles.filter((v) => v.id !== id) });
  const updateVehicle = (id, patch) => persist({ ...data, vehicles: data.vehicles.map((v) => v.id === id ? { ...v, ...patch } : v) });
  const addExpense = (id, concept, amount) => {
    const v = data.vehicles.find((x) => x.id === id);
    updateVehicle(id, { expenses: [...(v.expenses || []), { id: uid(), concept, amount: Number(amount) }] });
  };

  const statusCounts = Object.fromEntries(["Todos", ...VEHICLE_STATUSES].map((s) => [s, s === "Todos" ? data.vehicles.length : data.vehicles.filter((v) => v.status === s).length]));
  const catCounts = Object.fromEntries(["Todas", ...VEHICLE_CATEGORIES].map((c) => [c, c === "Todas" ? data.vehicles.length : data.vehicles.filter((v) => v.category === c).length]));

  return (
    <div>
      <PageHeader title="Inventario" subtitle={`${data.vehicles.length} vehículos`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo vehículo"}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Identificación</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Dominio"><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="AB123CD" /></Field>
            <Field label="Marca"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Toyota" /></Field>
            <Field label="Modelo"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Corolla" /></Field>
            <Field label="Versión"><Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="XEI CVT" /></Field>
            <Field label="Año"><Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="2023" /></Field>
            <Field label="Km"><Input type="number" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} /></Field>
            <Field label="Color"><Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Blanco" /></Field>
            <Field label="Categoría"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{VEHICLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Combustible"><Select value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>{FUELS.map((f) => <option key={f}>{f}</option>)}</Select></Field>
            <Field label="Transmisión"><Select value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })}>{TRANSMISSIONS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Motor"><Input value={form.engine} onChange={(e) => setForm({ ...form, engine: e.target.value })} placeholder="1.6L" /></Field>
            <Field label="Carrocería"><Input value={form.bodyType} onChange={(e) => setForm({ ...form, bodyType: e.target.value })} placeholder="Sedán" /></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Información comercial</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Precio de compra (USD)"><Input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></Field>
            <Field label="Precio publicado (USD)"><Input type="number" value={form.listPrice} onChange={(e) => setForm({ ...form, listPrice: e.target.value })} /></Field>
            <Field label="Precio mínimo (USD)"><Input type="number" value={form.minPrice} onChange={(e) => setForm({ ...form, minPrice: e.target.value })} /></Field>
            <Field label="Precio contado (USD)"><Input type="number" value={form.cashPrice} onChange={(e) => setForm({ ...form, cashPrice: e.target.value })} /></Field>
            <Field label="Precio financiado (USD)"><Input type="number" value={form.financedPrice} onChange={(e) => setForm({ ...form, financedPrice: e.target.value })} /></Field>
            <Field label="Estado"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{VEHICLE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Información adicional</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="N° chasis"><Input value={form.chassisNumber} onChange={(e) => setForm({ ...form, chassisNumber: e.target.value })} /></Field>
            <Field label="N° motor"><Input value={form.engineNumber} onChange={(e) => setForm({ ...form, engineNumber: e.target.value })} /></Field>
            <Field label="Ubicación"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Salón principal" /></Field>
            <Field label="Fecha de ingreso"><Input type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} /></Field>
            <Field label="Proveedor / propietario"><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></Field>
            <Field label="Vendedor responsable"><Input value={form.salesperson} onChange={(e) => setForm({ ...form, salesperson: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addVehicle}>Guardar vehículo</Btn></div>
        </Card>
      )}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginBottom: 6, textTransform: "uppercase" }}>Categoría</div>
        <FilterChips options={["Todas", ...VEHICLE_CATEGORIES]} value={categoryFilter} onChange={setCategoryFilter} counts={catCounts} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginBottom: 6, textTransform: "uppercase" }}>Estado</div>
        <FilterChips options={["Todos", ...VEHICLE_STATUSES]} value={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
      </div>

      {filtered.length === 0 ? <Card><EmptyState text="No hay vehículos para mostrar." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((v) => {
            const days = daysSince(v.entryDate);
            return (
              <Card key={v.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 220, cursor: "pointer" }} onClick={() => setFicha(v)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{v.brand} {v.model} {v.year}</div>
                      <Badge tone={v.status === "Disponible" ? "green" : v.status === "Reservado" ? "amber" : "gray"}>{v.status}</Badge>
                      <Badge tone="gray">{v.category}</Badge>
                      {days > 60 && <Badge tone="red">{days} días en stock</Badge>}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{Number(v.km).toLocaleString("es-AR")} km · {v.color} · {v.transmission}</div>
                  </div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: GREEN, marginRight: 10 }}>{fmtMoney(v.listPrice)}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Btn variant="secondary" onClick={() => setFicha(v)}>Ficha</Btn>
                    <Btn variant="danger" onClick={() => removeVehicle(v.id)}>Eliminar</Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {ficha && <VehicleModal vehicle={ficha} onClose={() => setFicha(null)} onUpdate={(patch) => { updateVehicle(ficha.id, patch); setFicha({ ...ficha, ...patch }); }} onAddExpense={addExpense} />}
    </div>
  );
}

function VehicleModal({ vehicle: v, onClose, onUpdate, onAddExpense }) {
  const [expConcept, setExpConcept] = useState(""); const [expAmount, setExpAmount] = useState("");
  const totalExpenses = (v.expenses || []).reduce((s, e) => s + Number(e.amount), 0);
  const totalCost = Number(v.purchasePrice || 0) + totalExpenses;
  const realGain = Number(v.listPrice || 0) - totalCost;
  const days = daysSince(v.entryDate);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 26, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: OFFWHITE }}>{v.brand} {v.model} {v.year}</div>
            <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{v.version} · {v.domain || "sin dominio"} · {days} días en stock</div>
          </div>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>

        <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          <MiniStat label="Precio publicado" value={fmtMoney(v.listPrice)} />
          <MiniStat label="Costo real" value={fmtMoney(totalCost)} />
          <MiniStat label="Ganancia real" value={fmtMoney(realGain)} tone={realGain >= 0 ? "good" : "bad"} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <Btn variant="secondary" onClick={() => onUpdate({ status: "Reservado" })}>Reservar</Btn>
          <Btn variant="secondary" onClick={() => onUpdate({ status: "Vendido" })}>Marcar vendido</Btn>
          <Btn variant="secondary" onClick={() => onUpdate({ publishDate: todayStr() })}>Publicar</Btn>
          <Btn variant="secondary" href={waLink("", `Hola, te comparto la ficha del ${v.brand} ${v.model} ${v.year}. Precio: ${fmtMoney(v.listPrice)}.`)}>WhatsApp</Btn>
          <Btn variant="secondary" onClick={() => window.print()}>Imprimir ficha</Btn>
        </div>

        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Gastos del vehículo</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: GRAY, fontFamily: "Inter" }}><span>Compra</span><span>{fmtMoney(v.purchasePrice)}</span></div>
          {(v.expenses || []).map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: OFFWHITE, fontFamily: "Inter" }}><span>{e.concept}</span><span>{fmtMoney(e.amount)}</span></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input placeholder="Concepto (service, cubiertas...)" value={expConcept} onChange={(e) => setExpConcept(e.target.value)} style={{ flex: 2 }} />
          <Input placeholder="Monto" type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} style={{ flex: 1 }} />
          <Btn onClick={() => { if (expConcept && expAmount) { onAddExpense(v.id, expConcept, expAmount); setExpConcept(""); setExpAmount(""); } }}>+ Gasto</Btn>
        </div>
      </div>
    </div>
  );
}

// ==================== CLIENTES / CRM ====================
const emptyClient = { name: "", lastName: "", dni: "", cuit: "", phone: "", whatsapp: "", email: "", address: "", birthDate: "", occupation: "", notes: "", budget: "", wantedVehicle: "", minYear: "", maxKm: "", paymentMethod: "Contado", needsFinancing: false, hasTradeIn: false, status: "Nuevo", timeline: [] };

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
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Juan" /></Field>
            <Field label="Apellido"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Pérez" /></Field>
            <Field label="DNI"><Input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            <Field label="Teléfono / WhatsApp"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value, whatsapp: e.target.value })} placeholder="+54 9 261 555 0100" /></Field>
            <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Presupuesto (USD)"><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
            <Field label="Vehículo buscado"><Input value={form.wantedVehicle} onChange={(e) => setForm({ ...form, wantedVehicle: e.target.value })} placeholder="SUV automática" /></Field>
            <Field label="Forma de pago"><Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option>Contado</option><option>Financiado</option><option>Combinado</option></Select></Field>
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
                    <Badge tone="gray">{c.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{c.phone}{c.wantedVehicle ? " · busca " + c.wantedVehicle : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" href={waLink(c.whatsapp || c.phone, `Hola ${c.name}, te escribo de la concesionaria.`)}>WhatsApp</Btn>
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
        {["WhatsApp", "Llamada", "Email", "Nota", "Visita", "Test drive", "Seguimiento"].map((t) => <option key={t}>{t}</option>)}
      </Select>
      <Input placeholder="Detalle..." value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 2 }} />
      <Btn onClick={() => { if (note) { onAdd(type, note); setNote(""); } }}>Agregar</Btn>
    </div>
  );
}

// ==================== LEADS (Kanban) ====================
function Leads({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", vehicleTitle: "", channel: LEAD_CHANNELS[0], message: "", salesperson: "", stage: "Nuevo" });
  const [dragId, setDragId] = useState(null);

  const addLead = () => {
    if (!form.clientName) { showToast("Completá el nombre del cliente"); return; }
    persist({ ...data, leads: [{ id: uid(), ...form, date: todayStr() }, ...data.leads] });
    setForm({ clientName: "", vehicleTitle: "", channel: LEAD_CHANNELS[0], message: "", salesperson: "", stage: "Nuevo" });
    setShowForm(false); showToast("Lead creado");
  };
  const moveLead = (id, stage) => persist({ ...data, leads: data.leads.map((l) => l.id === id ? { ...l, stage } : l) });
  const removeLead = (id) => persist({ ...data, leads: data.leads.filter((l) => l.id !== id) });

  return (
    <div>
      <PageHeader title="Leads" subtitle={`${data.leads.length} en el pipeline · arrastrá las tarjetas entre columnas`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo lead"}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Juan Pérez" list="cli-lead" /></Field>
            <datalist id="cli-lead">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Vehículo consultado"><Input value={form.vehicleTitle} onChange={(e) => setForm({ ...form, vehicleTitle: e.target.value })} placeholder="Toyota Corolla" /></Field>
            <Field label="Canal"><Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>{LEAD_CHANNELS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Vendedor asignado"><Input value={form.salesperson} onChange={(e) => setForm({ ...form, salesperson: e.target.value })} /></Field>
            <Field label="Mensaje"><Input value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Consulta por disponibilidad" /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addLead}>Crear lead</Btn></div>
        </Card>
      )}

      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
        {LEAD_STAGES.map((stage) => (
          <div key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragId) moveLead(dragId, stage); setDragId(null); }}
            style={{ minWidth: 200, flex: "none", background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10 }}>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: GRAY, marginBottom: 10, textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              <span>{stage}</span><span>{data.leads.filter((l) => l.stage === stage).length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 40 }}>
              {data.leads.filter((l) => l.stage === stage).map((l) => (
                <div key={l.id} draggable onDragStart={() => setDragId(l.id)} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", cursor: "grab" }}>
                  <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12.5, color: OFFWHITE }}>{l.clientName}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginTop: 3 }}>{l.vehicleTitle}</div>
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

// ==================== PERMUTAS / PLAN CANJE ====================
function TradeIns({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const emptyEval = Object.fromEntries(EVAL_ITEMS.map((it) => [it, "Bueno"]));
  const [form, setForm] = useState({ clientName: "", brand: "", model: "", year: "", domain: "", km: "", estimatedValue: "", takenValue: "", debt: "0", evaluation: emptyEval });

  const addTradeIn = () => {
    if (!form.clientName || !form.brand) { showToast("Completá cliente y marca del vehículo"); return; }
    persist({ ...data, tradeIns: [{ id: uid(), ...form, date: todayStr() }, ...data.tradeIns] });
    setForm({ clientName: "", brand: "", model: "", year: "", domain: "", km: "", estimatedValue: "", takenValue: "", debt: "0", evaluation: emptyEval });
    setShowForm(false); showToast("Permuta registrada");
  };
  const removeTradeIn = (id) => persist({ ...data, tradeIns: data.tradeIns.filter((t) => t.id !== id) });

  return (
    <div>
      <PageHeader title="Permutas / Plan Canje" subtitle={`${data.tradeIns.length} vehículos tomados`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva permuta"}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-ti" /></Field>
            <datalist id="cli-ti">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Marca"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Modelo"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Año"><Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
            <Field label="Dominio"><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></Field>
            <Field label="Km"><Input type="number" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <Field label="Valor estimado (USD)"><Input type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} /></Field>
            <Field label="Valor tomado (USD)"><Input type="number" value={form.takenValue} onChange={(e) => setForm({ ...form, takenValue: e.target.value })} /></Field>
            <Field label="Deuda existente (USD)"><Input type="number" value={form.debt} onChange={(e) => setForm({ ...form, debt: e.target.value })} /></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Evaluación</div>
          <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 6 }}>
            {EVAL_ITEMS.map((item) => (
              <Field key={item} label={item}>
                <Select value={form.evaluation[item]} onChange={(e) => setForm({ ...form, evaluation: { ...form.evaluation, [item]: e.target.value } })}>
                  {EVAL_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addTradeIn}>Guardar permuta</Btn></div>
        </Card>
      )}

      {data.tradeIns.length === 0 ? <Card><EmptyState text="Todavía no hay permutas registradas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.tradeIns.map((t) => {
            const realValue = Number(t.takenValue) - Number(t.debt);
            return (
              <Card key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{t.brand} {t.model} {t.year}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{t.clientName} · {fmtDate(t.date)} · valor real: <span style={{ color: GREEN, fontWeight: 600 }}>{fmtMoney(realValue)}</span></div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {EVAL_ITEMS.map((it) => <Badge key={it} tone={t.evaluation[it] === "Bueno" ? "green" : t.evaluation[it] === "Regular" ? "amber" : "red"}>{it}: {t.evaluation[it]}</Badge>)}
                    </div>
                  </div>
                  <Btn variant="danger" onClick={() => removeTradeIn(t.id)}>Eliminar</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== COMPRAS ====================
function Purchases({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ provider: "", vehicleTitle: "", purchasePrice: "", transferExpense: "", mechanicalExpense: "", aestheticExpense: "", otherExpense: "", date: todayStr() });

  const totalCost = (p) => Number(p.purchasePrice || 0) + Number(p.transferExpense || 0) + Number(p.mechanicalExpense || 0) + Number(p.aestheticExpense || 0) + Number(p.otherExpense || 0);

  const addPurchase = () => {
    if (!form.vehicleTitle || !form.purchasePrice) { showToast("Completá vehículo y precio de compra"); return; }
    persist({ ...data, purchases: [{ id: uid(), ...form }, ...data.purchases] });
    setForm({ provider: "", vehicleTitle: "", purchasePrice: "", transferExpense: "", mechanicalExpense: "", aestheticExpense: "", otherExpense: "", date: todayStr() });
    setShowForm(false); showToast("Compra registrada");
  };
  const removePurchase = (id) => persist({ ...data, purchases: data.purchases.filter((p) => p.id !== id) });

  return (
    <div>
      <PageHeader title="Compras" subtitle={`${data.purchases.length} vehículos comprados`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva compra"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Proveedor / propietario"><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></Field>
            <Field label="Vehículo"><Input value={form.vehicleTitle} onChange={(e) => setForm({ ...form, vehicleTitle: e.target.value })} placeholder="Toyota Corolla 2020" list="veh-purchase" /></Field>
            <datalist id="veh-purchase">{data.vehicles.map((v) => <option key={v.id} value={`${v.brand} ${v.model}`} />)}</datalist>
            <Field label="Precio de compra"><Input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></Field>
            <Field label="Gastos de transferencia"><Input type="number" value={form.transferExpense} onChange={(e) => setForm({ ...form, transferExpense: e.target.value })} /></Field>
            <Field label="Gastos mecánicos"><Input type="number" value={form.mechanicalExpense} onChange={(e) => setForm({ ...form, mechanicalExpense: e.target.value })} /></Field>
            <Field label="Gastos de estética"><Input type="number" value={form.aestheticExpense} onChange={(e) => setForm({ ...form, aestheticExpense: e.target.value })} /></Field>
            <Field label="Otros gastos"><Input type="number" value={form.otherExpense} onChange={(e) => setForm({ ...form, otherExpense: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 12, fontFamily: "Inter", fontSize: 13, color: GREEN }}>Costo total: {fmtMoney(totalCost(form))}</div>
          <div style={{ marginTop: 14 }}><Btn onClick={addPurchase}>Guardar compra</Btn></div>
        </Card>
      )}
      {data.purchases.length === 0 ? <Card><EmptyState text="Todavía no hay compras registradas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.purchases.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{p.vehicleTitle}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.provider} · {fmtDate(p.date)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: GREEN }}>{fmtMoney(totalCost(p))}</div>
                  <Btn variant="danger" onClick={() => removePurchase(p.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== VENTAS ====================
function Sales({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", vehicleTitle: "", vehicleId: "", salesperson: "", price: "", cash: "", transfer: "", card: "", tradeIn: "", financing: "", commissionPercent: "3", date: todayStr(), status: "Negociación" });

  const balance = Number(form.price || 0) - (Number(form.cash || 0) + Number(form.transfer || 0) + Number(form.card || 0) + Number(form.tradeIn || 0) + Number(form.financing || 0));

  const addSale = () => {
    if (!form.vehicleTitle || !form.price) { showToast("Completá vehículo y precio de venta"); return; }
    const seller = data.sellers.find((s) => s.name === form.salesperson);
    const commissionPercent = seller ? seller.commissionPercent : form.commissionPercent;
    const commission = (Number(form.price) * Number(commissionPercent)) / 100;
    persist({ ...data, sales: [{ id: uid(), ...form, commissionPercent, commission }, ...data.sales] });
    setForm({ clientName: "", vehicleTitle: "", vehicleId: "", salesperson: "", price: "", cash: "", transfer: "", card: "", tradeIn: "", financing: "", commissionPercent: "3", date: todayStr(), status: "Negociación" });
    setShowForm(false); showToast("Venta registrada");
  };
  const removeSale = (id) => persist({ ...data, sales: data.sales.filter((s) => s.id !== id) });
  const updateStatus = (id, status) => persist({ ...data, sales: data.sales.map((s) => s.id === id ? { ...s, status } : s) });

  return (
    <div>
      <PageHeader title="Ventas" subtitle={`${data.sales.length} operaciones`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva venta"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-sale" /></Field>
            <datalist id="cli-sale">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Vehículo"><Input value={form.vehicleTitle} onChange={(e) => setForm({ ...form, vehicleTitle: e.target.value })} list="veh-sale" /></Field>
            <datalist id="veh-sale">{data.vehicles.map((v) => <option key={v.id} value={`${v.brand} ${v.model}`} />)}</datalist>
            <Field label="Vendedor"><Select value={form.salesperson} onChange={(e) => setForm({ ...form, salesperson: e.target.value })}><option value="">-</option>{data.sellers.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Precio de venta (USD)"><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="Estado"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{SALE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Forma de pago (combinable)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <Field label="Efectivo"><Input type="number" value={form.cash} onChange={(e) => setForm({ ...form, cash: e.target.value })} /></Field>
            <Field label="Transferencia"><Input type="number" value={form.transfer} onChange={(e) => setForm({ ...form, transfer: e.target.value })} /></Field>
            <Field label="Tarjeta"><Input type="number" value={form.card} onChange={(e) => setForm({ ...form, card: e.target.value })} /></Field>
            <Field label="Permuta"><Input type="number" value={form.tradeIn} onChange={(e) => setForm({ ...form, tradeIn: e.target.value })} /></Field>
            <Field label="Financiación"><Input type="number" value={form.financing} onChange={(e) => setForm({ ...form, financing: e.target.value })} /></Field>
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 13, color: balance === 0 ? GREEN : AMBER, marginBottom: 12 }}>
            Saldo: {fmtMoney(balance)} {balance !== 0 && "(no cierra con el precio de venta)"}
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addSale}>Guardar venta</Btn></div>
        </Card>
      )}
      {data.sales.length === 0 ? <Card><EmptyState text="Todavía no hay ventas registradas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.sales.map((s) => (
            <Card key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{s.vehicleTitle}</div>
                    <Badge tone={s.status === "Cerrada" ? "green" : s.status === "Cancelada" ? "red" : "gray"}>{s.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{s.clientName} · {s.salesperson} · {fmtDate(s.date)} · comisión {fmtMoney(s.commission)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: GREEN }}>{fmtMoney(s.price)}</div>
                  <Select value={s.status} onChange={(e) => updateStatus(s.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{SALE_STATUSES.map((st) => <option key={st}>{st}</option>)}</Select>
                  <Btn variant="danger" onClick={() => removeSale(s.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== FINANCIACIÓN ====================
function Financing({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ clientName: "", vehicleTitle: "", price: "", downPayment: "", financedAmount: "", installmentsCount: "12", rate: "35", date: todayStr(), paidInstallments: [] });

  const addFinancing = () => {
    if (!form.clientName || !form.financedAmount) { showToast("Completá cliente y monto financiado"); return; }
    persist({ ...data, financings: [{ id: uid(), ...form }, ...data.financings] });
    setForm({ clientName: "", vehicleTitle: "", price: "", downPayment: "", financedAmount: "", installmentsCount: "12", rate: "35", date: todayStr(), paidInstallments: [] });
    setShowForm(false); showToast("Financiación creada");
  };
  const removeFinancing = (id) => persist({ ...data, financings: data.financings.filter((f) => f.id !== id) });
  const togglePaid = (fin, index) => {
    const paid = fin.paidInstallments || [];
    const next = paid.includes(index) ? paid.filter((i) => i !== index) : [...paid, index];
    persist({ ...data, financings: data.financings.map((f) => f.id === fin.id ? { ...f, paidInstallments: next } : f) });
  };

  const overdueCount = (fin) => installmentsFor(fin).filter((i) => i.status === "Vencida").length;

  return (
    <div>
      <PageHeader title="Financiación" subtitle={`${data.financings.length} planes`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva financiación"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-fin" /></Field>
            <datalist id="cli-fin">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Vehículo"><Input value={form.vehicleTitle} onChange={(e) => setForm({ ...form, vehicleTitle: e.target.value })} /></Field>
            <Field label="Precio del vehículo"><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="Anticipo"><Input type="number" value={form.downPayment} onChange={(e) => setForm({ ...form, downPayment: e.target.value })} /></Field>
            <Field label="Monto financiado"><Input type="number" value={form.financedAmount} onChange={(e) => setForm({ ...form, financedAmount: e.target.value })} /></Field>
            <Field label="Cuotas"><Input type="number" value={form.installmentsCount} onChange={(e) => setForm({ ...form, installmentsCount: e.target.value })} /></Field>
            <Field label="Tasa (%)"><Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
            <Field label="Fecha de alta"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addFinancing}>Crear plan</Btn></div>
        </Card>
      )}
      {data.financings.length === 0 ? <Card><EmptyState text="No hay financiaciones activas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.financings.map((f) => {
            const installments = installmentsFor(f);
            const overdue = overdueCount(f);
            return (
              <Card key={f.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{f.clientName}</div>
                      {overdue > 0 && <Badge tone="red">{overdue} cuota(s) vencida(s)</Badge>}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{f.vehicleTitle} · {f.installmentsCount} cuotas de {fmtMoney(Number(f.financedAmount) / Number(f.installmentsCount))}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: GREEN }}>{fmtMoney(f.financedAmount)}</div>
                    <Btn variant="danger" onClick={(e) => { e.stopPropagation(); removeFinancing(f.id); }}>Eliminar</Btn>
                  </div>
                </div>
                {expanded === f.id && (
                  <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                    {installments.map((i) => (
                      <div key={i.id} onClick={() => togglePaid(f, i.index)} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", cursor: "pointer", padding: "4px 0" }}>
                        <span style={{ color: OFFWHITE }}>Cuota {i.number} · {fmtDate(i.dueDate)}</span>
                        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: GRAY }}>{fmtMoney(i.amount)}</span>
                          <Badge tone={i.status === "Pagada" ? "green" : i.status === "Vencida" ? "red" : "gray"}>{i.status}</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== RESERVAS ====================
function Reservations({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", vehicleTitle: "", amount: "", date: todayStr(), dueDate: addDays(todayStr(), 7), salesperson: "", status: "Activa" });

  const addReservation = () => {
    if (!form.clientName || !form.vehicleTitle) { showToast("Completá cliente y vehículo"); return; }
    persist({ ...data, reservations: [{ id: uid(), ...form }, ...data.reservations] });
    setForm({ clientName: "", vehicleTitle: "", amount: "", date: todayStr(), dueDate: addDays(todayStr(), 7), salesperson: "", status: "Activa" });
    setShowForm(false); showToast("Reserva creada");
  };
  const removeReservation = (id) => persist({ ...data, reservations: data.reservations.filter((r) => r.id !== id) });
  const updateStatus = (id, status) => persist({ ...data, reservations: data.reservations.map((r) => r.id === id ? { ...r, status } : r) });

  return (
    <div>
      <PageHeader title="Reservas" subtitle={`${data.reservations.length} reservas`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva reserva"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-res" /></Field>
            <datalist id="cli-res">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Vehículo"><Input value={form.vehicleTitle} onChange={(e) => setForm({ ...form, vehicleTitle: e.target.value })} list="veh-res" /></Field>
            <datalist id="veh-res">{data.vehicles.map((v) => <option key={v.id} value={`${v.brand} ${v.model}`} />)}</datalist>
            <Field label="Monto de reserva"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Fecha de vencimiento"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
            <Field label="Vendedor"><Input value={form.salesperson} onChange={(e) => setForm({ ...form, salesperson: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addReservation}>Guardar reserva</Btn></div>
        </Card>
      )}
      {data.reservations.length === 0 ? <Card><EmptyState text="No hay reservas activas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.reservations.map((r) => {
            const soon = r.status === "Activa" && daysBetween(todayStr(), r.dueDate) <= 3;
            return (
              <Card key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{r.vehicleTitle}</div>
                      <Badge tone={r.status === "Activa" ? (soon ? "amber" : "green") : r.status === "Vencida" ? "red" : "gray"}>{r.status}</Badge>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{r.clientName} · vence {fmtDate(r.dueDate)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: GREEN }}>{fmtMoney(r.amount)}</div>
                    <Select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{RESERVATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                    <Btn variant="danger" onClick={() => removeReservation(r.id)}>Eliminar</Btn>
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

// ==================== TEST DRIVES ====================
function TestDrives({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", vehicleTitle: "", salesperson: "", date: todayStr(), time: "10:00", status: "Programado" });

  const addTestDrive = () => {
    if (!form.clientName || !form.vehicleTitle) { showToast("Completá cliente y vehículo"); return; }
    persist({ ...data, testDrives: [{ id: uid(), ...form }, ...data.testDrives].sort((a, b) => a.date.localeCompare(b.date)) });
    setForm({ clientName: "", vehicleTitle: "", salesperson: "", date: todayStr(), time: "10:00", status: "Programado" });
    setShowForm(false); showToast("Test drive agendado");
  };
  const removeTestDrive = (id) => persist({ ...data, testDrives: data.testDrives.filter((t) => t.id !== id) });
  const updateStatus = (id, status) => persist({ ...data, testDrives: data.testDrives.map((t) => t.id === id ? { ...t, status } : t) });

  return (
    <div>
      <PageHeader title="Test Drives" subtitle={`${data.testDrives.length} agendados`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo test drive"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-td" /></Field>
            <datalist id="cli-td">{data.clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Vehículo"><Input value={form.vehicleTitle} onChange={(e) => setForm({ ...form, vehicleTitle: e.target.value })} list="veh-td" /></Field>
            <datalist id="veh-td">{data.vehicles.map((v) => <option key={v.id} value={`${v.brand} ${v.model}`} />)}</datalist>
            <Field label="Vendedor"><Input value={form.salesperson} onChange={(e) => setForm({ ...form, salesperson: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addTestDrive}>Agendar</Btn></div>
        </Card>
      )}
      {data.testDrives.length === 0 ? <Card><EmptyState text="No hay test drives agendados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.testDrives.map((t) => (
            <Card key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{t.vehicleTitle}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{t.clientName} · {t.salesperson} · {fmtDate(t.date)} {t.time}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Select value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{TESTDRIVE_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                  <Btn variant="danger" onClick={() => removeTestDrive(t.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== CAJA ====================
function Cash({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Ingreso", concept: "", amount: "", method: "Transferencia", date: todayStr() });

  const balance = data.cash.reduce((s, c) => s + (c.type === "Ingreso" ? Number(c.amount) : -Number(c.amount)), 0);
  const income = data.cash.filter((c) => c.type === "Ingreso").reduce((s, c) => s + Number(c.amount), 0);
  const expense = data.cash.filter((c) => c.type === "Egreso").reduce((s, c) => s + Number(c.amount), 0);
  const commissionsLost = data.cash.filter((c) => c.method === "Tarjeta (Mercado Pago)" && c.type === "Ingreso").reduce((s, c) => s + Number(c.amount) * MP_COMMISSION_RATE, 0);

  const addEntry = () => {
    if (!form.concept || !form.amount) { showToast("Completá concepto y monto"); return; }
    persist({ ...data, cash: [{ id: uid(), ...form }, ...data.cash] });
    setForm({ type: "Ingreso", concept: "", amount: "", method: "Transferencia", date: todayStr() });
    setShowForm(false); showToast("Movimiento registrado");
  };
  const removeEntry = (id) => persist({ ...data, cash: data.cash.filter((c) => c.id !== id) });

  return (
    <div>
      <PageHeader title="Caja" subtitle="Ingresos y egresos" action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo movimiento"}</Btn>} />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Saldo" value={fmtMoney(balance)} tone={balance >= 0 ? "good" : "bad"} />
        <MiniStat label="Ingresos" value={fmtMoney(income)} />
        <MiniStat label="Egresos" value={fmtMoney(expense)} />
        <MiniStat label="Comisiones MP estimadas" value={fmtMoney(commissionsLost)} tone="warn" />
      </div>
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Ingreso</option><option>Egreso</option></Select></Field>
            <Field label="Concepto"><Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Venta, señas, sueldos, publicidad..." /></Field>
            <Field label="Monto (USD)"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Medio de pago"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option>Transferencia</option><option>Efectivo</option><option>Tarjeta (Mercado Pago)</option></Select></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addEntry}>Guardar movimiento</Btn></div>
        </Card>
      )}
      {data.cash.length === 0 ? <Card><EmptyState text="Todavía no hay movimientos de caja." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.cash.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{c.concept}</div>
                    <Badge tone={c.type === "Ingreso" ? "green" : "red"}>{c.type}</Badge>
                    <Badge tone="gray">{c.method}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{fmtDate(c.date)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: c.type === "Ingreso" ? GREEN : RED }}>{c.type === "Ingreso" ? "+" : "-"}{fmtMoney(c.amount)}</div>
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

// ==================== REPORTES ====================
function Reports({ data }) {
  const totalSales = data.sales.filter((s) => s.status !== "Cancelada");
  const totalRevenue = totalSales.reduce((s, x) => s + Number(x.price || 0), 0);
  const totalGain = totalSales.reduce((s, sale) => {
    const v = data.vehicles.find((x) => x.id === sale.vehicleId);
    const cost = v ? Number(v.purchasePrice || 0) + (v.expenses || []).reduce((a, e) => a + Number(e.amount || 0), 0) : 0;
    return s + (Number(sale.price || 0) - cost);
  }, 0);
  const byVehicleGain = totalSales.map((sale) => {
    const v = data.vehicles.find((x) => x.id === sale.vehicleId);
    const cost = v ? Number(v.purchasePrice || 0) + (v.expenses || []).reduce((a, e) => a + Number(e.amount || 0), 0) : 0;
    return { title: sale.vehicleTitle, gain: Number(sale.price || 0) - cost };
  }).sort((a, b) => b.gain - a.gain);

  const bySellerCommission = {};
  totalSales.forEach((s) => { bySellerCommission[s.salesperson || "Sin asignar"] = (bySellerCommission[s.salesperson || "Sin asignar"] || 0) + Number(s.commission || 0); });

  const leadConversion = data.leads.length ? Math.round((data.leads.filter((l) => l.stage === "Venta").length / data.leads.length) * 100) : 0;

  const exportSales = () => downloadCSV("ventas.csv", data.sales.map((s) => ({ vehiculo: s.vehicleTitle, cliente: s.clientName, vendedor: s.salesperson, precio: s.price, comision: s.commission, fecha: s.date, estado: s.status })));
  const exportVehicles = () => downloadCSV("inventario.csv", data.vehicles.map((v) => ({ marca: v.brand, modelo: v.model, año: v.year, categoria: v.category, estado: v.status, precio: v.listPrice, dias_en_stock: daysSince(v.entryDate) })));

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Estadísticas generales" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Ventas totales" value={totalSales.length} />
        <MiniStat label="Facturación total" value={fmtMoney(totalRevenue)} />
        <MiniStat label="Ganancia total" value={fmtMoney(totalGain)} tone="good" />
        <MiniStat label="Conversión de leads" value={`${leadConversion}%`} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Vehículos con mayor rentabilidad</div>
        {byVehicleGain.length === 0 ? <EmptyState text="Sin ventas todavía." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byVehicleGain.slice(0, 8).map((v, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "Inter" }}>
                <span style={{ color: OFFWHITE }}>{v.title}</span>
                <span style={{ color: v.gain >= 0 ? GREEN : RED, fontWeight: 600 }}>{fmtMoney(v.gain)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Comisiones por vendedor</div>
        {Object.keys(bySellerCommission).length === 0 ? <EmptyState text="Sin ventas todavía." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(bySellerCommission).map(([name, amt]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "Inter" }}>
                <span style={{ color: OFFWHITE }}>{name}</span>
                <span style={{ color: GREEN, fontWeight: 600 }}>{fmtMoney(amt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={exportSales}>Exportar ventas (CSV)</Btn>
        <Btn variant="secondary" onClick={exportVehicles}>Exportar inventario (CSV)</Btn>
      </div>
    </div>
  );
}

// ==================== CONFIGURACIÓN ====================
function Config({ data, persist, showToast }) {
  const [agencyName, setAgencyName] = useState(data.config?.agencyName || "");
  const [sellerForm, setSellerForm] = useState({ name: "", commissionPercent: "3", fixedCommission: "0", bonuses: "" });
  const [brandInput, setBrandInput] = useState("");

  const saveAgency = () => { persist({ ...data, config: { ...data.config, agencyName } }); showToast("Datos de la agencia guardados"); };
  const addSeller = () => {
    if (!sellerForm.name) return;
    persist({ ...data, sellers: [{ id: uid(), ...sellerForm }, ...data.sellers] });
    setSellerForm({ name: "", commissionPercent: "3", fixedCommission: "0", bonuses: "" });
    showToast("Vendedor agregado");
  };
  const removeSeller = (id) => persist({ ...data, sellers: data.sellers.filter((s) => s.id !== id) });
  const addBrand = () => {
    if (!brandInput) return;
    persist({ ...data, config: { ...data.config, brands: [...(data.config.brands || []), brandInput] } });
    setBrandInput("");
  };
  const removeBrand = (b) => persist({ ...data, config: { ...data.config, brands: (data.config.brands || []).filter((x) => x !== b) } });

  const roles = [
    { name: "Administrador", desc: "Acceso total al sistema." },
    { name: "Gerente", desc: "Stock, compras, ventas, caja, reportes y vendedores." },
    { name: "Vendedor", desc: "Clientes, leads, vehículos, visitas, test drives y ventas propias." },
    { name: "Administrativo", desc: "Documentación, caja y operaciones." },
  ];

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos de la agencia, usuarios, comisiones y automatizaciones" />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Datos de la agencia</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} placeholder="Nombre de la concesionaria" style={{ flex: 1 }} />
          <Btn onClick={saveAgency}>Guardar</Btn>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Vendedores y comisiones</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Input placeholder="Nombre" value={sellerForm.name} onChange={(e) => setSellerForm({ ...sellerForm, name: e.target.value })} style={{ flex: 1 }} />
          <Input placeholder="% comisión" type="number" value={sellerForm.commissionPercent} onChange={(e) => setSellerForm({ ...sellerForm, commissionPercent: e.target.value })} style={{ width: 110 }} />
          <Input placeholder="Comisión fija" type="number" value={sellerForm.fixedCommission} onChange={(e) => setSellerForm({ ...sellerForm, fixedCommission: e.target.value })} style={{ width: 130 }} />
          <Btn onClick={addSeller}>+ Vendedor</Btn>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.sellers.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "Inter", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ color: OFFWHITE }}>{s.name}</span>
              <span style={{ color: GRAY }}>{s.commissionPercent}% + {fmtMoney(s.fixedCommission)}</span>
              <span onClick={() => removeSeller(s.id)} style={{ color: RED, cursor: "pointer" }}>eliminar</span>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Marcas</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Input placeholder="Nueva marca" value={brandInput} onChange={(e) => setBrandInput(e.target.value)} style={{ flex: 1 }} />
          <Btn onClick={addBrand}>+ Agregar</Btn>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(data.config.brands || []).map((b) => (
            <Badge key={b} tone="gray">{b} <span onClick={() => removeBrand(b)} style={{ color: RED, marginLeft: 6, cursor: "pointer" }}>✕</span></Badge>
          ))}
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
        <div style={{ fontSize: 12.5, color: GRAY, fontFamily: "Inter", marginBottom: 10 }}>
          Estas automatizaciones están definidas pero requieren conectar n8n y WhatsApp Business API del lado del backend — no están activas en este prototipo.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Nuevo lead → crear cliente", "Lead sin respuesta → crear tarea", "Test drive mañana → enviar recordatorio", "Reserva próxima a vencer → enviar alerta", "Cuota vencida → crear seguimiento", "Vehículo con +30 días en stock → alertar gerente"].map((a) => (
            <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", color: OFFWHITE, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span>{a}</span><Badge tone="gray">A conectar</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
