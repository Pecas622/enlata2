import React, { useState, useEffect, useCallback } from "react";
import { FONT_IMPORT, CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "../lib/theme.js";
import { uid, todayStr, fmtDate } from "../lib/utils.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips } from "../lib/ui.jsx";

const STORAGE_KEY = "restaurantops-full-data";

const TABLE_STATUSES = ["Disponible", "Ocupada", "Reservada", "Esperando pedido", "Pedido en cocina", "Lista para cobrar"];
const MENU_CATEGORIES_SEED = ["Entradas", "Hamburguesas", "Pizzas", "Pastas", "Carnes", "Ensaladas", "Postres", "Bebidas", "Cafetería"];
const KITCHEN_STAGES = ["Nuevos", "En preparación", "Listos", "Entregados"];
const RESERVATION_STATUSES = ["Pendiente", "Confirmada", "En espera", "Llegó", "Finalizada", "Cancelada", "No se presentó"];
const CUSTOMER_SEGMENTS = ["Nuevo", "Frecuente", "VIP", "Inactivo"];
const DELIVERY_STAGES = ["Nuevo", "Confirmado", "Preparando", "Listo", "En camino", "Entregado"];
const TAKEAWAY_STATUSES = ["Recibido", "Preparando", "Listo", "Retirado"];
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Débito", "Crédito", "Mercado Pago", "Otro"];
const EXPENSE_CATEGORIES = ["Alquiler", "Servicios", "Sueldos", "Compras", "Mantenimiento", "Publicidad", "Insumos", "Delivery", "Impuestos", "Otros"];
const EMPLOYEE_ROLES = ["Administrador", "Encargado", "Mozo", "Cocina", "Cajero", "Bar", "Repartidor"];
const PROMO_TYPES = ["Descuento %", "Descuento fijo", "2x1", "3x2", "Happy hour"];

const EMPTY_DATA = {
  tables: [], products: [], categories: [], orders: [], reservations: [], customers: [],
  deliveries: [], takeaways: [], employees: [], shifts: [], suppliers: [], purchases: [],
  ingredients: [], expenses: [], cash: [], cashSessions: [], promotions: [], payments: [],
  config: { name: "Tu Restaurante", tipSuggestion: "10" },
};

// restaurant-specific time helpers (table occupancy, kitchen ticket age)
function nowTime() { return new Date().toTimeString().slice(0, 5); }
function minutesSince(dateStr, timeStr) {
  const then = new Date(`${dateStr}T${timeStr}:00`);
  return Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
}
// money is always ARS here (unlike InmoOps where currency varies per record)
function fmtMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
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

// ---------- atoms unique to RESTAURANT OPS (mini stat with semantic tone + bar chart) ----------
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
function last7Days() {
  const arr = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    arr.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "") });
  }
  return arr;
}

// ---------- Demo data seeder ----------
function addDays30() { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); }

