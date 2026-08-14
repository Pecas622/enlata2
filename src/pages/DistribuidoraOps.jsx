import React, { useState, useEffect, useCallback } from "react";
import { FONT_IMPORT, CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "../lib/theme.js";
import { uid, todayStr, addDays, daysBetween, fmtDate } from "../lib/utils.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips } from "../lib/ui.jsx";

const STORAGE_KEY = "distribuidoraops-full-data";

const ROLES = ["Administrador", "Gerente", "Vendedor", "Depósito", "Repartidor", "Administración"];
const CLIENT_TYPES = ["Kiosco", "Almacén", "Supermercado", "Restaurante", "Bar", "Hotel", "Mayorista", "Comercio", "Empresa", "Otro"];
const CLIENT_STATUSES = ["Activo", "Inactivo", "Moroso", "Suspendido"];
const PAYMENT_TERMS = ["Contado", "7 días", "15 días", "30 días"];
const TERM_DAYS = { "Contado": 0, "7 días": 7, "15 días": 15, "30 días": 30 };
const PRODUCT_STATUSES = ["Disponible", "Sin stock", "Inactivo"];
const ORDER_STAGES = ["Nuevo", "Confirmado", "Preparando", "Listo", "En reparto", "Entregado"];
const PAYMENT_STATUSES = ["Pendiente", "Parcial", "Pagado"];
const DELIVERY_STATUSES = ["Pendiente", "Preparado", "En reparto", "Entregado", "No entregado", "Reprogramado"];
const RETURN_REASONS = ["Producto dañado", "Error de pedido", "Producto vencido", "Faltante", "Otro"];
const RETURN_STATUSES = ["Pendiente", "Aprobada", "Rechazada", "Completada"];
const MOVEMENT_TYPES = ["Ingreso", "Egreso", "Ajuste", "Transferencia", "Devolución", "Merma"];
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Cheque", "Tarjeta", "Mercado Pago", "Otro"];
const EXPENSE_CATEGORIES = ["Combustible", "Vehículos", "Sueldos", "Alquiler", "Servicios", "Publicidad", "Mantenimiento", "Administración", "Otros"];
const PROMO_TYPES = ["Descuento %", "Descuento fijo", "2x1", "Bonificación por cantidad", "Precio especial", "Combo"];
const ZONES = ["Zona Norte", "Zona Sur", "Zona Este", "Zona Oeste", "Centro"];
const VEHICLE_STATUSES = ["Disponible", "En ruta", "En taller"];

const EMPTY_DATA = {
  clients: [], products: [], categories: [], priceLists: [], orders: [], warehouses: [],
  stockMovements: [], deliveries: [], returns: [], purchases: [], suppliers: [], sellers: [],
  cash: [], vehicles: [], promotions: [], collections: [],
  config: { businessName: "Tu Distribuidora", defaultPriceListId: "" },
};

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
function priceFor(product, priceList) {
  const markup = priceList ? Number(priceList.markupPercent || 0) : 0;
  return Math.round(Number(product.costPrice || 0) * (1 + markup / 100));
}
function clientDebits(clientName, orders) {
  return orders.filter((o) => o.clientName === clientName && o.stage !== "Cancelado").reduce((s, o) => s + Number(o.total || 0), 0);
}
function clientCredits(clientName, collections) {
  return collections.filter((c) => c.clientName === clientName).reduce((s, c) => s + Number(c.amount || 0), 0);
}
function clientBalance(clientName, orders, collections) {
  return clientDebits(clientName, orders) - clientCredits(clientName, collections);
}
function isOverdueClient(client, orders, collections) {
  const balance = clientBalance(client.businessName, orders, collections);
  if (balance <= 0) return false;
  const termDays = TERM_DAYS[client.paymentTerms] ?? 30;
  const unpaidOrders = orders.filter((o) => o.clientName === client.businessName && o.stage !== "Cancelado").sort((a, b) => a.date.localeCompare(b.date));
  if (unpaidOrders.length === 0) return false;
  return daysBetween(unpaidOrders[0].date, todayStr()) > termDays;
}

// ---------- atoms unique to DISTRIBUIDORA OPS ----------
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
function CompareStat({ label, current, previous }) {
  const diff = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);
  const up = diff >= 0;
  return (
    <Card>
      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 19, color: OFFWHITE }}>{fmtMoney(current)}</div>
        <div style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 700, color: up ? GREEN : RED }}>{up ? "▲" : "▼"} {Math.abs(diff)}%</div>
      </div>
      <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginTop: 4 }}>vs. {fmtMoney(previous)}</div>
    </Card>
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
  const categories = ["Bebidas", "Almacén", "Lácteos", "Limpieza", "Snacks", "Perfumería", "Congelados", "Golosinas"].map((name) => ({ id: uid(), name }));
  const brands = ["Coca-Cola", "Pepsi", "Arcor", "Molinos", "Unilever", "P&G", "La Serenísima", "Bagley", "Quilmes", "Villa del Sur"];
  const productNames = ["Gaseosa 2.25L", "Agua saborizada 500ml", "Cerveza lata 473ml", "Fideos 500g", "Arroz 1kg", "Aceite 900ml", "Yogur bebible 1L", "Leche entera 1L", "Detergente 750ml", "Lavandina 1L", "Papas fritas 150g", "Alfajor triple", "Shampoo 400ml", "Desodorante aerosol", "Helado 1L", "Hamburguesas x4", "Chocolate 100g", "Caramelos bolsa", "Café 250g", "Té x25", "Galletitas dulces", "Galletitas saladas", "Mayonesa 500g", "Kétchup 500g", "Harina 1kg", "Azúcar 1kg", "Sal fina 500g", "Papel higiénico x4", "Servilletas x50", "Jabón en polvo 800g"];
  const products = Array.from({ length: 60 }).map((_, i) => {
    const cat = categories[i % categories.length];
    const status = i % 17 === 0 ? "Sin stock" : i % 23 === 0 ? "Inactivo" : "Disponible";
    const stock = status === "Sin stock" ? 0 : 20 + (i * 7) % 180;
    return {
      id: uid(), code: `P${1000 + i}`, barcode: `77901234${String(1000 + i).padStart(4, "0")}`, sku: `SKU-${1000 + i}`,
      name: `${productNames[i % productNames.length]} ${brands[i % brands.length]}`, brand: brands[i % brands.length],
      category: cat.name, unit: "Unidad",
      presentations: [{ id: uid(), name: "Unidad", factor: 1 }, { id: uid(), name: "Pack x6", factor: 6 }, { id: uid(), name: "Caja x24", factor: 24 }],
      costPrice: String(400 + (i * 53) % 3000), iva: "21", stock: String(stock), minStock: "20", maxStock: "300",
      supplierName: `Proveedor ${1 + (i % 8)}`, status,
    };
  });
  const priceLists = [
    { id: uid(), name: "Lista Minorista", markupPercent: "55" },
    { id: uid(), name: "Lista Mayorista", markupPercent: "35" },
    { id: uid(), name: "Lista Distribuidor", markupPercent: "22" },
    { id: uid(), name: "Lista Especial", markupPercent: "15" },
  ];
  const sellers = ["Diego Fernández", "Lucía Torres", "Martín Ruiz", "Ana Paz", "Carlos Ríos"].map((name, i) => ({
    id: uid(), name, phone: `+54 9 261 555 07${i}0`, email: "", zone: ZONES[i % ZONES.length],
    commissionPercent: String(2 + i), goalMonthly: String(3000000 + i * 500000), status: "Activo",
  }));
  const clientNames = ["Almacén Don José", "Kiosco La Esquina", "Super Rápido", "Restaurante El Fogón", "Bar Central", "Hotel Los Andes", "Mayorista Sur SA", "Comercial Pérez", "Kiosco 24hs", "Almacén Norte", "Super Familiar", "Restaurante La Parrilla", "Bar Deportivo", "Kiosco Belgrano", "Almacén San Martín", "Distribuidora Chica", "Comercio Rivadavia", "Super Ahorro", "Kiosco Universitario", "Almacén Progreso"];
  const clients = Array.from({ length: 40 }).map((_, i) => {
    const name = `${clientNames[i % clientNames.length]}${i >= clientNames.length ? " " + (Math.floor(i / clientNames.length) + 1) : ""}`;
    const status = i % 11 === 0 ? "Moroso" : i % 19 === 0 ? "Suspendido" : i % 13 === 0 ? "Inactivo" : "Activo";
    return {
      id: uid(), businessName: name, tradeName: name, cuit: `30-${70000000 + i}-${i % 10}`, dni: "",
      contact: ["Juan", "María", "Carlos", "Ana", "Pedro"][i % 5], phone: `+54 9 261 555 08${i % 10}0`, whatsapp: `+54 9 261 555 08${i % 10}0`,
      email: "", address: `Calle ${100 + i}`, locality: "Mendoza", province: "Mendoza", zone: ZONES[i % ZONES.length],
      sellerName: sellers[i % sellers.length].name, priceListId: priceLists[i % priceLists.length].id,
      paymentTerms: PAYMENT_TERMS[i % PAYMENT_TERMS.length], creditLimit: String(200000 + (i % 6) * 100000),
      type: CLIENT_TYPES[i % CLIENT_TYPES.length], status, notes: "",
      timeline: [{ id: uid(), date: todayStr(), type: "Nota", note: "Cliente cargado desde datos demo" }],
    };
  });
  const warehouses = [
    { id: uid(), name: "Depósito Principal", type: "Central" },
    { id: uid(), name: "Depósito Secundario", type: "Sucursal" },
    { id: uid(), name: "Camión 1", type: "Móvil" },
  ];
  const suppliers = ["Distribuidora Sur", "Alimentos del Valle", "Lácteos Andinos", "Bebidas Cuyo", "Limpieza Total", "Snacks del Oeste", "Perfumería Norte", "Congelados Mendoza"].map((name, i) => ({
    id: uid(), businessName: name, cuit: `30-6${5000000 + i}-${i}`, contact: "Ventas", phone: `+54 9 261 555 09${i}0`, email: "", address: "", paymentTerms: "30 días",
  }));
  const orders = Array.from({ length: 30 }).map((_, i) => {
    const client = clients[i % clients.length];
    const seller = sellers.find((s) => s.name === client.sellerName) || sellers[0];
    const priceList = priceLists.find((pl) => pl.id === client.priceListId);
    const items = Array.from({ length: 2 + (i % 3) }).map((_, k) => {
      const p = products[(i * 3 + k) % products.length];
      const qty = 1 + ((i + k) % 10);
      const unitPrice = priceFor(p, priceList);
      return { id: uid(), productId: p.id, productName: p.name, unit: "Unidad", qty, unitPrice, discountPct: k === 0 ? "0" : "5" };
    });
    const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice * (1 - Number(it.discountPct) / 100), 0);
    const stage = ORDER_STAGES[i % ORDER_STAGES.length];
    const date = addDays(todayStr(), -(i % 20));
    return {
      id: uid(), code: `PED-${2000 + i}`, clientId: client.id, clientName: client.businessName, sellerName: seller.name,
      date, time: "10:00", warehouseName: warehouses[i % warehouses.length].name, items,
      subtotal: Math.round(subtotal), discount: 0, total: Math.round(subtotal),
      paymentMethod: PAYMENT_METHODS[i % PAYMENT_METHODS.length], paymentStatus: i % 3 === 0 ? "Pagado" : i % 3 === 1 ? "Parcial" : "Pendiente",
      stage, notes: "",
    };
  });
  const collections = orders.filter((o) => o.paymentStatus !== "Pendiente").slice(0, 14).map((o) => ({
    id: uid(), clientName: o.clientName, amount: o.paymentStatus === "Pagado" ? o.total : Math.round(o.total * 0.5),
    method: o.paymentMethod, date: o.date, collector: o.sellerName, notes: "",
  }));
  const deliveries = [0, 1, 2].map((i) => ({
    id: uid(), date: addDays(todayStr(), -i), driverName: ["Rodrigo Sosa", "Nahuel Vega", "Braian Ponce"][i], vehiclePlate: ["AB123CD", "AC456DE", "AD789FG"][i],
    zone: ZONES[i % ZONES.length], orderIds: orders.filter((o) => o.stage === "En reparto" || o.stage === "Entregado").slice(i * 3, i * 3 + 3).map((o) => o.id),
    status: i === 0 ? "En reparto" : "Entregado",
  }));
  const returns = Array.from({ length: 4 }).map((_, i) => ({
    id: uid(), clientName: clients[i + 2].businessName, orderCode: orders[i].code, productName: products[i].name,
    qty: 1 + i, reason: RETURN_REASONS[i % RETURN_REASONS.length], status: RETURN_STATUSES[i % RETURN_STATUSES.length], date: addDays(todayStr(), -i),
  }));
  const purchases = Array.from({ length: 12 }).map((_, i) => {
    const supplier = suppliers[i % suppliers.length];
    const items = Array.from({ length: 3 }).map((_, k) => {
      const p = products[(i * 4 + k) % products.length];
      return { productName: p.name, qty: 20 + k * 10, cost: Number(p.costPrice) };
    });
    const total = items.reduce((s, it) => s + it.qty * it.cost, 0);
    return { id: uid(), supplierName: supplier.businessName, date: addDays(todayStr(), -i * 3), items, total, paymentMethod: "Transferencia", paid: i % 3 !== 0 };
  });
  const stockMovements = purchases.slice(0, 6).flatMap((p) => p.items.map((it) => ({
    id: uid(), productName: it.productName, warehouseName: warehouses[0].name, type: "Ingreso", qty: it.qty, date: p.date, notes: `Compra a ${p.supplierName}`,
  })));
  const cash = [
    { id: uid(), type: "Ingreso", concept: "Cobranzas del día", category: "", amount: "850000", method: "Transferencia", date: todayStr() },
    { id: uid(), type: "Egreso", concept: "Combustible flota", category: "Combustible", amount: "120000", method: "Efectivo", date: addDays(todayStr(), -1) },
    { id: uid(), type: "Egreso", concept: "Sueldos administración", category: "Sueldos", amount: "1800000", method: "Transferencia", date: addDays(todayStr(), -3) },
    { id: uid(), type: "Egreso", concept: "Alquiler depósito", category: "Alquiler", amount: "450000", method: "Transferencia", date: addDays(todayStr(), -5) },
  ];
  const vehicles = [
    { id: uid(), plate: "AB123CD", brand: "Fiat", model: "Fiorino", year: "2021", capacity: "650kg", mileage: "48000", driverName: "Rodrigo Sosa", status: "En ruta", vtvDate: addDays(todayStr(), 60), insuranceDate: addDays(todayStr(), 120) },
    { id: uid(), plate: "AC456DE", brand: "Renault", model: "Kangoo", year: "2020", capacity: "700kg", mileage: "62000", driverName: "Nahuel Vega", status: "Disponible", vtvDate: addDays(todayStr(), 20), insuranceDate: addDays(todayStr(), 90) },
    { id: uid(), plate: "AD789FG", brand: "Peugeot", model: "Partner", year: "2019", capacity: "800kg", mileage: "81000", driverName: "Braian Ponce", status: "Disponible", vtvDate: addDays(todayStr(), -5), insuranceDate: addDays(todayStr(), 200) },
    { id: uid(), plate: "AE012HI", brand: "Iveco", model: "Daily", year: "2022", capacity: "2000kg", mileage: "21000", driverName: "", status: "En taller", vtvDate: addDays(todayStr(), 150), insuranceDate: addDays(todayStr(), 300) },
  ];
  const promotions = [
    { id: uid(), name: "10 cajas de gaseosa → 5% off", type: "Descuento %", discountPct: "5", minQty: "10", startDate: todayStr(), endDate: addDays(todayStr(), 30), active: true },
    { id: uid(), name: "2x1 en snacks seleccionados", type: "2x1", discountPct: "50", minQty: "2", startDate: todayStr(), endDate: addDays(todayStr(), 15), active: true },
    { id: uid(), name: "Combo limpieza distribuidor", type: "Combo", discountPct: "12", minQty: "1", startDate: addDays(todayStr(), -10), endDate: addDays(todayStr(), 5), active: true },
  ];
  return {
    clients, products, categories, priceLists, orders, warehouses, stockMovements, deliveries, returns,
    purchases, suppliers, sellers, cash, vehicles, promotions, collections,
    config: { businessName: "Tu Distribuidora", defaultPriceListId: priceLists[0].id },
  };
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
    { id: "dashboard", label: "Dashboard", roles: ROLES },
    { id: "clients", label: "Clientes", roles: ["Administrador", "Gerente", "Vendedor", "Administración"] },
    { id: "products", label: "Productos y Precios", roles: ["Administrador", "Gerente"] },
    { id: "orders", label: "Pedidos", roles: ["Administrador", "Gerente", "Vendedor", "Depósito"] },
    { id: "warehouse", label: "Depósito", roles: ["Administrador", "Gerente", "Depósito"] },
    { id: "deliveries", label: "Repartos", roles: ["Administrador", "Gerente", "Repartidor"] },
    { id: "returns", label: "Devoluciones", roles: ["Administrador", "Gerente", "Depósito"] },
    { id: "accounts", label: "Cuenta Corriente", roles: ["Administrador", "Gerente", "Administración"] },
    { id: "collections", label: "Cobranzas", roles: ["Administrador", "Gerente", "Vendedor", "Administración"] },
    { id: "purchases", label: "Compras y Proveedores", roles: ["Administrador", "Gerente"] },
    { id: "sellers", label: "Vendedores", roles: ["Administrador", "Gerente"] },
    { id: "cash", label: "Caja y Gastos", roles: ["Administrador", "Gerente", "Administración"] },
    { id: "vehicles", label: "Vehículos", roles: ["Administrador", "Gerente"] },
    { id: "promotions", label: "Promociones", roles: ["Administrador", "Gerente"] },
    { id: "communication", label: "Comunicación", roles: ["Administrador", "Gerente", "Vendedor"] },
    { id: "reports", label: "Reportes", roles: ["Administrador", "Gerente"] },
    { id: "config", label: "Configuración", roles: ["Administrador"] },
  ];
  const NAV = ALL_NAV.filter((n) => n.roles.includes(role));
  useEffect(() => { if (!NAV.find((n) => n.id === page)) setPage("dashboard"); }, [role]); // eslint-disable-line

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: "Inter" }}>Cargando DISTRIBUIDORA OPS...</div>;
  }

  return (
    <div style={{ background: CARBON, minHeight: 680, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <style>{FONT_IMPORT}</style>
      <div className="ops-shell" style={{ display: "flex", minHeight: 680 }}>
        <div className="ops-sidebar" style={{ width: 220, background: "#0E0E11", borderRight: `1px solid ${BORDER}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 16px 8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: CARBON }}>06</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>DISTRI<span style={{ color: GREEN }}>OPS</span></div>
          </div>

          <div style={{ padding: "0 8px 14px 8px" }}>
            <div style={{ fontSize: 10.5, color: GRAY, marginBottom: 4, fontFamily: "Inter", textTransform: "uppercase" }}>Ver como</div>
            <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ fontSize: 12, padding: "7px 8px" }}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
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
          {page === "clients" && <Clients data={data} persist={persist} showToast={showToast} />}
          {page === "products" && <Products data={data} persist={persist} showToast={showToast} />}
          {page === "orders" && <Orders data={data} persist={persist} showToast={showToast} />}
          {page === "warehouse" && <Warehouse data={data} persist={persist} showToast={showToast} />}
          {page === "deliveries" && <Deliveries data={data} persist={persist} showToast={showToast} />}
          {page === "returns" && <Returns data={data} persist={persist} showToast={showToast} />}
          {page === "accounts" && <Accounts data={data} />}
          {page === "collections" && <Collections data={data} persist={persist} showToast={showToast} />}
          {page === "purchases" && <Purchases data={data} persist={persist} showToast={showToast} />}
          {page === "sellers" && <Sellers data={data} />}
          {page === "cash" && <Cash data={data} persist={persist} showToast={showToast} />}
          {page === "vehicles" && <Vehicles data={data} persist={persist} showToast={showToast} />}
          {page === "promotions" && <Promotions data={data} persist={persist} showToast={showToast} />}
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
  const thisMonth = todayStr().slice(0, 7);
  const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const yesterday = addDays(todayStr(), -1);

  const activeOrders = data.orders.filter((o) => o.stage !== "Cancelado");
  const salesOn = (dateStr) => activeOrders.filter((o) => o.date === dateStr).reduce((s, o) => s + Number(o.total), 0);
  const salesInMonth = (ym) => activeOrders.filter((o) => (o.date || "").slice(0, 7) === ym).reduce((s, o) => s + Number(o.total), 0);
  const salesToday = salesOn(todayStr());
  const salesYesterday = salesOn(yesterday);
  const salesThisMonth = salesInMonth(thisMonth);
  const salesLastMonth = salesInMonth(lastMonth);

  const thisWeekStart = addDays(todayStr(), -6);
  const lastWeekStart = addDays(todayStr(), -13);
  const lastWeekEnd = addDays(todayStr(), -7);
  const salesThisWeek = activeOrders.filter((o) => o.date >= thisWeekStart && o.date <= todayStr()).reduce((s, o) => s + Number(o.total), 0);
  const salesLastWeek = activeOrders.filter((o) => o.date >= lastWeekStart && o.date <= lastWeekEnd).reduce((s, o) => s + Number(o.total), 0);

  const pedidosPendientes = data.orders.filter((o) => ["Nuevo", "Confirmado", "Preparando", "Listo"].includes(o.stage)).length;
  const pedidosEntregados = data.orders.filter((o) => o.stage === "Entregado").length;
  const pedidosEnReparto = data.orders.filter((o) => o.stage === "En reparto").length;
  const clientesActivos = data.clients.filter((c) => c.status === "Activo").length;
  const clientesMorosos = data.clients.filter((c) => c.status === "Moroso").length;
  const cuentasPorCobrar = data.clients.reduce((s, c) => s + Math.max(0, clientBalance(c.businessName, data.orders, data.collections)), 0);
  const cuentasPorPagar = data.purchases.filter((p) => !p.paid).reduce((s, p) => s + Number(p.total), 0);
  const stockValorizado = data.products.reduce((s, p) => s + Number(p.stock) * Number(p.costPrice || 0), 0);
  const stockBajo = data.products.filter((p) => Number(p.stock) <= Number(p.minStock));
  const comprasDelMes = data.purchases.filter((p) => (p.date || "").slice(0, 7) === thisMonth).reduce((s, p) => s + Number(p.total), 0);
  const gastosDelMes = data.cash.filter((c) => c.type === "Egreso" && (c.date || "").slice(0, 7) === thisMonth).reduce((s, c) => s + Number(c.amount), 0);
  const costoVentasMes = activeOrders.filter((o) => (o.date || "").slice(0, 7) === thisMonth).reduce((s, o) => s + (o.items || []).reduce((a, it) => {
    const p = data.products.find((pr) => pr.id === it.productId);
    return a + (p ? Number(p.costPrice) * it.qty : 0);
  }, 0), 0);
  const gananciaEstimada = salesThisMonth - costoVentasMes - gastosDelMes;
  const cajaActual = data.cash.reduce((s, c) => s + (c.type === "Ingreso" ? Number(c.amount) : -Number(c.amount)), 0);

  const stats = [
    { label: "Pedidos pendientes", value: pedidosPendientes, onClick: () => setPage("orders") },
    { label: "Pedidos entregados", value: pedidosEntregados, onClick: () => setPage("orders") },
    { label: "Pedidos en reparto", value: pedidosEnReparto, onClick: () => setPage("deliveries") },
    { label: "Clientes activos", value: clientesActivos, onClick: () => setPage("clients") },
    { label: "Clientes morosos", value: clientesMorosos, onClick: () => setPage("clients"), tone: clientesMorosos > 0 ? "warn" : undefined },
    { label: "Cuentas por cobrar", value: fmtMoney(cuentasPorCobrar), onClick: () => setPage("accounts"), tone: "warn" },
    { label: "Cuentas por pagar", value: fmtMoney(cuentasPorPagar), onClick: () => setPage("purchases") },
    { label: "Stock valorizado", value: fmtMoney(stockValorizado), onClick: () => setPage("warehouse") },
    { label: "Productos con stock bajo", value: stockBajo.length, onClick: () => setPage("warehouse"), tone: stockBajo.length > 0 ? "bad" : undefined },
    { label: "Compras del mes", value: fmtMoney(comprasDelMes), onClick: () => setPage("purchases") },
    { label: "Gastos del mes", value: fmtMoney(gastosDelMes), onClick: () => setPage("cash") },
    { label: "Ganancia estimada (mes)", value: fmtMoney(gananciaEstimada), onClick: () => setPage("reports"), tone: gananciaEstimada >= 0 ? "good" : "bad" },
    { label: "Caja actual", value: fmtMoney(cajaActual), onClick: () => setPage("cash"), tone: cajaActual >= 0 ? "good" : "bad" },
  ];

  const salesByDay = last7Days().map((d) => ({ label: d.label, value: Math.round(salesOn(d.key) / 1000) }));
  const bySeller = {}; activeOrders.forEach((o) => { bySeller[o.sellerName] = (bySeller[o.sellerName] || 0) + Number(o.total); });
  const salesBySeller = Object.entries(bySeller).map(([label, value]) => ({ label, value: Math.round(value / 1000) }));
  const byZone = {}; activeOrders.forEach((o) => {
    const c = data.clients.find((cl) => cl.businessName === o.clientName);
    if (c) byZone[c.zone] = (byZone[c.zone] || 0) + Number(o.total);
  });
  const salesByZone = Object.entries(byZone).map(([label, value]) => ({ label, value: Math.round(value / 1000) }));
  const itemCounts = {};
  activeOrders.forEach((o) => (o.items || []).forEach((it) => { itemCounts[it.productName] = (itemCounts[it.productName] || 0) + it.qty; }));
  const topProducts = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label: label.length > 14 ? label.slice(0, 14) + "…" : label, value }));
  const collectionsByMonth = last6Months().map((m) => ({ label: m.label, value: Math.round(data.collections.filter((c) => (c.date || "").slice(0, 7) === m.key).reduce((s, c) => s + Number(c.amount), 0) / 1000) }));

  const overdueClients = data.clients.filter((c) => isOverdueClient(c, data.orders, data.collections));
  const delayedOrders = data.orders.filter((o) => !["Entregado", "Cancelado"].includes(o.stage) && daysBetween(o.date, todayStr()) > 2);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Tu distribuidora en tiempo real" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} onClick={s.onClick} style={{ cursor: "pointer" }}><MiniStat label={s.label} value={s.value} tone={s.tone} /></div>
        ))}
      </div>

      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Comparativas</div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        <CompareStat label="Hoy vs. ayer" current={salesToday} previous={salesYesterday} />
        <CompareStat label="Esta semana vs. anterior" current={salesThisWeek} previous={salesLastWeek} />
        <CompareStat label="Este mes vs. anterior" current={salesThisMonth} previous={salesLastMonth} />
      </div>

      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ventas por día (x1000, últimos 7 días)</div><Bars data={salesByDay} /></Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ventas por vendedor (x1000)</div>{salesBySeller.length ? <Bars data={salesBySeller} /> : <EmptyState text="Sin ventas." />}</Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ventas por zona (x1000)</div>{salesByZone.length ? <Bars data={salesByZone} /> : <EmptyState text="Sin ventas." />}</Card>
      </div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Productos más vendidos</div>{topProducts.length ? <Bars data={topProducts} /> : <EmptyState text="Sin pedidos." />}</Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Evolución de cobranzas (x1000) / mes</div><Bars data={collectionsByMonth} /></Card>
      </div>

      {(overdueClients.length > 0 || stockBajo.length > 0 || delayedOrders.length > 0) && (
        <Card style={{ borderColor: "#3A1F1F" }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE, marginBottom: 12 }}>Alertas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {overdueClients.slice(0, 4).map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>{c.businessName} — deuda vencida</span>
                <Badge tone="red">{fmtMoney(clientBalance(c.businessName, data.orders, data.collections))}</Badge>
              </div>
            ))}
            {stockBajo.slice(0, 3).map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>{p.name} — stock bajo</span>
                <Badge tone="amber">{p.stock} un. (mín. {p.minStock})</Badge>
              </div>
            ))}
            {delayedOrders.slice(0, 3).map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>Pedido {o.code} — {o.clientName} demorado</span>
                <Badge tone="red">{o.stage}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ==================== CLIENTES ====================
const emptyClient = { businessName: "", tradeName: "", cuit: "", dni: "", contact: "", phone: "", whatsapp: "", email: "", address: "", locality: "", province: "", zone: ZONES[0], sellerName: "", priceListId: "", paymentTerms: PAYMENT_TERMS[0], creditLimit: "", type: CLIENT_TYPES[0], status: "Activo", notes: "", timeline: [] };

function Clients({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyClient);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [search, setSearch] = useState("");

  const filtered = data.clients.filter((c) =>
    (statusFilter === "Todos" || c.status === statusFilter) &&
    (!search || `${c.businessName} ${c.cuit} ${c.zone}`.toLowerCase().includes(search.toLowerCase()))
  );
  const counts = Object.fromEntries(["Todos", ...CLIENT_STATUSES].map((s) => [s, s === "Todos" ? data.clients.length : data.clients.filter((c) => c.status === s).length]));

  const addClient = () => {
    if (!form.businessName || !form.phone) { showToast("Completá razón social y teléfono"); return; }
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
      <PageHeader title="Clientes" subtitle={`${data.clients.length} clientes`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo cliente"}</Btn>} />
      <Input placeholder="Buscar por razón social, CUIT o zona..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 14 }} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Razón social"><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
            <Field label="Nombre comercial"><Input value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} /></Field>
            <Field label="CUIT"><Input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} placeholder="30-12345678-9" /></Field>
            <Field label="Contacto"><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label="Teléfono/WhatsApp"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value, whatsapp: e.target.value })} placeholder="+54 9 261 555 0100" /></Field>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{CLIENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Zona"><Select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>{ZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
            <Field label="Lista de precios"><Select value={form.priceListId} onChange={(e) => setForm({ ...form, priceListId: e.target.value })}><option value="">-</option>{data.priceLists.map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}</Select></Field>
            <Field label="Condición de pago"><Select value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>{PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Límite de crédito"><Input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></Field>
            <Field label="Vendedor"><Select value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })}><option value="">-</option>{data.sellers.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Estado"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{CLIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addClient}>Guardar cliente</Btn></div>
        </Card>
      )}

      <div style={{ marginBottom: 16 }}><FilterChips options={["Todos", ...CLIENT_STATUSES]} value={statusFilter} onChange={setStatusFilter} counts={counts} /></div>

      {filtered.length === 0 ? <Card><EmptyState text="No hay clientes para mostrar." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c) => {
            const balance = clientBalance(c.businessName, data.orders, data.collections);
            return (
              <Card key={c.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ cursor: "pointer", flex: 1, minWidth: 220 }} onClick={() => setDetail(c)}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{c.businessName}</div>
                      <Badge tone={c.status === "Activo" ? "green" : c.status === "Moroso" ? "red" : "gray"}>{c.status}</Badge>
                      <Badge tone="gray">{c.type}</Badge>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{c.zone} · {c.sellerName || "sin vendedor"} · saldo <span style={{ color: balance > 0 ? RED : GREEN, fontWeight: 600 }}>{fmtMoney(balance)}</span></div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="secondary" href={waLink(c.whatsapp || c.phone, `Hola ${c.contact || ""}, te escribimos de ${data.config?.businessName || "la distribuidora"}.`)}>WhatsApp</Btn>
                    <Btn variant="danger" onClick={() => removeClient(c.id)}>Eliminar</Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {detail && <ClientDetail client={detail} data={data} onClose={() => setDetail(null)} onAddTimeline={(type, note) => { addTimelineEntry(detail.id, type, note); setDetail({ ...detail, timeline: [{ id: uid(), date: todayStr(), type, note }, ...(detail.timeline || [])] }); }} />}
    </div>
  );
}

function ClientDetail({ client, data, onClose, onAddTimeline }) {
  const orders = data.orders.filter((o) => o.clientName === client.businessName);
  const totalComprado = clientDebits(client.businessName, data.orders);
  const balance = clientBalance(client.businessName, data.orders, data.collections);
  const creditAvailable = Number(client.creditLimit || 0) - balance;
  const lastOrder = [...orders].sort((a, b) => b.date.localeCompare(a.date))[0];
  const avgTicket = orders.length ? Math.round(totalComprado / orders.length) : 0;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }} onClick={onClose}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 26, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 19, color: OFFWHITE }}>{client.businessName}</div>
            <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{client.cuit} · {client.zone} · {client.paymentTerms}</div>
          </div>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>
        <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
          <MiniStat label="Total comprado" value={fmtMoney(totalComprado)} />
          <MiniStat label="Deuda actual" value={fmtMoney(balance)} tone={balance > 0 ? "bad" : "good"} />
          <MiniStat label="Crédito disponible" value={fmtMoney(creditAvailable)} tone={creditAvailable < 0 ? "bad" : undefined} />
          <MiniStat label="Ticket promedio" value={fmtMoney(avgTicket)} />
        </div>
        <div style={{ display: "flex", gap: 20, fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 16 }}>
          <span>Última compra: <span style={{ color: OFFWHITE }}>{lastOrder ? fmtDate(lastOrder.date) : "sin compras"}</span></span>
          <span>Pedidos totales: <span style={{ color: OFFWHITE }}>{orders.length}</span></span>
        </div>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Línea de tiempo</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 200, overflowY: "auto" }}>
          {(client.timeline || []).map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 10, fontSize: 12.5, fontFamily: "Inter" }}>
              <span style={{ color: GRAY, minWidth: 70 }}>{fmtDate(t.date)}</span>
              <span style={{ color: GREEN, fontWeight: 600 }}>{t.type}</span>
              <span style={{ color: OFFWHITE }}>{t.note}</span>
            </div>
          ))}
        </div>
        <TimelineAdder onAdd={onAddTimeline} />
      </div>
    </div>
  );
}

function TimelineAdder({ onAdd }) {
  const [type, setType] = useState("Nota"); const [note, setNote] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Select value={type} onChange={(e) => setType(e.target.value)} style={{ flex: 1 }}>
        {["Pedido", "Pago", "Visita", "Nota", "Reclamo"].map((t) => <option key={t}>{t}</option>)}
      </Select>
      <Input placeholder="Detalle..." value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 2 }} />
      <Btn onClick={() => { if (note) { onAdd(type, note); setNote(""); } }}>Agregar</Btn>
    </div>
  );
}

// ==================== PRODUCTOS, CATEGORÍAS Y LISTAS DE PRECIOS ====================
const emptyProduct = { code: "", barcode: "", sku: "", name: "", brand: "", category: "", unit: "Unidad", presentations: [], costPrice: "", iva: "21", stock: "", minStock: "", maxStock: "", supplierName: "", status: "Disponible" };

function Products({ data, persist, showToast }) {
  const [tab, setTab] = useState("Productos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyProduct);
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState("");
  const [showListForm, setShowListForm] = useState(false);
  const [listForm, setListForm] = useState({ name: "", markupPercent: "30" });

  const addProduct = () => {
    if (!form.name || !form.costPrice) { showToast("Completá nombre y costo"); return; }
    persist({ ...data, products: [{ id: uid(), ...form, code: form.code || `P${1000 + data.products.length}` }, ...data.products] });
    setForm(emptyProduct); setShowForm(false); showToast("Producto agregado");
  };
  const removeProduct = (id) => persist({ ...data, products: data.products.filter((p) => p.id !== id) });
  const updateStock = (id, stock) => persist({ ...data, products: data.products.map((p) => p.id === id ? { ...p, stock } : p) });
  const addCategory = () => {
    if (!catName) return;
    persist({ ...data, categories: [...data.categories, { id: uid(), name: catName }] });
    setCatName(""); setShowCatForm(false); showToast("Categoría agregada");
  };
  const addPriceList = () => {
    if (!listForm.name) return;
    persist({ ...data, priceLists: [...data.priceLists, { id: uid(), ...listForm }] });
    setListForm({ name: "", markupPercent: "30" }); setShowListForm(false); showToast("Lista de precios creada");
  };
  const updateMarkup = (id, markupPercent) => persist({ ...data, priceLists: data.priceLists.map((pl) => pl.id === id ? { ...pl, markupPercent } : pl) });
  const removePriceList = (id) => persist({ ...data, priceLists: data.priceLists.filter((pl) => pl.id !== id) });

  const filtered = categoryFilter === "Todas" ? data.products : data.products.filter((p) => p.category === categoryFilter);

  return (
    <div>
      <PageHeader title="Productos y Precios" subtitle={`${data.products.length} productos · ${data.categories.length} categorías · ${data.priceLists.length} listas`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Productos", "Categorías", "Listas de precios"]} value={tab} onChange={setTab} /></div>

      {tab === "Productos" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo producto"}</Btn></div>
          {showForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Marca"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
                <Field label="Categoría"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="">-</option>{data.categories.map((c) => <option key={c.id}>{c.name}</option>)}</Select></Field>
                <Field label="Código de barras"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
                <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Costo"><Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></Field>
                <Field label="IVA %"><Input type="number" value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} /></Field>
                <Field label="Stock"><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
                <Field label="Stock mínimo"><Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></Field>
                <Field label="Stock máximo"><Input type="number" value={form.maxStock} onChange={(e) => setForm({ ...form, maxStock: e.target.value })} /></Field>
                <Field label="Proveedor"><Select value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })}><option value="">-</option>{data.suppliers.map((s) => <option key={s.id}>{s.businessName}</option>)}</Select></Field>
                <Field label="Estado"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{PRODUCT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addProduct}>Guardar producto</Btn></div>
            </Card>
          )}
          <div style={{ marginBottom: 16 }}><FilterChips options={["Todas", ...data.categories.map((c) => c.name)]} value={categoryFilter} onChange={setCategoryFilter} /></div>
          {filtered.length === 0 ? <Card><EmptyState text="No hay productos." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((p) => {
                const low = Number(p.stock) <= Number(p.minStock);
                return (
                  <Card key={p.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{p.name}</div>
                          <Badge tone={p.status === "Disponible" ? "green" : p.status === "Sin stock" ? "red" : "gray"}>{p.status}</Badge>
                          {low && <Badge tone="amber">Stock bajo</Badge>}
                        </div>
                        <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.code} · {p.category} · {p.brand} · costo {fmtMoney(p.costPrice)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Input type="number" value={p.stock} onChange={(e) => updateStock(p.id, e.target.value)} style={{ width: 80 }} />
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
            {data.categories.map((c) => <Badge key={c.id} tone="gray">{c.name} ({data.products.filter((p) => p.category === c.name).length})</Badge>)}
          </div>
        </>
      )}

      {tab === "Listas de precios" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowListForm(!showListForm)}>{showListForm ? "Cancelar" : "+ Nueva lista"}</Btn></div>
          {showListForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Nombre"><Input value={listForm.name} onChange={(e) => setListForm({ ...listForm, name: e.target.value })} placeholder="Lista Mayorista" /></Field>
                <Field label="Margen sobre costo (%)"><Input type="number" value={listForm.markupPercent} onChange={(e) => setListForm({ ...listForm, markupPercent: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addPriceList}>Crear lista</Btn></div>
            </Card>
          )}
          {data.priceLists.length === 0 ? <Card><EmptyState text="No hay listas de precios." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.priceLists.map((pl) => (
                <Card key={pl.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{pl.name}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>
                        {data.clients.filter((c) => c.priceListId === pl.id).length} clientes asignados · ej. producto a {fmtMoney(priceFor(data.products[0] || { costPrice: 0 }, pl))}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Field label="Margen %"><Input type="number" value={pl.markupPercent} onChange={(e) => updateMarkup(pl.id, e.target.value)} style={{ width: 90 }} /></Field>
                      <Btn variant="danger" onClick={() => removePriceList(pl.id)}>Eliminar</Btn>
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

// ==================== PEDIDOS ====================
function Orders({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState("Todas");
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [stageFilter, setStageFilter] = useState("Todos");

  const client = data.clients.find((c) => c.id === clientId);
  const priceList = client ? data.priceLists.find((pl) => pl.id === client.priceListId) : null;
  const catProducts = data.products.filter((p) => p.status === "Disponible" && (category === "Todas" || p.category === category));
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice * (1 - Number(it.discountPct) / 100), 0);
  const currentBalance = client ? clientBalance(client.businessName, data.orders, data.collections) : 0;
  const overLimit = client && currentBalance + subtotal > Number(client.creditLimit || 0);

  const addItem = (product) => {
    if (items.some((it) => it.productId === product.id)) return;
    setItems([...items, { id: uid(), productId: product.id, productName: product.name, unit: product.unit, qty: 1, unitPrice: priceFor(product, priceList), discountPct: "0" }]);
  };
  const changeQty = (id, qty) => setItems(items.map((it) => it.id === id ? { ...it, qty: Math.max(1, qty) } : it));
  const changeDiscount = (id, discountPct) => setItems(items.map((it) => it.id === id ? { ...it, discountPct } : it));
  const removeItem = (id) => setItems(items.filter((it) => it.id !== id));

  const repeatLastOrder = () => {
    if (!client) return;
    const last = [...data.orders].filter((o) => o.clientName === client.businessName).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) { showToast("Este cliente no tiene pedidos anteriores"); return; }
    setItems(last.items.map((it) => ({ ...it, id: uid() })));
    showToast("Pedido anterior cargado — ajustá cantidades y confirmá");
  };

  const confirmOrder = () => {
    if (!client || items.length === 0) { showToast("Elegí un cliente y agregá productos"); return; }
    const order = {
      id: uid(), code: `PED-${2000 + data.orders.length}`, clientId: client.id, clientName: client.businessName, sellerName: client.sellerName,
      date: todayStr(), time: new Date().toTimeString().slice(0, 5), warehouseName: data.warehouses[0]?.name || "",
      items, subtotal: Math.round(subtotal), discount: 0, total: Math.round(subtotal),
      paymentMethod, paymentStatus: "Pendiente", stage: "Nuevo", notes: "",
    };
    persist({ ...data, orders: [order, ...data.orders] });
    setItems([]); setClientId(""); setShowForm(false); showToast("Pedido creado");
  };

  const moveStage = (id, stage) => persist({ ...data, orders: data.orders.map((o) => o.id === id ? { ...o, stage } : o) });
  const cancelOrder = (id) => persist({ ...data, orders: data.orders.map((o) => o.id === id ? { ...o, stage: "Cancelado" } : o) });
  const nextStage = (stage) => ORDER_STAGES[Math.min(ORDER_STAGES.indexOf(stage) + 1, ORDER_STAGES.length - 1)];

  const visibleOrders = stageFilter === "Todos" ? data.orders : data.orders.filter((o) => o.stage === stageFilter);
  const boardStages = stageFilter === "Todos" ? ORDER_STAGES : [stageFilter];

  return (
    <div>
      <PageHeader title="Pedidos" subtitle={`${data.orders.length} pedidos`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo pedido"}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Cliente">
              <Select value={clientId} onChange={(e) => { setClientId(e.target.value); setItems([]); }}>
                <option value="">-</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
              </Select>
            </Field>
            <Field label="Forma de pago"><Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            {client && <div style={{ alignSelf: "flex-end", marginBottom: 8 }}><Btn variant="secondary" onClick={repeatLastOrder}>Repetir último pedido</Btn></div>}
          </div>

          {client && (
            <>
              {overLimit && (
                <div style={{ background: "rgba(255,107,107,0.1)", border: `1px solid ${RED}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontFamily: "Inter", fontSize: 12.5, color: RED }}>
                  ⚠ Este pedido supera el límite de crédito del cliente ({fmtMoney(client.creditLimit)}). Requiere autorización de un Gerente o Administrador.
                </div>
              )}
              <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {["Todas", ...data.categories.map((c) => c.name)].map((cat) => (
                      <div key={cat} onClick={() => setCategory(cat)} style={{ padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontFamily: "Inter", fontWeight: 600, background: category === cat ? GREEN : "transparent", color: category === cat ? CARBON : GRAY, border: `1px solid ${category === cat ? GREEN : BORDER}` }}>{cat}</div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                    {catProducts.map((p) => (
                      <div key={p.id} onClick={() => addItem(p)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: CARD2 }}>
                        <span style={{ fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE }}>{p.name} <span style={{ color: GRAY }}>· stock {p.stock}</span></span>
                        <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12.5, color: GREEN }}>{fmtMoney(priceFor(p, priceList))}</span>
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
                          <span style={{ fontFamily: "Inter", fontSize: 12, color: OFFWHITE }}>{it.productName}</span>
                          <span onClick={() => removeItem(it.id)} style={{ cursor: "pointer", color: RED, fontSize: 11 }}>✕</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <Input type="number" value={it.qty} onChange={(e) => changeQty(it.id, Number(e.target.value))} style={{ width: 60, fontSize: 11.5, padding: "5px 8px" }} />
                          <Input type="number" value={it.discountPct} onChange={(e) => changeDiscount(it.id, e.target.value)} placeholder="Desc. %" style={{ width: 70, fontSize: 11.5, padding: "5px 8px" }} />
                          <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: GREEN, marginLeft: "auto" }}>{fmtMoney(it.qty * it.unitPrice * (1 - Number(it.discountPct) / 100))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: OFFWHITE, borderTop: `1px solid ${BORDER}`, paddingTop: 10, marginBottom: 12 }}>
                    <span>Total</span><span style={{ color: GREEN }}>{fmtMoney(subtotal)}</span>
                  </div>
                  <Btn onClick={confirmOrder} style={{ width: "100%" }}>Confirmar pedido</Btn>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      <div style={{ marginBottom: 16 }}><FilterChips options={["Todos", ...ORDER_STAGES, "Cancelado"]} value={stageFilter} onChange={setStageFilter} /></div>

      <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
        {boardStages.map((stage) => (
          <div key={stage} style={{ minWidth: 220, flex: "none", background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 10 }}>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 11.5, color: GRAY, marginBottom: 10, textTransform: "uppercase" }}>
              {stage} ({visibleOrders.filter((o) => o.stage === stage).length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visibleOrders.filter((o) => o.stage === stage).map((o) => (
                <div key={o.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 12, color: OFFWHITE }}>{o.code} — {o.clientName}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginTop: 2 }}>{o.sellerName} · {fmtDate(o.date)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12, color: GREEN }}>{fmtMoney(o.total)}</span>
                    <Badge tone={o.paymentStatus === "Pagado" ? "green" : o.paymentStatus === "Parcial" ? "amber" : "gray"}>{o.paymentStatus}</Badge>
                  </div>
                  {stage !== "Entregado" && stage !== "Cancelado" && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <Btn onClick={() => moveStage(o.id, nextStage(stage))} style={{ flex: 1, fontSize: 10.5, padding: "4px 8px" }}>Avanzar</Btn>
                      <Btn variant="danger" onClick={() => cancelOrder(o.id)} style={{ fontSize: 10.5, padding: "4px 8px" }}>X</Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== DEPÓSITO (stock, movimientos y preparación) ====================
function Warehouse({ data, persist, showToast }) {
  const [tab, setTab] = useState("Preparación");
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [moveForm, setMoveForm] = useState({ productName: "", warehouseName: data.warehouses[0]?.name || "", type: "Ajuste", qty: "", notes: "" });

  const toPrepare = data.orders.filter((o) => ["Confirmado", "Preparando"].includes(o.stage));

  const addMovement = () => {
    if (!moveForm.productName || !moveForm.qty) { showToast("Completá producto y cantidad"); return; }
    const product = data.products.find((p) => p.name === moveForm.productName);
    const delta = ["Ingreso"].includes(moveForm.type) ? Number(moveForm.qty) : -Number(moveForm.qty);
    persist({
      ...data,
      stockMovements: [{ id: uid(), ...moveForm, date: todayStr() }, ...data.stockMovements],
      products: product ? data.products.map((p) => p.id === product.id ? { ...p, stock: String(Math.max(0, Number(p.stock) + delta)) } : p) : data.products,
    });
    setMoveForm({ productName: "", warehouseName: data.warehouses[0]?.name || "", type: "Ajuste", qty: "", notes: "" });
    setShowMoveForm(false); showToast("Movimiento registrado");
  };
  const moveOrderStage = (id, stage) => persist({ ...data, orders: data.orders.map((o) => o.id === id ? { ...o, stage } : o) });

  const lowStock = data.products.filter((p) => Number(p.stock) <= Number(p.minStock));
  const stockValue = data.products.reduce((s, p) => s + Number(p.stock) * Number(p.costPrice || 0), 0);

  return (
    <div>
      <PageHeader title="Depósito" subtitle={`${data.warehouses.length} depósitos · stock valorizado ${fmtMoney(stockValue)}`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Preparación", "Stock", "Movimientos", "Depósitos"]} value={tab} onChange={setTab} /></div>

      {tab === "Preparación" && (
        toPrepare.length === 0 ? <Card><EmptyState text="No hay pedidos para preparar." /></Card> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {toPrepare.map((o) => (
              <Card key={o.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{o.code} — {o.clientName}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{o.warehouseName}</div>
                  </div>
                  <Badge tone={o.stage === "Preparando" ? "amber" : "gray"}>{o.stage}</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {o.items.map((it) => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "Inter" }}>
                      <span style={{ color: OFFWHITE }}>{it.qty}x {it.productName}</span>
                      <span style={{ color: GRAY }}>{it.unit}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {o.stage === "Confirmado" && <Btn onClick={() => moveOrderStage(o.id, "Preparando")}>Comenzar preparación</Btn>}
                  {o.stage === "Preparando" && <Btn onClick={() => moveOrderStage(o.id, "Listo")}>Marcar listo</Btn>}
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {tab === "Stock" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lowStock.length > 0 && <Card style={{ borderColor: "#3A1F1F", marginBottom: 4 }}><div style={{ fontFamily: "Inter", fontSize: 12.5, color: RED }}>{lowStock.length} productos con stock igual o por debajo del mínimo.</div></Card>}
          {data.products.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{p.name}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>mín. {p.minStock} · máx. {p.maxStock}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: Number(p.stock) <= Number(p.minStock) ? RED : OFFWHITE }}>{p.stock} un.</span>
                  <span style={{ fontFamily: "Inter", fontSize: 12, color: GRAY }}>{fmtMoney(Number(p.stock) * Number(p.costPrice || 0))}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "Movimientos" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowMoveForm(!showMoveForm)}>{showMoveForm ? "Cancelar" : "+ Nuevo movimiento"}</Btn></div>
          {showMoveForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Producto"><Select value={moveForm.productName} onChange={(e) => setMoveForm({ ...moveForm, productName: e.target.value })}><option value="">-</option>{data.products.map((p) => <option key={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Depósito"><Select value={moveForm.warehouseName} onChange={(e) => setMoveForm({ ...moveForm, warehouseName: e.target.value })}>{data.warehouses.map((w) => <option key={w.id}>{w.name}</option>)}</Select></Field>
                <Field label="Tipo"><Select value={moveForm.type} onChange={(e) => setMoveForm({ ...moveForm, type: e.target.value })}>{MOVEMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
                <Field label="Cantidad"><Input type="number" value={moveForm.qty} onChange={(e) => setMoveForm({ ...moveForm, qty: e.target.value })} /></Field>
                <Field label="Notas"><Input value={moveForm.notes} onChange={(e) => setMoveForm({ ...moveForm, notes: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addMovement}>Registrar movimiento</Btn></div>
            </Card>
          )}
          {data.stockMovements.length === 0 ? <Card><EmptyState text="No hay movimientos registrados." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.stockMovements.map((m) => (
                <Card key={m.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{m.productName}</div>
                        <Badge tone={m.type === "Ingreso" ? "green" : m.type === "Egreso" || m.type === "Merma" ? "red" : "gray"}>{m.type}</Badge>
                      </div>
                      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{m.warehouseName} · {fmtDate(m.date)}{m.notes ? " · " + m.notes : ""}</div>
                    </div>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{m.qty} un.</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "Depósitos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.warehouses.map((w) => (
            <Card key={w.id}>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{w.name}</div>
              <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{w.type} · {data.orders.filter((o) => o.warehouseName === w.name).length} pedidos asociados</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== REPARTOS Y RUTAS ====================
function Deliveries({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), driverName: "", vehiclePlate: "", zone: ZONES[0], orderIds: [], status: "Pendiente" });

  const readyOrders = data.orders.filter((o) => o.stage === "Listo");

  const toggleOrder = (id) => setForm({ ...form, orderIds: form.orderIds.includes(id) ? form.orderIds.filter((x) => x !== id) : [...form.orderIds, id] });

  const addDelivery = () => {
    if (!form.driverName || form.orderIds.length === 0) { showToast("Elegí repartidor y al menos un pedido"); return; }
    persist({
      ...data,
      deliveries: [{ id: uid(), ...form }, ...data.deliveries],
      orders: data.orders.map((o) => form.orderIds.includes(o.id) ? { ...o, stage: "En reparto" } : o),
    });
    setForm({ date: todayStr(), driverName: "", vehiclePlate: "", zone: ZONES[0], orderIds: [], status: "Pendiente" });
    setShowForm(false); showToast("Reparto creado");
  };

  const advanceDelivery = (d) => {
    const nextStatus = d.status === "Pendiente" ? "En reparto" : "Entregado";
    persist({
      ...data,
      deliveries: data.deliveries.map((x) => x.id === d.id ? { ...x, status: nextStatus } : x),
      orders: nextStatus === "Entregado" ? data.orders.map((o) => d.orderIds.includes(o.id) ? { ...o, stage: "Entregado" } : o) : data.orders,
    });
  };
  const removeDelivery = (id) => persist({ ...data, deliveries: data.deliveries.filter((d) => d.id !== id) });

  return (
    <div>
      <PageHeader title="Repartos y Rutas" subtitle={`${data.deliveries.length} repartos`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo reparto"}</Btn>} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Repartidor"><Input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} /></Field>
            <Field label="Vehículo"><Select value={form.vehiclePlate} onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}><option value="">-</option>{data.vehicles.map((v) => <option key={v.id} value={v.plate}>{v.plate} ({v.model})</option>)}</Select></Field>
            <Field label="Zona"><Select value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>{ZONES.map((z) => <option key={z}>{z}</option>)}</Select></Field>
          </div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 8 }}>Pedidos listos para asignar</div>
          {readyOrders.length === 0 ? <EmptyState text="No hay pedidos en estado 'Listo'." /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {readyOrders.map((o) => (
                <div key={o.id} onClick={() => toggleOrder(o.id)} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: form.orderIds.includes(o.id) ? "rgba(184,255,61,0.1)" : CARD2, border: `1px solid ${form.orderIds.includes(o.id) ? GREEN : BORDER}` }}>
                  <span style={{ fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE }}>{o.code} — {o.clientName}</span>
                  <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12.5, color: GREEN }}>{fmtMoney(o.total)}</span>
                </div>
              ))}
            </div>
          )}
          <Btn onClick={addDelivery}>Crear reparto</Btn>
        </Card>
      )}

      {data.deliveries.length === 0 ? <Card><EmptyState text="No hay repartos creados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.deliveries.map((d) => (
            <Card key={d.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{d.driverName}</div>
                    <Badge tone={d.status === "Entregado" ? "green" : d.status === "En reparto" ? "amber" : "gray"}>{d.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{d.vehiclePlate} · {d.zone} · {fmtDate(d.date)} · {d.orderIds.length} pedidos</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {d.status !== "Entregado" && <Btn onClick={() => advanceDelivery(d)}>Avanzar</Btn>}
                  <Btn variant="danger" onClick={() => removeDelivery(d.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== DEVOLUCIONES ====================
function Returns({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", orderCode: "", productName: "", qty: "1", reason: RETURN_REASONS[0], status: "Pendiente" });

  const addReturn = () => {
    if (!form.clientName || !form.productName) { showToast("Completá cliente y producto"); return; }
    persist({ ...data, returns: [{ id: uid(), ...form, date: todayStr() }, ...data.returns] });
    setForm({ clientName: "", orderCode: "", productName: "", qty: "1", reason: RETURN_REASONS[0], status: "Pendiente" });
    setShowForm(false); showToast("Devolución registrada");
  };
  const updateStatus = (id, status) => {
    const ret = data.returns.find((r) => r.id === id);
    const product = data.products.find((p) => p.name === ret.productName);
    const stockBack = status === "Completada" && ret.status !== "Completada" && product;
    persist({
      ...data,
      returns: data.returns.map((r) => r.id === id ? { ...r, status } : r),
      products: stockBack ? data.products.map((p) => p.id === product.id ? { ...p, stock: String(Number(p.stock) + Number(ret.qty)) } : p) : data.products,
    });
  };
  const removeReturn = (id) => persist({ ...data, returns: data.returns.filter((r) => r.id !== id) });

  return (
    <div>
      <PageHeader title="Devoluciones" subtitle={`${data.returns.length} devoluciones`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva devolución"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente"><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} list="cli-ret" /></Field>
            <datalist id="cli-ret">{data.clients.map((c) => <option key={c.id} value={c.businessName} />)}</datalist>
            <Field label="N° de pedido"><Input value={form.orderCode} onChange={(e) => setForm({ ...form, orderCode: e.target.value })} /></Field>
            <Field label="Producto"><Select value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })}><option value="">-</option>{data.products.map((p) => <option key={p.id}>{p.name}</option>)}</Select></Field>
            <Field label="Cantidad"><Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} /></Field>
            <Field label="Motivo"><Select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addReturn}>Registrar devolución</Btn></div>
        </Card>
      )}
      {data.returns.length === 0 ? <Card><EmptyState text="No hay devoluciones registradas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.returns.map((r) => (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{r.productName} x{r.qty}</div>
                    <Badge tone={r.status === "Completada" ? "green" : r.status === "Rechazada" ? "red" : "gray"}>{r.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{r.clientName} · {r.orderCode} · {r.reason} · {fmtDate(r.date)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Select value={r.status} onChange={(e) => updateStatus(r.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{RETURN_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                  <Btn variant="danger" onClick={() => removeReturn(r.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== CUENTA CORRIENTE ====================
function Accounts({ data }) {
  const [clientId, setClientId] = useState("");
  const client = data.clients.find((c) => c.id === clientId);

  const rows = data.clients.map((c) => ({
    client: c, balance: clientBalance(c.businessName, data.orders, data.collections),
    available: Number(c.creditLimit || 0) - clientBalance(c.businessName, data.orders, data.collections),
    overdue: isOverdueClient(c, data.orders, data.collections),
  })).sort((a, b) => b.balance - a.balance);

  const totalDebt = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);
  const totalOverdue = rows.filter((r) => r.overdue).reduce((s, r) => s + Math.max(0, r.balance), 0);

  const movements = client ? [
    ...data.orders.filter((o) => o.clientName === client.businessName && o.stage !== "Cancelado").map((o) => ({ id: o.id, date: o.date, type: "Débito", concept: `Pedido ${o.code}`, amount: o.total })),
    ...data.collections.filter((c) => c.clientName === client.businessName).map((c) => ({ id: c.id, date: c.date, type: "Crédito", concept: `Pago (${c.method})`, amount: -c.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date)) : [];

  return (
    <div>
      <PageHeader title="Cuenta Corriente" subtitle={`Deuda total ${fmtMoney(totalDebt)} · vencida ${fmtMoney(totalOverdue)}`} />
      <Card style={{ marginBottom: 16 }}>
        <Field label="Ver movimientos de un cliente">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Todos los clientes (resumen)</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
          </Select>
        </Field>
      </Card>

      {!client ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.filter((r) => r.balance > 0).map((r) => (
            <Card key={r.client.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{r.client.businessName}</div>
                    {r.overdue && <Badge tone="red">Vencida</Badge>}
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{r.client.paymentTerms} · crédito disponible {fmtMoney(r.available)}</div>
                </div>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: RED }}>{fmtMoney(r.balance)}</div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {movements.length === 0 ? <Card><EmptyState text="Sin movimientos." /></Card> : movements.map((m) => (
            <Card key={m.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{m.concept}</span>
                    <Badge tone={m.type === "Débito" ? "red" : "green"}>{m.type}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{fmtDate(m.date)}</div>
                </div>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: m.amount > 0 ? RED : GREEN }}>{fmtMoney(Math.abs(m.amount))}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== COBRANZAS ====================
function Collections({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ clientName: "", amount: "", method: PAYMENT_METHODS[0], date: todayStr(), collector: "", notes: "" });

  const addCollection = () => {
    if (!form.clientName || !form.amount) { showToast("Completá cliente y monto"); return; }
    persist({ ...data, collections: [{ id: uid(), ...form }, ...data.collections] });
    setForm({ clientName: "", amount: "", method: PAYMENT_METHODS[0], date: todayStr(), collector: "", notes: "" });
    setShowForm(false); showToast("Cobranza registrada");
  };

  const cobradoHoy = data.collections.filter((c) => c.date === todayStr()).reduce((s, c) => s + Number(c.amount), 0);
  const cobradoMes = data.collections.filter((c) => (c.date || "").slice(0, 7) === todayStr().slice(0, 7)).reduce((s, c) => s + Number(c.amount), 0);
  const pendiente = data.clients.reduce((s, c) => s + Math.max(0, clientBalance(c.businessName, data.orders, data.collections)), 0);
  const vencido = data.clients.filter((c) => isOverdueClient(c, data.orders, data.collections)).reduce((s, c) => s + Math.max(0, clientBalance(c.businessName, data.orders, data.collections)), 0);
  const overdueClients = data.clients.filter((c) => isOverdueClient(c, data.orders, data.collections));

  return (
    <div>
      <PageHeader title="Cobranzas" subtitle={`${data.collections.length} cobros registrados`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Registrar cobro"}</Btn>} />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Cobrado hoy" value={fmtMoney(cobradoHoy)} tone="good" />
        <MiniStat label="Cobrado este mes" value={fmtMoney(cobradoMes)} tone="good" />
        <MiniStat label="Pendiente" value={fmtMoney(pendiente)} tone="warn" />
        <MiniStat label="Vencido" value={fmtMoney(vencido)} tone="bad" />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cliente"><Select value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })}><option value="">-</option>{data.clients.map((c) => <option key={c.id}>{c.businessName}</option>)}</Select></Field>
            <Field label="Monto"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Método"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="Cobrador/Vendedor"><Select value={form.collector} onChange={(e) => setForm({ ...form, collector: e.target.value })}><option value="">-</option>{data.sellers.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addCollection}>Registrar cobro</Btn></div>
        </Card>
      )}

      {overdueClients.length > 0 && (
        <Card style={{ marginBottom: 16, borderColor: "#3A1F1F" }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Recordatorios de pago</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdueClients.map((c) => {
              const balance = clientBalance(c.businessName, data.orders, data.collections);
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE }}>{c.businessName} — {fmtMoney(balance)}</span>
                  <Btn variant="secondary" href={waLink(c.whatsapp || c.phone, `Hola ${c.contact || ""}, te recordamos que tenés un saldo pendiente de ${fmtMoney(balance)} con ${data.config?.businessName || "nosotros"}.`)}>Recordar por WhatsApp</Btn>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {data.collections.length === 0 ? <Card><EmptyState text="No hay cobranzas registradas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.collections.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{c.clientName}</div>
                  <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{c.method} · {c.collector || "-"} · {fmtDate(c.date)}</div>
                </div>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: GREEN }}>{fmtMoney(c.amount)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== COMPRAS Y PROVEEDORES ====================
function Purchases({ data, persist, showToast }) {
  const [tab, setTab] = useState("Compras");
  const [showPurchForm, setShowPurchForm] = useState(false);
  const [purchForm, setPurchForm] = useState({ supplierName: "", productName: "", qty: "", cost: "", paid: false });
  const [showSupForm, setShowSupForm] = useState(false);
  const [supForm, setSupForm] = useState({ businessName: "", cuit: "", contact: "", phone: "", email: "", address: "", paymentTerms: "30 días" });

  const addPurchase = () => {
    if (!purchForm.supplierName || !purchForm.productName) { showToast("Completá proveedor y producto"); return; }
    const total = Number(purchForm.qty) * Number(purchForm.cost);
    const product = data.products.find((p) => p.name === purchForm.productName);
    persist({
      ...data,
      purchases: [{ id: uid(), supplierName: purchForm.supplierName, date: todayStr(), items: [{ productName: purchForm.productName, qty: Number(purchForm.qty), cost: Number(purchForm.cost) }], total, paymentMethod: "Transferencia", paid: purchForm.paid }, ...data.purchases],
      products: product ? data.products.map((p) => p.id === product.id ? { ...p, stock: String(Number(p.stock) + Number(purchForm.qty)) } : p) : data.products,
    });
    setPurchForm({ supplierName: "", productName: "", qty: "", cost: "", paid: false });
    setShowPurchForm(false); showToast("Compra registrada — stock actualizado");
  };
  const addSupplier = () => {
    if (!supForm.businessName) { showToast("Completá la razón social"); return; }
    persist({ ...data, suppliers: [{ id: uid(), ...supForm }, ...data.suppliers] });
    setSupForm({ businessName: "", cuit: "", contact: "", phone: "", email: "", address: "", paymentTerms: "30 días" });
    setShowSupForm(false); showToast("Proveedor agregado");
  };
  const togglePaid = (id) => persist({ ...data, purchases: data.purchases.map((p) => p.id === id ? { ...p, paid: !p.paid } : p) });

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
                <Field label="Proveedor"><Select value={purchForm.supplierName} onChange={(e) => setPurchForm({ ...purchForm, supplierName: e.target.value })}><option value="">-</option>{data.suppliers.map((s) => <option key={s.id}>{s.businessName}</option>)}</Select></Field>
                <Field label="Producto"><Select value={purchForm.productName} onChange={(e) => setPurchForm({ ...purchForm, productName: e.target.value })}><option value="">-</option>{data.products.map((p) => <option key={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Cantidad"><Input type="number" value={purchForm.qty} onChange={(e) => setPurchForm({ ...purchForm, qty: e.target.value })} /></Field>
                <Field label="Costo unitario"><Input type="number" value={purchForm.cost} onChange={(e) => setPurchForm({ ...purchForm, cost: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addPurchase}>Registrar compra</Btn></div>
            </Card>
          )}
          {data.purchases.length === 0 ? <Card><EmptyState text="No hay compras registradas." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.purchases.map((p) => (
                <Card key={p.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{p.supplierName}</div>
                        <Badge tone={p.paid ? "green" : "amber"}>{p.paid ? "Pagada" : "A pagar"}</Badge>
                      </div>
                      <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{p.items.map((it) => `${it.qty}x ${it.productName}`).join(", ")} · {fmtDate(p.date)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(p.total)}</div>
                      <Btn variant="secondary" onClick={() => togglePaid(p.id)}>{p.paid ? "Marcar a pagar" : "Marcar pagada"}</Btn>
                    </div>
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
                <Field label="Razón social"><Input value={supForm.businessName} onChange={(e) => setSupForm({ ...supForm, businessName: e.target.value })} /></Field>
                <Field label="CUIT"><Input value={supForm.cuit} onChange={(e) => setSupForm({ ...supForm, cuit: e.target.value })} /></Field>
                <Field label="Contacto"><Input value={supForm.contact} onChange={(e) => setSupForm({ ...supForm, contact: e.target.value })} /></Field>
                <Field label="Teléfono"><Input value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} /></Field>
                <Field label="Condición de pago"><Select value={supForm.paymentTerms} onChange={(e) => setSupForm({ ...supForm, paymentTerms: e.target.value })}>{PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addSupplier}>Guardar proveedor</Btn></div>
            </Card>
          )}
          {data.suppliers.length === 0 ? <Card><EmptyState text="No hay proveedores cargados." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.suppliers.map((s) => {
                const purchases = data.purchases.filter((p) => p.supplierName === s.businessName);
                const debt = purchases.filter((p) => !p.paid).reduce((sum, p) => sum + Number(p.total), 0);
                return (
                  <Card key={s.id}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{s.businessName}</div>
                    <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{s.phone} · {purchases.length} compras · deuda {fmtMoney(debt)}</div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================== VENDEDORES, COMISIONES Y OBJETIVOS ====================
function Sellers({ data }) {
  const thisMonth = todayStr().slice(0, 7);
  const rows = data.sellers.map((s) => {
    const orders = data.orders.filter((o) => o.sellerName === s.name && o.stage !== "Cancelado");
    const ordersMonth = orders.filter((o) => (o.date || "").slice(0, 7) === thisMonth);
    const ventasMes = ordersMonth.reduce((sum, o) => sum + Number(o.total), 0);
    const clientesAsignados = data.clients.filter((c) => c.sellerName === s.name).length;
    const cobranza = data.collections.filter((c) => c.collector === s.name).reduce((sum, c) => sum + Number(c.amount), 0);
    const comision = Math.round(ventasMes * (Number(s.commissionPercent) / 100));
    const avgTicket = ordersMonth.length ? Math.round(ventasMes / ordersMonth.length) : 0;
    const goalPct = Math.min(100, Math.round((ventasMes / Number(s.goalMonthly || 1)) * 100));
    return { seller: s, ventasMes, clientesAsignados, cobranza, comision, avgTicket, goalPct, pedidos: ordersMonth.length };
  });

  return (
    <div>
      <PageHeader title="Vendedores" subtitle={`${data.sellers.length} vendedores`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r) => (
          <Card key={r.seller.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{r.seller.name}</div>
                <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{r.seller.zone} · {r.clientesAsignados} clientes asignados · comisión {r.seller.commissionPercent}%</div>
              </div>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: GREEN }}>{fmtMoney(r.ventasMes)}</div>
            </div>
            <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
              <MiniStat label="Pedidos del mes" value={r.pedidos} />
              <MiniStat label="Ticket promedio" value={fmtMoney(r.avgTicket)} />
              <MiniStat label="Cobranza gestionada" value={fmtMoney(r.cobranza)} />
              <MiniStat label="Comisión estimada" value={fmtMoney(r.comision)} tone="good" />
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
              <span>Objetivo mensual: {fmtMoney(r.seller.goalMonthly)}</span><span style={{ color: GREEN, fontWeight: 700 }}>{r.goalPct}% cumplido</span>
            </div>
            <div style={{ height: 8, background: CARD2, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${r.goalPct}%`, background: GREEN }} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ==================== CAJA Y GASTOS ====================
function Cash({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Ingreso", concept: "", category: EXPENSE_CATEGORIES[0], amount: "", method: "Efectivo", date: todayStr() });

  const balance = data.cash.reduce((s, c) => s + (c.type === "Ingreso" ? Number(c.amount) : -Number(c.amount)), 0);
  const income = data.cash.filter((c) => c.type === "Ingreso").reduce((s, c) => s + Number(c.amount), 0);
  const expense = data.cash.filter((c) => c.type === "Egreso").reduce((s, c) => s + Number(c.amount), 0);

  const addEntry = () => {
    if (!form.concept || !form.amount) { showToast("Completá concepto y monto"); return; }
    persist({ ...data, cash: [{ id: uid(), ...form }, ...data.cash] });
    setForm({ type: "Ingreso", concept: "", category: EXPENSE_CATEGORIES[0], amount: "", method: "Efectivo", date: todayStr() });
    setShowForm(false); showToast("Movimiento registrado");
  };
  const removeEntry = (id) => persist({ ...data, cash: data.cash.filter((c) => c.id !== id) });

  const byCategory = {};
  data.cash.filter((c) => c.type === "Egreso").forEach((c) => { byCategory[c.category || "Otros"] = (byCategory[c.category || "Otros"] || 0) + Number(c.amount); });

  return (
    <div>
      <PageHeader title="Caja y Gastos" subtitle="Ingresos, egresos y gastos operativos" action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo movimiento"}</Btn>} />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Caja actual" value={fmtMoney(balance)} tone={balance >= 0 ? "good" : "bad"} />
        <MiniStat label="Ingresos" value={fmtMoney(income)} />
        <MiniStat label="Egresos" value={fmtMoney(expense)} />
      </div>
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Ingreso</option><option>Egreso</option></Select></Field>
            <Field label="Concepto"><Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} /></Field>
            {form.type === "Egreso" && <Field label="Categoría"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>}
            <Field label="Monto"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Método"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addEntry}>Guardar movimiento</Btn></div>
        </Card>
      )}
      {Object.keys(byCategory).length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Gastos por categoría</div>
          {Object.entries(byCategory).map(([cat, amt]) => (
            <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0" }}>
              <span style={{ color: OFFWHITE }}>{cat}</span><span style={{ color: RED }}>{fmtMoney(amt)}</span>
            </div>
          ))}
        </Card>
      )}
      {data.cash.length === 0 ? <Card><EmptyState text="No hay movimientos de caja." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.cash.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE }}>{c.concept}</div>
                    <Badge tone={c.type === "Ingreso" ? "green" : "red"}>{c.type}</Badge>
                    {c.category && <Badge tone="gray">{c.category}</Badge>}
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 11.5, color: GRAY, marginTop: 4 }}>{fmtDate(c.date)} · {c.method}</div>
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

// ==================== VEHÍCULOS ====================
function Vehicles({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ plate: "", brand: "", model: "", year: "", capacity: "", mileage: "", driverName: "", status: "Disponible", vtvDate: "", insuranceDate: "" });

  const addVehicle = () => {
    if (!form.plate) { showToast("Completá la patente"); return; }
    persist({ ...data, vehicles: [{ id: uid(), ...form }, ...data.vehicles] });
    setForm({ plate: "", brand: "", model: "", year: "", capacity: "", mileage: "", driverName: "", status: "Disponible", vtvDate: "", insuranceDate: "" });
    setShowForm(false); showToast("Vehículo agregado");
  };
  const removeVehicle = (id) => persist({ ...data, vehicles: data.vehicles.filter((v) => v.id !== id) });

  return (
    <div>
      <PageHeader title="Vehículos" subtitle={`${data.vehicles.length} vehículos de reparto`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo vehículo"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Patente"><Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} /></Field>
            <Field label="Marca"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
            <Field label="Modelo"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Capacidad"><Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="700kg" /></Field>
            <Field label="Chofer"><Input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} /></Field>
            <Field label="VTV vence"><Input type="date" value={form.vtvDate} onChange={(e) => setForm({ ...form, vtvDate: e.target.value })} /></Field>
            <Field label="Seguro vence"><Input type="date" value={form.insuranceDate} onChange={(e) => setForm({ ...form, insuranceDate: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addVehicle}>Guardar vehículo</Btn></div>
        </Card>
      )}
      {data.vehicles.length === 0 ? <Card><EmptyState text="No hay vehículos cargados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.vehicles.map((v) => {
            const vtvSoon = v.vtvDate && daysBetween(todayStr(), v.vtvDate) <= 30;
            return (
              <Card key={v.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{v.plate} — {v.brand} {v.model}</div>
                      <Badge tone={v.status === "Disponible" ? "green" : v.status === "En ruta" ? "amber" : "gray"}>{v.status}</Badge>
                      {vtvSoon && <Badge tone="red">VTV próxima a vencer</Badge>}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{v.driverName || "sin chofer"} · {v.capacity} · {v.mileage} km</div>
                  </div>
                  <Btn variant="danger" onClick={() => removeVehicle(v.id)}>Eliminar</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==================== PROMOCIONES ====================
function Promotions({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: PROMO_TYPES[0], discountPct: "", minQty: "1", startDate: todayStr(), endDate: todayStr(), active: true });

  const addPromo = () => {
    if (!form.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, promotions: [{ id: uid(), ...form }, ...data.promotions] });
    setForm({ name: "", type: PROMO_TYPES[0], discountPct: "", minQty: "1", startDate: todayStr(), endDate: todayStr(), active: true });
    setShowForm(false); showToast("Promoción creada");
  };
  const toggleActive = (id) => persist({ ...data, promotions: data.promotions.map((p) => p.id === id ? { ...p, active: !p.active } : p) });
  const removePromo = (id) => persist({ ...data, promotions: data.promotions.filter((p) => p.id !== id) });

  return (
    <div>
      <PageHeader title="Promociones" subtitle={`${data.promotions.length} promociones`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva promoción"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="10 cajas → 5% off" /></Field>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{PROMO_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Descuento (%)"><Input type="number" value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} /></Field>
            <Field label="Cantidad mínima"><Input type="number" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} /></Field>
            <Field label="Desde"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
            <Field label="Hasta"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addPromo}>Guardar promoción</Btn></div>
        </Card>
      )}
      {data.promotions.length === 0 ? <Card><EmptyState text="No hay promociones cargadas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.promotions.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{p.name}</div>
                    <Badge tone={p.active ? "green" : "gray"}>{p.active ? "Activa" : "Pausada"}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.type} · desde cant. {p.minQty} · {fmtDate(p.startDate)} - {fmtDate(p.endDate)}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" onClick={() => toggleActive(p.id)}>{p.active ? "Pausar" : "Activar"}</Btn>
                  <Btn variant="danger" onClick={() => removePromo(p.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== COMUNICACIÓN ====================
const MESSAGE_TEMPLATES = [
  { title: "Recordatorio de pago", text: "Hola {{cliente}}, te recordamos que tenés un saldo pendiente correspondiente a tu cuenta. ¡Gracias!" },
  { title: "Confirmación de pedido", text: "Hola {{cliente}}, confirmamos tu pedido. Te avisamos cuando esté en camino." },
  { title: "Pedido en camino", text: "Hola {{cliente}}, tu pedido salió a reparto. ¡Nos vemos pronto!" },
  { title: "Promoción", text: "Hola {{cliente}}, tenemos una promo especial esta semana. ¿Te interesa que te pase la lista?" },
  { title: "Catálogo y lista de precios", text: "Hola {{cliente}}, te comparto nuestro catálogo y lista de precios actualizada." },
];

function Communication({ data }) {
  const [segment, setSegment] = useState("Todos");
  const [templateIdx, setTemplateIdx] = useState(0);
  const segments = ["Todos", "Morosos", ...ZONES];
  let recipients = data.clients;
  if (segment === "Morosos") recipients = data.clients.filter((c) => c.status === "Moroso");
  else if (ZONES.includes(segment)) recipients = data.clients.filter((c) => c.zone === segment);

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
      {recipients.length === 0 ? <Card><EmptyState text="No hay destinatarios en este segmento." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recipients.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>{c.businessName}</span>
                <Btn variant="secondary" href={waLink(c.whatsapp || c.phone, MESSAGE_TEMPLATES[templateIdx].text.replace("{{cliente}}", c.contact || c.businessName))}>Enviar WhatsApp</Btn>
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
  const activeOrders = data.orders.filter((o) => o.stage !== "Cancelado");
  const totalVentas = activeOrders.reduce((s, o) => s + Number(o.total), 0);
  const totalCosto = activeOrders.reduce((s, o) => s + (o.items || []).reduce((a, it) => {
    const p = data.products.find((pr) => pr.id === it.productId);
    return a + (p ? Number(p.costPrice) * it.qty : 0);
  }, 0), 0);
  const totalGastos = data.cash.filter((c) => c.type === "Egreso").reduce((s, c) => s + Number(c.amount), 0);
  const rentabilidad = totalVentas - totalCosto - totalGastos;

  const productSales = {};
  activeOrders.forEach((o) => (o.items || []).forEach((it) => { productSales[it.productName] = (productSales[it.productName] || 0) + it.qty; }));
  const sortedProducts = Object.entries(productSales).sort((a, b) => b[1] - a[1]);
  const masVendidos = sortedProducts.slice(0, 6);
  const menosVendidos = sortedProducts.slice(-6).reverse();

  const marginByProduct = data.products.map((p) => {
    const bestList = data.priceLists[0];
    const price = priceFor(p, bestList);
    const marginPct = price ? Math.round(((price - Number(p.costPrice || 0)) / price) * 100) : 0;
    return { name: p.name, marginPct };
  }).sort((a, b) => b.marginPct - a.marginPct).slice(0, 6);

  const byClient = {};
  activeOrders.forEach((o) => { byClient[o.clientName] = (byClient[o.clientName] || 0) + Number(o.total); });
  const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const exportOrders = () => downloadCSV("pedidos.csv", data.orders.map((o) => ({ codigo: o.code, cliente: o.clientName, vendedor: o.sellerName, total: o.total, estado: o.stage, fecha: o.date })));
  const exportClients = () => downloadCSV("clientes.csv", data.clients.map((c) => ({ razon_social: c.businessName, cuit: c.cuit, zona: c.zone, vendedor: c.sellerName, estado: c.status })));
  const exportStock = () => downloadCSV("stock.csv", data.products.map((p) => ({ codigo: p.code, nombre: p.name, categoria: p.category, stock: p.stock, costo: p.costPrice, estado: p.status })));

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Estadísticas generales del negocio" />
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Ventas totales" value={fmtMoney(totalVentas)} tone="good" />
        <MiniStat label="Costo de ventas" value={fmtMoney(totalCosto)} />
        <MiniStat label="Gastos totales" value={fmtMoney(totalGastos)} />
        <MiniStat label="Rentabilidad" value={fmtMoney(rentabilidad)} tone={rentabilidad >= 0 ? "good" : "bad"} />
      </div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Productos más vendidos</div>
          {masVendidos.length === 0 ? <EmptyState text="Sin datos." /> : masVendidos.map(([n, q]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0" }}><span style={{ color: OFFWHITE }}>{n}</span><span style={{ color: GREEN }}>{q}</span></div>
          ))}
        </Card>
        <Card>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Productos menos vendidos</div>
          {menosVendidos.length === 0 ? <EmptyState text="Sin datos." /> : menosVendidos.map(([n, q]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0" }}><span style={{ color: OFFWHITE }}>{n}</span><span style={{ color: GRAY }}>{q}</span></div>
          ))}
        </Card>
      </div>
      <div className="rgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Productos con mejor margen</div>
          {marginByProduct.map((p) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0" }}><span style={{ color: OFFWHITE }}>{p.name}</span><span style={{ color: GREEN }}>{p.marginPct}%</span></div>
          ))}
        </Card>
        <Card>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Clientes más rentables</div>
          {topClients.length === 0 ? <EmptyState text="Sin datos." /> : topClients.map(([n, v]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0" }}><span style={{ color: OFFWHITE }}>{n}</span><span style={{ color: GREEN }}>{fmtMoney(v)}</span></div>
          ))}
        </Card>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={exportOrders}>Exportar pedidos (CSV)</Btn>
        <Btn variant="secondary" onClick={exportClients}>Exportar clientes (CSV)</Btn>
        <Btn variant="secondary" onClick={exportStock}>Exportar stock (CSV)</Btn>
      </div>
    </div>
  );
}

// ==================== CONFIGURACIÓN ====================
function Config({ data, persist, showToast }) {
  const [businessName, setBusinessName] = useState(data.config?.businessName || "");

  const saveConfig = () => { persist({ ...data, config: { ...data.config, businessName } }); showToast("Configuración guardada"); };

  const roles = [
    { name: "Administrador", desc: "Acceso total al sistema." },
    { name: "Gerente", desc: "Ventas, stock, compras, caja, reportes y equipo." },
    { name: "Vendedor", desc: "Clientes, pedidos, productos y cobranzas propias." },
    { name: "Depósito", desc: "Stock, picking y preparación de pedidos." },
    { name: "Repartidor", desc: "Rutas y entregas asignadas." },
    { name: "Administración", desc: "Facturación, caja, cuentas corrientes y cobranzas." },
  ];

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos del negocio, depósitos, roles y automatizaciones" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Datos del negocio</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Nombre de la distribuidora" style={{ flex: 1 }} />
          <Btn onClick={saveConfig}>Guardar</Btn>
        </div>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Depósitos</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.warehouses.map((w) => <Badge key={w.id} tone="gray">{w.name} ({w.type})</Badge>)}
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
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 8 }}>Integraciones y automatizaciones (n8n + WhatsApp Business API + AFIP/ARCA)</div>
        <div style={{ fontSize: 12.5, color: GRAY, fontFamily: "Inter", marginBottom: 10 }}>Requieren backend real — no están activas en este prototipo.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Nuevo pedido → avisar depósito", "Pedido listo → avisar reparto", "Pedido entregado → actualizar cliente", "Stock bajo → avisar compras", "Factura vencida → crear tarea de cobranza", "Cliente sin comprar 30 días → crear seguimiento", "Objetivo cercano → avisar vendedor", "Nuevo cliente → asignar vendedor automáticamente", "Facturación electrónica AFIP/ARCA", "Catálogo digital público con pedido online"].map((a) => (
            <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", color: OFFWHITE, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span>{a}</span><Badge tone="gray">A conectar</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