function seedDemoData() {
  const categories = MENU_CATEGORIES_SEED.map((name) => ({ id: uid(), name }));
  const productNames = ["Milanesa napolitana", "Hamburguesa doble", "Pizza muzzarella", "Ravioles de ricota", "Ojo de bife", "Ensalada César", "Flan casero", "Coca-Cola 500ml", "Café con leche", "Papas fritas", "Empanadas (3)", "Pizza especial", "Lomo completo", "Tiramisú", "Agua con gas", "Cerveza artesanal", "Sorrentinos", "Bife de chorizo", "Ensalada mixta", "Cheesecake"];
  const products = productNames.map((name, i) => ({
    id: uid(), name, category: categories[i % categories.length].name, price: String(3500 + i * 800), cost: String(1200 + i * 300),
    status: "Disponible", estimatedTime: String(10 + (i % 4) * 5), code: `P${100 + i}`,
  }));
  const tables = Array.from({ length: 20 }).map((_, i) => ({
    id: uid(), number: i + 1, capacity: [2, 4, 4, 6][i % 4], status: i < 6 ? "Ocupada" : i < 8 ? "Reservada" : "Disponible",
    waiter: ["Juan", "Ana", "Luis"][i % 3], occupiedSince: i < 6 ? nowTime() : null, items: [],
  }));
  const customers = Array.from({ length: 30 }).map((_, i) => ({
    id: uid(), name: ["Juan", "María", "Carlos", "Ana", "Pedro", "Lucía", "Diego", "Sofía", "Martín", "Valentina"][i % 10],
    lastName: `Apellido${i}`, phone: `+54 9 261 555 05${i % 10}0`, whatsapp: `+54 9 261 555 05${i % 10}0`,
    visits: String(1 + (i % 12)), totalSpent: String(15000 + i * 2000), lastVisit: todayStr(),
    segment: i % 12 > 8 ? "VIP" : i % 12 > 4 ? "Frecuente" : i % 5 === 0 ? "Inactivo" : "Nuevo",
  }));
  const employees = Array.from({ length: 10 }).map((_, i) => ({
    id: uid(), name: ["Juan Pérez", "Ana Gómez", "Luis Ríos", "Carla Díaz", "Marcos Soto", "Lucía Paz", "Diego Ruiz", "Sofía Luna", "Martín Vega", "Julia Cruz"][i],
    dni: `${29000000 + i}`, phone: `+54 9 261 555 06${i}0`, role: EMPLOYEE_ROLES[i % EMPLOYEE_ROLES.length], entryDate: todayStr(), status: "Activo",
  }));
  const ingredients = [
    { id: uid(), name: "Carne molida", category: "Carne", unit: "kg", stock: "18", minStock: "10", cost: "3200", supplier: "Distribuidora Sur" },
    { id: uid(), name: "Pan de hamburguesa", category: "Pan", unit: "unidad", stock: "60", minStock: "40", cost: "250", supplier: "Panadería Central" },
    { id: uid(), name: "Queso cheddar", category: "Queso", unit: "kg", stock: "5", minStock: "8", cost: "4500", supplier: "Lácteos del Valle" },
    { id: uid(), name: "Papa", category: "Verdura", unit: "kg", stock: "40", minStock: "15", cost: "600", supplier: "Verdulería Norte" },
    { id: uid(), name: "Gaseosa 500ml", category: "Bebidas", unit: "unidad", stock: "80", minStock: "30", cost: "700", supplier: "Distribuidora Sur" },
    { id: uid(), name: "Café en grano", category: "Café", unit: "kg", stock: "3", minStock: "5", cost: "8500", supplier: "Tostadero Andes" },
  ];
  const suppliers = ["Distribuidora Sur", "Panadería Central", "Lácteos del Valle", "Verdulería Norte", "Tostadero Andes"].map((name) => ({ id: uid(), name, cuit: "30-00000000-0", phone: "+54 9 261 555 0700", products: "", notes: "" }));
  const purchases = Array.from({ length: 4 }).map((_, i) => ({ id: uid(), supplier: suppliers[i].name, product: ingredients[i].name, quantity: "20", price: ingredients[i].cost, total: String(Number(ingredients[i].cost) * 20), date: todayStr() }));
  const orders = tables.filter((t) => t.status === "Ocupada").map((t, i) => ({
    id: uid(), tableNumber: t.number, waiter: t.waiter, stage: KITCHEN_STAGES[i % 4], time: nowTime(),
    items: [{ id: uid(), productName: products[i].name, qty: 1 + (i % 3), notes: i % 2 === 0 ? "Sin cebolla" : "" }, { id: uid(), productName: products[i + 5].name, qty: 1, notes: "" }],
  }));
  const reservations = Array.from({ length: 5 }).map((_, i) => ({
    id: uid(), customerName: customers[i].name, phone: customers[i].phone, people: String(2 + i), date: todayStr(), time: `${19 + i % 3}:00`, status: RESERVATION_STATUSES[i % 4],
  }));
  const deliveries = Array.from({ length: 4 }).map((_, i) => ({
    id: uid(), customerName: customers[i + 10].name, address: `Calle ${100 + i}`, phone: customers[i + 10].phone, total: String(8000 + i * 1500),
    paymentMethod: PAYMENT_METHODS[i % 3], driver: "Repartidor 1", time: nowTime(), stage: DELIVERY_STAGES[i % 6],
  }));
  const takeaways = Array.from({ length: 3 }).map((_, i) => ({ id: uid(), customerName: customers[i + 15].name, pickupTime: `${13 + i}:30`, status: TAKEAWAY_STATUSES[i % 4], paymentMethod: "Efectivo" }));
  const expenses = [
    { id: uid(), concept: "Alquiler local", category: "Alquiler", amount: "350000", date: todayStr(), responsible: "Admin" },
    { id: uid(), concept: "Sueldos equipo", category: "Sueldos", amount: "820000", date: todayStr(), responsible: "Admin" },
  ];
  const cash = [
    { id: uid(), type: "Ingreso", concept: "Ventas del día", amount: "540000", method: "Efectivo", date: todayStr() },
    { id: uid(), type: "Ingreso", concept: "Ventas delivery", amount: "120000", method: "Mercado Pago", date: todayStr() },
    { id: uid(), type: "Egreso", concept: "Compra de insumos", amount: "85000", method: "Transferencia", date: todayStr() },
  ];
  const promotions = [{ id: uid(), name: "Happy Hour Cerveza", type: "Happy hour", discount: "20", startDate: todayStr(), endDate: addDays30(), days: "Lun-Vie", schedule: "18:00-20:00" }];
  return { tables, products, categories, orders, reservations, customers, deliveries, takeaways, employees, shifts: [], suppliers, purchases, ingredients, expenses, cash, cashSessions: [], promotions, payments: [], config: { name: "Tu Restaurante", tipSuggestion: "10" } };
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
    { id: "dashboard", label: "Dashboard", roles: ["Administrador", "Encargado", "Cajero", "Mozo", "Cocina", "Repartidor"] },
    { id: "salon", label: "Salón / Mesas", roles: ["Administrador", "Encargado", "Mozo"] },
    { id: "kitchen", label: "Cocina (KDS)", roles: ["Administrador", "Encargado", "Cocina"] },
    { id: "menu", label: "Menú y Recetas", roles: ["Administrador", "Encargado"] },
    { id: "delivery", label: "Delivery y Take Away", roles: ["Administrador", "Encargado", "Repartidor"] },
    { id: "reservations", label: "Reservas", roles: ["Administrador", "Encargado", "Mozo"] },
    { id: "customers", label: "Clientes", roles: ["Administrador", "Encargado", "Mozo"] },
    { id: "staff", label: "Mozos y Propinas", roles: ["Administrador", "Encargado"] },
    { id: "cash", label: "Caja", roles: ["Administrador", "Encargado", "Cajero"] },
    { id: "stock", label: "Stock", roles: ["Administrador", "Encargado"] },
    { id: "purchases", label: "Compras y Proveedores", roles: ["Administrador", "Encargado"] },
    { id: "promotions", label: "Promociones", roles: ["Administrador", "Encargado"] },
    { id: "employees", label: "Empleados y Turnos", roles: ["Administrador", "Encargado"] },
    { id: "communication", label: "Comunicación", roles: ["Administrador", "Encargado"] },
    { id: "reports", label: "Reportes", roles: ["Administrador", "Encargado"] },
    { id: "config", label: "Configuración", roles: ["Administrador"] },
  ];
  const NAV = ALL_NAV.filter((n) => n.roles.includes(role));
  useEffect(() => { if (!NAV.find((n) => n.id === page)) setPage("dashboard"); }, [role]); // eslint-disable-line

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: "Inter" }}>Cargando RESTAURANT OPS...</div>;
  }

  return (
    <div style={{ background: CARBON, minHeight: 680, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <style>{FONT_IMPORT}</style>
      <div className="ops-shell" style={{ display: "flex", minHeight: 680 }}>
        <div className="ops-sidebar" style={{ width: 220, background: "#0E0E11", borderRight: `1px solid ${BORDER}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 16px 8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: CARBON }}>05</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>RESTAURANT<span style={{ color: GREEN }}> OPS</span></div>
          </div>

          <div style={{ padding: "0 8px 14px 8px" }}>
            <div style={{ fontSize: 10.5, color: GRAY, marginBottom: 4, fontFamily: "Inter", textTransform: "uppercase" }}>Ver como</div>
            <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ fontSize: 12, padding: "7px 8px" }}>
              {EMPLOYEE_ROLES.map((r) => <option key={r}>{r}</option>)}
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
          {page === "salon" && <Salon data={data} persist={persist} showToast={showToast} />}
          {page === "kitchen" && <Kitchen data={data} persist={persist} />}
          {page === "menu" && <Menu data={data} persist={persist} showToast={showToast} />}
          {page === "delivery" && <DeliveryTakeaway data={data} persist={persist} showToast={showToast} />}
          {page === "reservations" && <Reservations data={data} persist={persist} showToast={showToast} />}
          {page === "customers" && <Customers data={data} persist={persist} showToast={showToast} />}
          {page === "staff" && <Staff data={data} />}
          {page === "cash" && <Cash data={data} persist={persist} showToast={showToast} />}
          {page === "stock" && <Stock data={data} persist={persist} showToast={showToast} />}
          {page === "purchases" && <Purchases data={data} persist={persist} showToast={showToast} />}
          {page === "promotions" && <Promotions data={data} persist={persist} showToast={showToast} />}
          {page === "employees" && <Employees data={data} persist={persist} showToast={showToast} />}
          {page === "communication" && <Communication data={data} />}
          {page === "reports" && <Reports data={data} />}
          {page === "config" && <Config data={data} persist={persist} showToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// ==================== DASHBOARD ====================
function Dashboard({ data, setPage }) {
  const salesToday = data.cash.filter((c) => c.type === "Ingreso" && c.date === todayStr()).reduce((s, c) => s + Number(c.amount), 0);
  const thisMonth = todayStr().slice(0, 7);
  const salesMonth = data.cash.filter((c) => c.type === "Ingreso" && (c.date || "").slice(0, 7) === thisMonth).reduce((s, c) => s + Number(c.amount), 0);
  const orderCount = data.orders.length;
  const avgTicket = orderCount ? Math.round(salesToday / Math.max(1, data.tables.filter((t) => t.status !== "Disponible").length)) : 0;
  const occupied = data.tables.filter((t) => t.status === "Ocupada").length;
  const available = data.tables.filter((t) => t.status === "Disponible").length;
  const pending = data.orders.filter((o) => o.stage === "Nuevos").length;
  const inKitchen = data.orders.filter((o) => o.stage === "En preparación").length;
  const ready = data.orders.filter((o) => o.stage === "Listos").length;
  const deliveryActive = data.deliveries.filter((d) => d.stage !== "Entregado").length;
  const expensesToday = data.cash.filter((c) => c.type === "Egreso" && c.date === todayStr()).reduce((s, c) => s + Number(c.amount), 0);
  const cashBalance = data.cash.reduce((s, c) => s + (c.type === "Ingreso" ? Number(c.amount) : -Number(c.amount)), 0);

  const itemCounts = {};
  data.orders.forEach((o) => (o.items || []).forEach((it) => { itemCounts[it.productName] = (itemCounts[it.productName] || 0) + it.qty; }));
  const topProducts = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const stats = [
    { label: "Ventas de hoy", value: fmtMoney(salesToday), onClick: () => setPage("cash"), tone: "good" },
    { label: "Ventas del mes", value: fmtMoney(salesMonth), onClick: () => setPage("reports") },
    { label: "Ticket promedio", value: fmtMoney(avgTicket) },
    { label: "Mesas ocupadas", value: `${occupied}/${data.tables.length}`, onClick: () => setPage("salon") },
    { label: "Mesas disponibles", value: available, onClick: () => setPage("salon") },
    { label: "Pedidos pendientes", value: pending, onClick: () => setPage("kitchen") },
    { label: "En cocina", value: inKitchen, onClick: () => setPage("kitchen") },
    { label: "Listos para entregar", value: ready, onClick: () => setPage("kitchen"), tone: ready > 0 ? "warn" : undefined },
    { label: "Delivery en curso", value: deliveryActive, onClick: () => setPage("delivery") },
    { label: "Gastos de hoy", value: fmtMoney(expensesToday) },
    { label: "Caja actual", value: fmtMoney(cashBalance), onClick: () => setPage("cash"), tone: cashBalance >= 0 ? "good" : "bad" },
  ];

  const salesByDay = last7Days().map((d) => ({ label: d.label, value: Math.round(data.cash.filter((c) => c.type === "Ingreso" && c.date === d.key).reduce((s, c) => s + Number(c.amount), 0) / 1000) }));
  const byMethod = {}; data.cash.filter((c) => c.type === "Ingreso").forEach((c) => { byMethod[c.method] = (byMethod[c.method] || 0) + 1; });
  const salesByMethod = Object.entries(byMethod).map(([label, value]) => ({ label, value }));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Restaurante en tiempo real" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} onClick={s.onClick} style={{ cursor: s.onClick ? "pointer" : "default" }}><MiniStat label={s.label} value={s.value} tone={s.tone} /></div>
        ))}
      </div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ventas por día (x1000 $, últimos 7 días)</div><Bars data={salesByDay} /></Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ventas por método de pago</div>{salesByMethod.length ? <Bars data={salesByMethod} /> : <EmptyState text="Sin ventas todavía." />}</Card>
      </div>
      <Card>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Productos más vendidos (pedidos activos)</div>
        {topProducts.length === 0 ? <EmptyState text="Sin pedidos todavía." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topProducts.map(([name, qty]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "Inter" }}>
                <span style={{ color: OFFWHITE }}>{name}</span><span style={{ color: GREEN, fontWeight: 600 }}>{qty} unidades</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ==================== SALÓN / MESAS + PEDIDOS ====================
function tableTone(status) {
  if (status === "Disponible") return "green";
  if (status === "Ocupada") return "amber";
  if (status === "Reservada") return "gray";
  if (status === "Lista para cobrar") return "red";
  return "gray";
}

function Salon({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ number: (data.tables.length || 0) + 1, capacity: "4" });
  const [orderFor, setOrderFor] = useState(null);

  const addTable = () => {
    persist({ ...data, tables: [...data.tables, { id: uid(), number: Number(form.number), capacity: Number(form.capacity), status: "Disponible", waiter: "", occupiedSince: null, items: [] }] });
    setForm({ number: data.tables.length + 2, capacity: "4" });
    setShowForm(false); showToast("Mesa creada");
  };
  const updateTable = (id, patch) => persist({ ...data, tables: data.tables.map((t) => t.id === id ? { ...t, ...patch } : t) });
  const removeTable = (id) => persist({ ...data, tables: data.tables.filter((t) => t.id !== id) });

  return (
    <div>
      <PageHeader title="Salón / Mesas" subtitle={`${data.tables.filter((t) => t.status === "Ocupada").length} ocupadas de ${data.tables.length}`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva mesa"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Número"><Input type="number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
            <Field label="Capacidad"><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addTable}>Crear mesa</Btn></div>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {data.tables.map((t) => (
          <Card key={t.id} style={{ cursor: "pointer", borderColor: t.status === "Ocupada" ? AMBER : t.status === "Lista para cobrar" ? RED : BORDER }} >
            <div onClick={() => setOrderFor(t)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 20, color: OFFWHITE }}>#{t.number}</div>
                <Badge tone={tableTone(t.status)}>{t.status}</Badge>
              </div>
              <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY }}>{t.capacity} personas</div>
              {t.waiter && <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY }}>{t.waiter}{t.occupiedSince ? ` · ${minutesSince(todayStr(), t.occupiedSince)} min` : ""}</div>}
              {(t.items || []).length > 0 && <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN, marginTop: 6 }}>{fmtMoney(tableTotal(t, data.products))}</div>}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <Btn variant="ghost" style={{ fontSize: 11, padding: "4px 6px" }} onClick={() => removeTable(t.id)}>eliminar</Btn>
            </div>
          </Card>
        ))}
      </div>

      {orderFor && <OrderModal table={orderFor} data={data} persist={persist} showToast={showToast} onClose={() => setOrderFor(null)} onUpdateTable={(patch) => { updateTable(orderFor.id, patch); setOrderFor({ ...orderFor, ...patch }); }} />}
    </div>
  );
}

function tableTotal(table, products) {
  return (table.items || []).reduce((s, it) => {
    const p = products.find((pr) => pr.name === it.productName);
    return s + (p ? Number(p.price) * it.qty : 0);
  }, 0);
}

function OrderModal({ table, data, persist, showToast, onClose, onUpdateTable }) {
  const [category, setCategory] = useState(data.categories[0]?.name || "");
  const [waiter, setWaiter] = useState(table.waiter || "");
  const [payMethod, setPayMethod] = useState("Efectivo");
  const [payAmount, setPayAmount] = useState("");

  const catProducts = data.products.filter((p) => p.category === category && p.status === "Disponible");
  const items = table.items || [];
  const total = tableTotal(table, data.products);

  const addItem = (product) => {
    const items2 = [...items, { id: uid(), productName: product.name, qty: 1, notes: "" }];
    onUpdateTable({ items: items2, status: table.status === "Disponible" ? "Ocupada" : table.status, waiter: waiter || table.waiter, occupiedSince: table.occupiedSince || nowTime() });
  };
  const removeItem = (itemId) => onUpdateTable({ items: items.filter((i) => i.id !== itemId) });
  const changeQty = (itemId, delta) => onUpdateTable({ items: items.map((i) => i.id === itemId ? { ...i, qty: Math.max(1, i.qty + delta) } : i) });
  const setItemNote = (itemId, note) => onUpdateTable({ items: items.map((i) => i.id === itemId ? { ...i, notes: note } : i) });

  const sendToKitchen = () => {
    if (items.length === 0) { showToast("Agregá productos primero"); return; }
    persist({ ...data, orders: [{ id: uid(), tableNumber: table.number, waiter, time: nowTime(), stage: "Nuevos", items }, ...data.orders], tables: data.tables.map((t) => t.id === table.id ? { ...t, status: "Pedido en cocina", waiter } : t) });
    onUpdateTable({ status: "Pedido en cocina" });
    showToast("Pedido enviado a cocina");
  };

  const closeTable = () => {
    if (payAmount && Number(payAmount) > 0) {
      persist({
        ...data,
        payments: [{ id: uid(), tableNumber: table.number, amount: payAmount, method: payMethod, date: todayStr() }, ...data.payments],
        cash: [{ id: uid(), type: "Ingreso", concept: `Mesa ${table.number}`, amount: payAmount, method: payMethod, date: todayStr() }, ...data.cash],
        tables: data.tables.map((t) => t.id === table.id ? { ...t, status: "Disponible", items: [], waiter: "", occupiedSince: null } : t),
      });
      showToast("Mesa cobrada y cerrada");
      onClose();
    } else {
      showToast("Ingresá el monto cobrado");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24, maxWidth: 760, width: "100%", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 20, color: OFFWHITE }}>Mesa #{table.number}</div>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <Input placeholder="Mozo asignado" value={waiter} onChange={(e) => setWaiter(e.target.value)} style={{ maxWidth: 220 }} />
        </div>
        <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
          <div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {data.categories.map((c) => (
                <div key={c.id} onClick={() => setCategory(c.name)} style={{ padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontFamily: "Inter", fontWeight: 600, background: category === c.name ? GREEN : "transparent", color: category === c.name ? CARBON : GRAY, border: `1px solid ${category === c.name ? GREEN : BORDER}` }}>{c.name}</div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {catProducts.map((p) => (
                <div key={p.id} onClick={() => addItem(p)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: CARD2 }}>
                  <span style={{ fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE }}>{p.name}</span>
                  <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12.5, color: GREEN }}>{fmtMoney(p.price)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Pedido actual</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 250, overflowY: "auto", marginBottom: 12 }}>
              {items.length === 0 ? <EmptyState text="Sin productos todavía." /> : items.map((it) => (
                <div key={it.id} style={{ background: CARD2, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE }}>{it.productName}</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span onClick={() => changeQty(it.id, -1)} style={{ cursor: "pointer", color: GRAY }}>-</span>
                      <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: OFFWHITE }}>{it.qty}</span>
                      <span onClick={() => changeQty(it.id, 1)} style={{ cursor: "pointer", color: GRAY }}>+</span>
                      <span onClick={() => removeItem(it.id)} style={{ cursor: "pointer", color: RED, marginLeft: 6, fontSize: 11 }}>✕</span>
                    </div>
                  </div>
                  <Input placeholder="Notas (sin cebolla...)" value={it.notes} onChange={(e) => setItemNote(it.id, e.target.value)} style={{ marginTop: 6, fontSize: 11.5, padding: "5px 8px" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: OFFWHITE, borderTop: `1px solid ${BORDER}`, paddingTop: 10, marginBottom: 12 }}>
              <span>Total</span><span style={{ color: GREEN }}>{fmtMoney(total)}</span>
            </div>
            <Btn onClick={sendToKitchen} style={{ width: "100%", marginBottom: 10 }}>Enviar a cocina</Btn>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12.5, color: OFFWHITE, marginBottom: 8 }}>Cobrar y cerrar mesa</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={{ flex: 1 }}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
                <Input type="number" placeholder={String(total)} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={{ width: 100 }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn variant="secondary" href={waLink("", `Cuenta Mesa ${table.number}: ${fmtMoney(total)}`)} style={{ flex: 1, textAlign: "center" }}>Enviar por WhatsApp</Btn>
                <Btn onClick={closeTable} style={{ flex: 1 }}>Cobrar y cerrar</Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== COCINA / KDS ====================
function Kitchen({ data, persist }) {
  const moveOrder = (id, stage) => persist({ ...data, orders: data.orders.map((o) => o.id === id ? { ...o, stage } : o) });
  const nextStage = (stage) => KITCHEN_STAGES[Math.min(KITCHEN_STAGES.indexOf(stage) + 1, KITCHEN_STAGES.length - 1)];

  return (
    <div>
      <PageHeader title="Cocina (KDS)" subtitle="Pedidos en tiempo real" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {KITCHEN_STAGES.map((stage) => (
          <div key={stage} style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: GRAY, marginBottom: 10, textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              <span>{stage}</span><span>{data.orders.filter((o) => o.stage === stage).length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.orders.filter((o) => o.stage === stage).map((o) => {
                const mins = minutesSince(todayStr(), o.time);
                const delayed = mins > 20 && stage !== "Entregados";
                return (
                  <div key={o.id} style={{ background: CARD, border: `1px solid ${delayed ? RED : BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>Mesa #{o.tableNumber}</span>
                      <Badge tone={delayed ? "red" : "gray"}>{mins} min</Badge>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginBottom: 6 }}>{o.waiter}</div>
                    {(o.items || []).map((it) => (
                      <div key={it.id} style={{ fontFamily: "Inter", fontSize: 12, color: OFFWHITE, marginBottom: 2 }}>
                        {it.qty}x {it.productName}{it.notes ? <span style={{ color: AMBER }}> — {it.notes}</span> : ""}
                      </div>
                    ))}
                    {stage !== "Entregados" && (
                      <Btn onClick={() => moveOrder(o.id, nextStage(stage))} style={{ width: "100%", marginTop: 8, fontSize: 11.5, padding: "6px 10px" }}>
                        {stage === "Nuevos" ? "Comenzar preparación" : stage === "En preparación" ? "Marcar listo" : "Entregar"}
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== MENÚ Y RECETAS ====================
function Menu({ data, persist, showToast }) {
  const [tab, setTab] = useState("Productos");
  const [showProdForm, setShowProdForm] = useState(false);
  const [prodForm, setProdForm] = useState({ name: "", category: data.categories[0]?.name || "", price: "", cost: "", status: "Disponible", estimatedTime: "15", code: "" });
  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");

  const addProduct = () => {
    if (!prodForm.name || !prodForm.price) { showToast("Completá nombre y precio"); return; }
    persist({ ...data, products: [{ id: uid(), ...prodForm, code: prodForm.code || `P${100 + data.products.length}` }, ...data.products] });
    setProdForm({ name: "", category: data.categories[0]?.name || "", price: "", cost: "", status: "Disponible", estimatedTime: "15", code: "" });
    setShowProdForm(false); showToast("Producto agregado");
  };
  const toggleStatus = (id) => persist({ ...data, products: data.products.map((p) => p.id === id ? { ...p, status: p.status === "Disponible" ? "No disponible" : "Disponible" } : p) });
  const removeProduct = (id) => persist({ ...data, products: data.products.filter((p) => p.id !== id) });
  const addCategory = () => {
    if (!catName) return;
    persist({ ...data, categories: [...data.categories, { id: uid(), name: catName }] });
    setCatName(""); setShowCatForm(false); showToast("Categoría agregada");
  };

  const filtered = categoryFilter === "Todas" ? data.products : data.products.filter((p) => p.category === categoryFilter);

  return (
    <div>
      <PageHeader title="Menú y Recetas" subtitle={`${data.products.length} productos · ${data.categories.length} categorías`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Productos", "Categorías"]} value={tab} onChange={setTab} /></div>

      {tab === "Productos" && (
        <>
          <div style={{ marginBottom: 14, display: "flex", gap: 8 }}><Btn onClick={() => setShowProdForm(!showProdForm)}>{showProdForm ? "Cancelar" : "+ Nuevo producto"}</Btn></div>
          {showProdForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Nombre"><Input value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} /></Field>
                <Field label="Categoría"><Select value={prodForm.category} onChange={(e) => setProdForm({ ...prodForm, category: e.target.value })}>{data.categories.map((c) => <option key={c.id}>{c.name}</option>)}</Select></Field>
                <Field label="Precio de venta"><Input type="number" value={prodForm.price} onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })} /></Field>
                <Field label="Costo (receta)"><Input type="number" value={prodForm.cost} onChange={(e) => setProdForm({ ...prodForm, cost: e.target.value })} placeholder="suma de ingredientes" /></Field>
                <Field label="Tiempo estimado (min)"><Input type="number" value={prodForm.estimatedTime} onChange={(e) => setProdForm({ ...prodForm, estimatedTime: e.target.value })} /></Field>
              </div>
              {prodForm.price && prodForm.cost && (
                <div style={{ marginTop: 10, fontFamily: "Inter", fontSize: 12.5, color: GREEN }}>
                  Margen: {fmtMoney(Number(prodForm.price) - Number(prodForm.cost))} ({Math.round(((Number(prodForm.price) - Number(prodForm.cost)) / Number(prodForm.price)) * 100)}%)
                </div>
              )}
              <div style={{ marginTop: 14 }}><Btn onClick={addProduct}>Guardar producto</Btn></div>
            </Card>
          )}
          <div style={{ marginBottom: 16 }}><FilterChips options={["Todas", ...data.categories.map((c) => c.name)]} value={categoryFilter} onChange={setCategoryFilter} /></div>
          {filtered.length === 0 ? <Card><EmptyState text="No hay productos." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((p) => {
                const margin = Number(p.price) - Number(p.cost || 0);
                const marginPct = p.price ? Math.round((margin / Number(p.price)) * 100) : 0;
                return (
                  <Card key={p.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{p.name}</div>
                          <Badge tone={p.status === "Disponible" ? "green" : "gray"}>{p.status}</Badge>
                        </div>
                        <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.category} · costo {fmtMoney(p.cost)} · margen {marginPct}%</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: GREEN }}>{fmtMoney(p.price)}</div>
                        <Btn variant="secondary" onClick={() => toggleStatus(p.id)}>{p.status === "Disponible" ? "Desactivar" : "Activar"}</Btn>
                        <Btn variant="danger" onClick={() => removeProduct(p.id)}>Eliminar</Btn>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "Categorías" && (
        <>
          <div style={{ marginBottom: 14, display: "flex", gap: 8 }}>
            <Input placeholder="Nueva categoría" value={catName} onChange={(e) => setCatName(e.target.value)} style={{ maxWidth: 240 }} />
            <Btn onClick={addCategory}>+ Agregar</Btn>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {data.categories.map((c) => <Badge key={c.id} tone="gray">{c.name}</Badge>)}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== DELIVERY Y TAKE AWAY ====================
function DeliveryTakeaway({ data, persist, showToast }) {
  const [tab, setTab] = useState("Delivery");
  const [showDelForm, setShowDelForm] = useState(false);
  const [delForm, setDelForm] = useState({ customerName: "", address: "", phone: "", total: "", paymentMethod: "Efectivo", driver: "", stage: "Nuevo" });
  const [showTaForm, setShowTaForm] = useState(false);
  const [taForm, setTaForm] = useState({ customerName: "", pickupTime: "", status: "Recibido", paymentMethod: "Efectivo" });

  const addDelivery = () => {
    if (!delForm.customerName || !delForm.address) { showToast("Completá cliente y dirección"); return; }
    persist({ ...data, deliveries: [{ id: uid(), ...delForm, time: nowTime() }, ...data.deliveries] });
    setDelForm({ customerName: "", address: "", phone: "", total: "", paymentMethod: "Efectivo", driver: "", stage: "Nuevo" });
    setShowDelForm(false); showToast("Delivery creado");
  };
  const moveDelivery = (id, stage) => persist({ ...data, deliveries: data.deliveries.map((d) => d.id === id ? { ...d, stage } : d) });
  const removeDelivery = (id) => persist({ ...data, deliveries: data.deliveries.filter((d) => d.id !== id) });

  const addTakeaway = () => {
    if (!taForm.customerName) { showToast("Completá el cliente"); return; }
    persist({ ...data, takeaways: [{ id: uid(), ...taForm }, ...data.takeaways] });
    setTaForm({ customerName: "", pickupTime: "", status: "Recibido", paymentMethod: "Efectivo" });
    setShowTaForm(false); showToast("Pedido para retirar creado");
  };
  const updateTaStatus = (id, status) => persist({ ...data, takeaways: data.takeaways.map((t) => t.id === id ? { ...t, status } : t) });
  const removeTakeaway = (id) => persist({ ...data, takeaways: data.takeaways.filter((t) => t.id !== id) });

  return (
    <div>
      <PageHeader title="Delivery y Take Away" subtitle={`${data.deliveries.length} delivery · ${data.takeaways.length} para retirar`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Delivery", "Take Away"]} value={tab} onChange={setTab} /></div>

      {tab === "Delivery" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowDelForm(!showDelForm)}>{showDelForm ? "Cancelar" : "+ Nuevo delivery"}</Btn></div>
          {showDelForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Cliente"><Input value={delForm.customerName} onChange={(e) => setDelForm({ ...delForm, customerName: e.target.value })} /></Field>
                <Field label="Dirección"><Input value={delForm.address} onChange={(e) => setDelForm({ ...delForm, address: e.target.value })} /></Field>
                <Field label="Teléfono"><Input value={delForm.phone} onChange={(e) => setDelForm({ ...delForm, phone: e.target.value })} /></Field>
                <Field label="Total"><Input type="number" value={delForm.total} onChange={(e) => setDelForm({ ...delForm, total: e.target.value })} /></Field>
                <Field label="Forma de pago"><Select value={delForm.paymentMethod} onChange={(e) => setDelForm({ ...delForm, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
                <Field label="Repartidor"><Input value={delForm.driver} onChange={(e) => setDelForm({ ...delForm, driver: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addDelivery}>Crear delivery</Btn></div>
            </Card>
          )}
          <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
            {DELIVERY_STAGES.map((stage) => (
              <div key={stage} style={{ minWidth: 190, flex: "none", background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10 }}>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 11.5, color: GRAY, marginBottom: 10, textTransform: "uppercase" }}>{stage} ({data.deliveries.filter((d) => d.stage === stage).length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.deliveries.filter((d) => d.stage === stage).map((d) => (
                    <div key={d.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, color: OFFWHITE }}>{d.customerName}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginTop: 2 }}>{d.address}</div>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: GREEN, marginTop: 4 }}>{fmtMoney(d.total)}</div>
                      {stage !== "Entregado" && (
                        <Btn onClick={() => moveDelivery(d.id, DELIVERY_STAGES[DELIVERY_STAGES.indexOf(stage) + 1])} style={{ width: "100%", marginTop: 6, fontSize: 10.5, padding: "4px 8px" }}>Avanzar</Btn>
                      )}
                      <span onClick={() => removeDelivery(d.id)} style={{ display: "block", textAlign: "center", color: RED, fontSize: 10.5, cursor: "pointer", marginTop: 4 }}>eliminar</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "Take Away" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowTaForm(!showTaForm)}>{showTaForm ? "Cancelar" : "+ Nuevo pedido"}</Btn></div>
          {showTaForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Cliente"><Input value={taForm.customerName} onChange={(e) => setTaForm({ ...taForm, customerName: e.target.value })} /></Field>
                <Field label="Hora de retiro"><Input type="time" value={taForm.pickupTime} onChange={(e) => setTaForm({ ...taForm, pickupTime: e.target.value })} /></Field>
                <Field label="Forma de pago"><Select value={taForm.paymentMethod} onChange={(e) => setTaForm({ ...taForm, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addTakeaway}>Crear pedido</Btn></div>
            </Card>
          )}
          {data.takeaways.length === 0 ? <Card><EmptyState text="No hay pedidos para retirar." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.takeaways.map((t) => (
                <Card key={t.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{t.customerName}</div>
                        <Badge tone={t.status === "Listo" ? "green" : "gray"}>{t.status}</Badge>
                      </div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>Retira a las {t.pickupTime}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Select value={t.status} onChange={(e) => updateTaStatus(t.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{TAKEAWAY_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                      <Btn variant="danger" onClick={() => removeTakeaway(t.id)}>Eliminar</Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== RESERVAS ====================
function Reservations({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: "", phone: "", people: "2", date: todayStr(), time: "20:00", status: "Pendiente" });

  const addReservation = () => {
    if (!form.customerName) { showToast("Completá el cliente"); return; }
    if (data.reservations.some((r) => r.date === form.date && r.time === form.time && r.status !== "Cancelada")) { showToast("Ya hay una reserva en ese horario. Elegí otro."); return; }
    persist({ ...data, reservations: [{ id: uid(), ...form }, ...data.reservations] });
    setForm({ customerName: "", phone: "", people: "2", date: todayStr(), time: "20:00", status: "Pendiente" });
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
            <Field label="Cliente"><Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} list="cust-res" /></Field>
            <datalist id="cust-res">{data.customers.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Personas"><Input type="number" value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addReservation}>Guardar reserva</Btn></div>
        </Card>
      )}
      {data.reservations.length === 0 ? <Card><EmptyState text="No hay reservas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...data.reservations].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).map((r) => (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{r.customerName}</div>
                    <Badge tone={r.status === "Confirmada" ? "green" : r.status === "Cancelada" ? "red" : "gray"}>{r.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{fmtDate(r.date)} {r.time} · {r.people} personas</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{RESERVATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                  <Btn variant="danger" onClick={() => removeReservation(r.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== CLIENTES ====================
function Customers({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [segmentFilter, setSegmentFilter] = useState("Todos");
  const [form, setForm] = useState({ name: "", lastName: "", phone: "", whatsapp: "", segment: "Nuevo", visits: "1", totalSpent: "0" });

  const filtered = segmentFilter === "Todos" ? data.customers : data.customers.filter((c) => c.segment === segmentFilter);

  const addCustomer = () => {
    if (!form.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, customers: [{ id: uid(), ...form, whatsapp: form.whatsapp || form.phone, lastVisit: todayStr() }, ...data.customers] });
    setForm({ name: "", lastName: "", phone: "", whatsapp: "", segment: "Nuevo", visits: "1", totalSpent: "0" });
    setShowForm(false); showToast("Cliente agregado");
  };
  const removeCustomer = (id) => persist({ ...data, customers: data.customers.filter((c) => c.id !== id) });

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${data.customers.length} clientes`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo cliente"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Apellido"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="Teléfono/WhatsApp"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Segmento"><Select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>{CUSTOMER_SEGMENTS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addCustomer}>Guardar cliente</Btn></div>
        </Card>
      )}
      <div style={{ marginBottom: 16 }}><FilterChips options={["Todos", ...CUSTOMER_SEGMENTS]} value={segmentFilter} onChange={setSegmentFilter} /></div>
      {filtered.length === 0 ? <Card><EmptyState text="No hay clientes en este segmento." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{c.name} {c.lastName}</div>
                    <Badge tone={c.segment === "VIP" ? "green" : c.segment === "Inactivo" ? "red" : "gray"}>{c.segment}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{c.visits} visitas · consumo total {fmtMoney(c.totalSpent)}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" href={waLink(c.whatsapp || c.phone, `Hola ${c.name}, te escribimos del restaurante.`)}>WhatsApp</Btn>
                  <Btn variant="danger" onClick={() => removeCustomer(c.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== MOZOS Y PROPINAS ====================
function Staff({ data }) {
  const waiters = [...new Set(data.tables.map((t) => t.waiter).filter(Boolean))];
  const stats = waiters.map((w) => {
    const tables = data.tables.filter((t) => t.waiter === w);
    const sales = data.payments.filter((p) => tables.some((t) => t.number === p.tableNumber)).reduce((s, p) => s + Number(p.amount), 0);
    return { name: w, tableCount: tables.length, sales, tip: Math.round(sales * 0.1) };
  });
  const totalTips = stats.reduce((s, w) => s + w.tip, 0);

  return (
    <div>
      <PageHeader title="Mozos y Propinas" subtitle="Estadísticas por mozo" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Mozos activos" value={waiters.length} />
        <MiniStat label="Propinas del día (estimado 10%)" value={fmtMoney(totalTips)} tone="good" />
        <MiniStat label="Mesas atendidas hoy" value={data.tables.filter((t) => t.waiter).length} />
      </div>
      {stats.length === 0 ? <Card><EmptyState text="Todavía no hay mozos con mesas asignadas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stats.map((w) => (
            <Card key={w.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{w.name}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{w.tableCount} mesas atendidas</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(w.sales)}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11, color: AMBER }}>propina est. {fmtMoney(w.tip)}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== CAJA (apertura/cierre + gastos) ====================
function Cash({ data, persist, showToast }) {
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [openAmount, setOpenAmount] = useState("");
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryForm, setEntryForm] = useState({ type: "Ingreso", concept: "", category: EXPENSE_CATEGORIES[0], amount: "", method: "Efectivo", date: todayStr() });
  const [declaredCash, setDeclaredCash] = useState("");

  const openSession = data.cashSessions.find((s) => s.date === todayStr() && !s.closed);
  const income = data.cash.filter((c) => c.type === "Ingreso" && c.date === todayStr()).reduce((s, c) => s + Number(c.amount), 0);
  const expense = data.cash.filter((c) => c.type === "Egreso" && c.date === todayStr()).reduce((s, c) => s + Number(c.amount), 0);
  const cashIncome = data.cash.filter((c) => c.type === "Ingreso" && c.date === todayStr() && c.method === "Efectivo").reduce((s, c) => s + Number(c.amount), 0);
  const expectedCash = (openSession ? Number(openSession.initialAmount) : 0) + cashIncome - expense;
  const balance = data.cash.reduce((s, c) => s + (c.type === "Ingreso" ? Number(c.amount) : -Number(c.amount)), 0);

  const openCash = () => {
    persist({ ...data, cashSessions: [{ id: uid(), date: todayStr(), initialAmount: openAmount || "0", closed: false }, ...data.cashSessions] });
    setOpenAmount(""); setShowOpenForm(false); showToast("Caja abierta");
  };
  const closeCash = () => {
    persist({ ...data, cashSessions: data.cashSessions.map((s) => s.id === openSession.id ? { ...s, closed: true, declaredCash, difference: Number(declaredCash) - expectedCash } : s) });
    showToast("Caja cerrada");
  };
  const addEntry = () => {
    if (!entryForm.concept || !entryForm.amount) { showToast("Completá concepto y monto"); return; }
    persist({ ...data, cash: [{ id: uid(), ...entryForm }, ...data.cash] });
    setEntryForm({ type: "Ingreso", concept: "", category: EXPENSE_CATEGORIES[0], amount: "", method: "Efectivo", date: todayStr() });
    setShowEntryForm(false); showToast("Movimiento registrado");
  };

  return (
    <div>
      <PageHeader title="Caja" subtitle={openSession ? "Caja abierta" : "Caja cerrada"} action={!openSession ? <Btn onClick={() => setShowOpenForm(!showOpenForm)}>{showOpenForm ? "Cancelar" : "Abrir caja"}</Btn> : <Btn variant="secondary" onClick={() => setShowEntryForm(!showEntryForm)}>{showEntryForm ? "Cancelar" : "+ Movimiento"}</Btn>} />

      {showOpenForm && (
        <Card style={{ marginBottom: 16 }}>
          <Field label="Monto inicial"><Input type="number" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} /></Field>
          <div style={{ marginTop: 12 }}><Btn onClick={openCash}>Abrir caja</Btn></div>
        </Card>
      )}

      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Caja histórica" value={fmtMoney(balance)} tone={balance >= 0 ? "good" : "bad"} />
        <MiniStat label="Ingresos de hoy" value={fmtMoney(income)} />
        <MiniStat label="Egresos de hoy" value={fmtMoney(expense)} />
        <MiniStat label="Efectivo esperado" value={fmtMoney(expectedCash)} />
      </div>

      {showEntryForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Tipo"><Select value={entryForm.type} onChange={(e) => setEntryForm({ ...entryForm, type: e.target.value })}><option>Ingreso</option><option>Egreso</option></Select></Field>
            <Field label="Concepto"><Input value={entryForm.concept} onChange={(e) => setEntryForm({ ...entryForm, concept: e.target.value })} /></Field>
            {entryForm.type === "Egreso" && <Field label="Categoría"><Select value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>}
            <Field label="Monto"><Input type="number" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} /></Field>
            <Field label="Método"><Select value={entryForm.method} onChange={(e) => setEntryForm({ ...entryForm, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addEntry}>Guardar movimiento</Btn></div>
        </Card>
      )}

      {openSession && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Cierre de caja</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <Field label="Efectivo declarado"><Input type="number" value={declaredCash} onChange={(e) => setDeclaredCash(e.target.value)} placeholder={String(expectedCash)} /></Field>
            <Btn onClick={closeCash}>Cerrar caja</Btn>
          </div>
          {declaredCash && (
            <div style={{ marginTop: 10, fontFamily: "Inter", fontSize: 12.5, color: Number(declaredCash) - expectedCash === 0 ? GREEN : RED }}>
              Diferencia: {fmtMoney(Number(declaredCash) - expectedCash)}
            </div>
          )}
        </Card>
      )}

      {data.cash.filter((c) => c.date === todayStr()).length === 0 ? <Card><EmptyState text="No hay movimientos hoy." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.cash.filter((c) => c.date === todayStr()).map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{c.concept}</div>
                    <Badge tone={c.type === "Ingreso" ? "green" : "red"}>{c.type}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{c.method}</div>
                </div>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: c.type === "Ingreso" ? GREEN : RED }}>{c.type === "Ingreso" ? "+" : "-"}{fmtMoney(c.amount)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== STOCK ====================
function Stock({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", unit: "kg", stock: "", minStock: "", cost: "", supplier: "" });

  const addIngredient = () => {
    if (!form.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, ingredients: [{ id: uid(), ...form }, ...data.ingredients] });
    setForm({ name: "", category: "", unit: "kg", stock: "", minStock: "", cost: "", supplier: "" });
    setShowForm(false); showToast("Insumo agregado");
  };
  const updateStock = (id, stock) => persist({ ...data, ingredients: data.ingredients.map((i) => i.id === id ? { ...i, stock } : i) });
  const removeIngredient = (id) => persist({ ...data, ingredients: data.ingredients.filter((i) => i.id !== id) });

  const lowStock = data.ingredients.filter((i) => Number(i.stock) <= Number(i.minStock));

  return (
    <div>
      <PageHeader title="Stock" subtitle={`${data.ingredients.length} insumos${lowStock.length ? ` · ${lowStock.length} con stock bajo` : ""}`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo insumo"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Categoría"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Unidad"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="kg, unidad, litro" /></Field>
            <Field label="Stock actual"><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            <Field label="Stock mínimo"><Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></Field>
            <Field label="Costo"><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Proveedor"><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addIngredient}>Guardar insumo</Btn></div>
        </Card>
      )}
      {data.ingredients.length === 0 ? <Card><EmptyState text="No hay insumos cargados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.ingredients.map((i) => {
            const low = Number(i.stock) <= Number(i.minStock);
            return (
              <Card key={i.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{i.name}</div>
                      {low && <Badge tone="red">Stock bajo</Badge>}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{i.category} · {i.supplier} · costo {fmtMoney(i.cost)}/{i.unit}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Input type="number" value={i.stock} onChange={(e) => updateStock(i.id, e.target.value)} style={{ width: 80 }} />
                    <span style={{ fontFamily: "Inter", fontSize: 11, color: GRAY }}>{i.unit}</span>
                    <Btn variant="danger" onClick={() => removeIngredient(i.id)}>Eliminar</Btn>
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

// ==================== COMPRAS Y PROVEEDORES ====================
function Purchases({ data, persist, showToast }) {
  const [tab, setTab] = useState("Compras");
  const [showPurchForm, setShowPurchForm] = useState(false);
  const [purchForm, setPurchForm] = useState({ supplier: "", product: "", quantity: "", price: "", date: todayStr() });
  const [showSupForm, setShowSupForm] = useState(false);
  const [supForm, setSupForm] = useState({ name: "", cuit: "", phone: "", products: "" });

  const addPurchase = () => {
    if (!purchForm.supplier || !purchForm.product) { showToast("Completá proveedor y producto"); return; }
    const total = Number(purchForm.quantity) * Number(purchForm.price);
    persist({
      ...data,
      purchases: [{ id: uid(), ...purchForm, total }, ...data.purchases],
      ingredients: data.ingredients.map((i) => i.name === purchForm.product ? { ...i, stock: String(Number(i.stock) + Number(purchForm.quantity)) } : i),
    });
    setPurchForm({ supplier: "", product: "", quantity: "", price: "", date: todayStr() });
    setShowPurchForm(false); showToast("Compra registrada — stock actualizado");
  };
  const addSupplier = () => {
    if (!supForm.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, suppliers: [{ id: uid(), ...supForm }, ...data.suppliers] });
    setSupForm({ name: "", cuit: "", phone: "", products: "" });
    setShowSupForm(false); showToast("Proveedor agregado");
  };

  return (
    <div>
      <PageHeader title="Compras y Proveedores" subtitle={`${data.purchases.length} compras · ${data.suppliers.length} proveedores`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Compras", "Proveedores"]} value={tab} onChange={setTab} /></div>

      {tab === "Compras" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowPurchForm(!showPurchForm)}>{showPurchForm ? "Cancelar" : "+ Nueva compra"}</Btn></div>
          {showPurchForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Proveedor"><Select value={purchForm.supplier} onChange={(e) => setPurchForm({ ...purchForm, supplier: e.target.value })}><option value="">-</option>{data.suppliers.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
                <Field label="Producto"><Select value={purchForm.product} onChange={(e) => setPurchForm({ ...purchForm, product: e.target.value })}><option value="">-</option>{data.ingredients.map((i) => <option key={i.id}>{i.name}</option>)}</Select></Field>
                <Field label="Cantidad"><Input type="number" value={purchForm.quantity} onChange={(e) => setPurchForm({ ...purchForm, quantity: e.target.value })} /></Field>
                <Field label="Precio unitario"><Input type="number" value={purchForm.price} onChange={(e) => setPurchForm({ ...purchForm, price: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addPurchase}>Registrar compra</Btn></div>
            </Card>
          )}
          {data.purchases.length === 0 ? <Card><EmptyState text="No hay compras registradas." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.purchases.map((p) => (
                <Card key={p.id}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{p.product}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{p.supplier} · {p.quantity} un. · {fmtDate(p.date)}</div>
                    </div>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(p.total)}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "Proveedores" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowSupForm(!showSupForm)}>{showSupForm ? "Cancelar" : "+ Nuevo proveedor"}</Btn></div>
          {showSupForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Nombre"><Input value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} /></Field>
                <Field label="CUIT"><Input value={supForm.cuit} onChange={(e) => setSupForm({ ...supForm, cuit: e.target.value })} /></Field>
                <Field label="Teléfono"><Input value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} /></Field>
                <Field label="Productos"><Input value={supForm.products} onChange={(e) => setSupForm({ ...supForm, products: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addSupplier}>Guardar proveedor</Btn></div>
            </Card>
          )}
          {data.suppliers.length === 0 ? <Card><EmptyState text="No hay proveedores cargados." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.suppliers.map((s) => (
                <Card key={s.id}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{s.name}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{s.phone} · compras: {data.purchases.filter((p) => p.supplier === s.name).length}</div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== PROMOCIONES ====================
function Promotions({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: PROMO_TYPES[0], discount: "", startDate: todayStr(), endDate: todayStr(), days: "", schedule: "" });

  const addPromo = () => {
    if (!form.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, promotions: [{ id: uid(), ...form }, ...data.promotions] });
    setForm({ name: "", type: PROMO_TYPES[0], discount: "", startDate: todayStr(), endDate: todayStr(), days: "", schedule: "" });
    setShowForm(false); showToast("Promoción creada");
  };
  const removePromo = (id) => persist({ ...data, promotions: data.promotions.filter((p) => p.id !== id) });

  return (
    <div>
      <PageHeader title="Promociones y Combos" subtitle={`${data.promotions.length} promociones`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva promoción"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Happy Hour Cerveza" /></Field>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{PROMO_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Descuento (%)"><Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
            <Field label="Días"><Input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} placeholder="Lun-Vie" /></Field>
            <Field label="Horario"><Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="18:00-20:00" /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addPromo}>Guardar promoción</Btn></div>
        </Card>
      )}
      {data.promotions.length === 0 ? <Card><EmptyState text="No hay promociones activas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.promotions.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{p.name}</div>
                    <Badge tone="green">{p.type}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.days} · {p.schedule} · {p.discount}% off</div>
                </div>
                <Btn variant="danger" onClick={() => removePromo(p.id)}>Eliminar</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== EMPLEADOS Y TURNOS ====================
function Employees({ data, persist, showToast }) {
  const [tab, setTab] = useState("Empleados");
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [empForm, setEmpForm] = useState({ name: "", dni: "", phone: "", role: EMPLOYEE_ROLES[0], entryDate: todayStr(), status: "Activo" });
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [shiftForm, setShiftForm] = useState({ employeeName: "", date: todayStr(), start: "12:00", end: "20:00" });

  const addEmployee = () => {
    if (!empForm.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, employees: [{ id: uid(), ...empForm }, ...data.employees] });
    setEmpForm({ name: "", dni: "", phone: "", role: EMPLOYEE_ROLES[0], entryDate: todayStr(), status: "Activo" });
    setShowEmpForm(false); showToast("Empleado agregado");
  };
  const removeEmployee = (id) => persist({ ...data, employees: data.employees.filter((e) => e.id !== id) });
  const addShift = () => {
    if (!shiftForm.employeeName) { showToast("Completá el empleado"); return; }
    persist({ ...data, shifts: [{ id: uid(), ...shiftForm }, ...data.shifts] });
    setShiftForm({ employeeName: "", date: todayStr(), start: "12:00", end: "20:00" });
    setShowShiftForm(false); showToast("Turno creado");
  };
  const removeShift = (id) => persist({ ...data, shifts: data.shifts.filter((s) => s.id !== id) });

  return (
    <div>
      <PageHeader title="Empleados y Turnos" subtitle={`${data.employees.length} empleados · ${data.shifts.length} turnos`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Empleados", "Turnos"]} value={tab} onChange={setTab} /></div>

      {tab === "Empleados" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowEmpForm(!showEmpForm)}>{showEmpForm ? "Cancelar" : "+ Nuevo empleado"}</Btn></div>
          {showEmpForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Nombre"><Input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} /></Field>
                <Field label="DNI"><Input value={empForm.dni} onChange={(e) => setEmpForm({ ...empForm, dni: e.target.value })} /></Field>
                <Field label="Teléfono"><Input value={empForm.phone} onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })} /></Field>
                <Field label="Puesto"><Select value={empForm.role} onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}>{EMPLOYEE_ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addEmployee}>Guardar empleado</Btn></div>
            </Card>
          )}
          {data.employees.length === 0 ? <Card><EmptyState text="No hay empleados cargados." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.employees.map((e) => (
                <Card key={e.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{e.name}</div>
                        <Badge tone="gray">{e.role}</Badge>
                      </div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{e.phone}</div>
                    </div>
                    <Btn variant="danger" onClick={() => removeEmployee(e.id)}>Eliminar</Btn>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "Turnos" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowShiftForm(!showShiftForm)}>{showShiftForm ? "Cancelar" : "+ Nuevo turno"}</Btn></div>
          {showShiftForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Empleado"><Select value={shiftForm.employeeName} onChange={(e) => setShiftForm({ ...shiftForm, employeeName: e.target.value })}><option value="">-</option>{data.employees.map((e) => <option key={e.id}>{e.name}</option>)}</Select></Field>
                <Field label="Fecha"><Input type="date" value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} /></Field>
                <Field label="Entrada"><Input type="time" value={shiftForm.start} onChange={(e) => setShiftForm({ ...shiftForm, start: e.target.value })} /></Field>
                <Field label="Salida"><Input type="time" value={shiftForm.end} onChange={(e) => setShiftForm({ ...shiftForm, end: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addShift}>Guardar turno</Btn></div>
            </Card>
          )}
          {data.shifts.length === 0 ? <Card><EmptyState text="No hay turnos cargados." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.shifts.map((s) => (
                <Card key={s.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{s.employeeName}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{fmtDate(s.date)} · {s.start} - {s.end}</div>
                    </div>
                    <Btn variant="danger" onClick={() => removeShift(s.id)}>Eliminar</Btn>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== COMUNICACIÓN ====================
const MESSAGE_TEMPLATES = [
  { title: "Confirmación de reserva", text: "Hola {{nombre}}, confirmamos tu reserva. ¡Te esperamos!" },
  { title: "Recordatorio de reserva", text: "Hola {{nombre}}, te recordamos tu reserva de hoy. ¡Nos vemos pronto!" },
  { title: "Promoción", text: "Hola {{nombre}}, tenemos una promo especial para vos esta semana. ¡Pasate a conocerla!" },
  { title: "Mensaje personalizado", text: "Hola {{nombre}}, " },
];

function Communication({ data }) {
  const [segment, setSegment] = useState("Todos");
  const [templateIdx, setTemplateIdx] = useState(0);
  const segments = ["Todos", ...CUSTOMER_SEGMENTS];
  const recipients = segment === "Todos" ? data.customers : data.customers.filter((c) => c.segment === segment);

  return (
    <div>
      <PageHeader title="Comunicación" subtitle="Plantillas y envío individual por WhatsApp" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: GRAY, marginBottom: 10 }}>El envío masivo automático requiere WhatsApp Business API (a conectar). Cada mensaje se abre individualmente.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Segmento"><Select value={segment} onChange={(e) => setSegment(e.target.value)}>{segments.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Plantilla"><Select value={templateIdx} onChange={(e) => setTemplateIdx(Number(e.target.value))}>{MESSAGE_TEMPLATES.map((t, i) => <option key={t.title} value={i}>{t.title}</option>)}</Select></Field>
        </div>
        <div style={{ marginTop: 10, fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE, background: CARD2, padding: 12, borderRadius: 8 }}>{MESSAGE_TEMPLATES[templateIdx].text}</div>
      </Card>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Destinatarios ({recipients.length})</div>
      {recipients.length === 0 ? <Card><EmptyState text="No hay destinatarios." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recipients.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>{c.name} {c.lastName}</span>
                <Btn variant="secondary" href={waLink(c.whatsapp || c.phone, MESSAGE_TEMPLATES[templateIdx].text.replace("{{nombre}}", c.name))}>Enviar WhatsApp</Btn>
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
  const totalSales = data.cash.filter((c) => c.type === "Ingreso").reduce((s, c) => s + Number(c.amount), 0);
  const totalExpenses = data.cash.filter((c) => c.type === "Egreso").reduce((s, c) => s + Number(c.amount), 0);
  const productSales = {};
  data.orders.forEach((o) => (o.items || []).forEach((it) => { productSales[it.productName] = (productSales[it.productName] || 0) + it.qty; }));
  const sortedProducts = Object.entries(productSales).sort((a, b) => b[1] - a[1]);
  const topProducts = sortedProducts.slice(0, 5);

  const marginByProduct = data.products.map((p) => ({ name: p.name, margin: Number(p.price) - Number(p.cost || 0), marginPct: p.price ? Math.round(((Number(p.price) - Number(p.cost || 0)) / Number(p.price)) * 100) : 0 })).sort((a, b) => b.marginPct - a.marginPct).slice(0, 5);

  const exportSales = () => downloadCSV("ventas.csv", data.cash.filter((c) => c.type === "Ingreso").map((c) => ({ concepto: c.concept, monto: c.amount, metodo: c.method, fecha: c.date })));
  const exportExpenses = () => downloadCSV("gastos.csv", data.expenses.map((e) => ({ concepto: e.concept, categoria: e.category, monto: e.amount, fecha: e.date })));

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Estadísticas generales" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Ventas totales" value={fmtMoney(totalSales)} tone="good" />
        <MiniStat label="Gastos totales" value={fmtMoney(totalExpenses)} />
        <MiniStat label="Ganancia estimada" value={fmtMoney(totalSales - totalExpenses)} tone="good" />
        <MiniStat label="Reservas" value={data.reservations.length} />
      </div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Productos más vendidos</div>
          {topProducts.length === 0 ? <EmptyState text="Sin datos." /> : topProducts.map(([n, q]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0" }}><span style={{ color: OFFWHITE }}>{n}</span><span style={{ color: GREEN }}>{q}</span></div>
          ))}
        </Card>
        <Card>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Mejor margen</div>
          {marginByProduct.length === 0 ? <EmptyState text="Sin datos." /> : marginByProduct.map((p) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0" }}><span style={{ color: OFFWHITE }}>{p.name}</span><span style={{ color: GREEN }}>{p.marginPct}%</span></div>
          ))}
        </Card>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={exportSales}>Exportar ventas (CSV)</Btn>
        <Btn variant="secondary" onClick={exportExpenses}>Exportar gastos (CSV)</Btn>
      </div>
    </div>
  );
}

// ==================== CONFIGURACIÓN ====================
function Config({ data, persist, showToast }) {
  const [name, setName] = useState(data.config?.name || "");
  const [tipSuggestion, setTipSuggestion] = useState(data.config?.tipSuggestion || "10");

  const saveConfig = () => { persist({ ...data, config: { ...data.config, name, tipSuggestion } }); showToast("Configuración guardada"); };

  const roles = [
    { name: "Administrador", desc: "Acceso total al sistema." },
    { name: "Encargado", desc: "Ventas, cocina, stock, caja y reportes." },
    { name: "Cajero", desc: "Caja y cobros." },
    { name: "Mozo", desc: "Mesas, pedidos y clientes." },
    { name: "Cocina", desc: "Pedidos y preparación." },
    { name: "Repartidor", desc: "Delivery asignado." },
  ];

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos del restaurante, roles y automatizaciones" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Datos del restaurante</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del restaurante" style={{ flex: 1 }} />
          <Input type="number" value={tipSuggestion} onChange={(e) => setTipSuggestion(e.target.value)} placeholder="Propina sugerida %" style={{ width: 180 }} />
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
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 8 }}>Automatizaciones (n8n + WhatsApp Business API + Mercado Pago)</div>
        <div style={{ fontSize: 12.5, color: GRAY, fontFamily: "Inter", marginBottom: 10 }}>Requieren backend real — no están activas en este prototipo.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Reserva creada → confirmación", "Reserva próxima → recordatorio", "Pedido recibido → notificar cocina", "Pedido listo → notificar mozo", "Stock bajo → alertar encargado", "Cliente inactivo → promoción", "Cierre de caja → reporte", "Producto sin stock → ocultar del menú", "Compra confirmada → actualizar inventario"].map((a) => (
            <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", color: OFFWHITE, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span>{a}</span><Badge tone="gray">A conectar</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
