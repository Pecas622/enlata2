import React, { useState, useEffect, useCallback, useMemo } from "react";

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');";

// Paleta Apple (modo claro): fondo gris perla, tarjetas blancas, texto casi negro y azul de acento
const CARBON = "#F5F5F7";
const CARD = "#FFFFFF";
const CARD2 = "#F5F5F7";
const BORDER = "#D2D2D7";
const OFFWHITE = "#1D1D1F";
const ACCENT = "#0071E3";
const SUCCESS = "#248A3D";
const GRAY = "#6E6E73";
const RED = "#D70015";
const AMBER = "#B25000";
const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Inter, Arial, sans-serif";

const STORAGE_KEY = "appleops-full-data-v1";

// ---------- catálogo y reglas de negocio ----------
const KINDS = ["iPhone", "iPad", "Mac", "Watch", "AirPods"];
const CATALOG = {
  iPhone: ["iPhone 11", "iPhone 12", "iPhone 13", "iPhone 14", "iPhone 14 Pro", "iPhone 15", "iPhone 15 Pro", "iPhone 15 Pro Max", "iPhone 16", "iPhone 16 Pro"],
  iPad: ["iPad 9", "iPad 10", "iPad Air M1", "iPad Pro 11"],
  Mac: ["MacBook Air M1", "MacBook Air M2", "MacBook Pro 14 M3"],
  Watch: ["Watch SE", "Watch Series 9", "Watch Ultra 2"],
  AirPods: ["AirPods 3", "AirPods Pro 2"],
};
const CAPACITIES = { iPhone: [64, 128, 256, 512, 1024], iPad: [64, 128, 256, 512], Mac: [256, 512, 1024], Watch: [0], AirPods: [0] };
const COLORS = ["Negro", "Blanco", "Plata", "Azul", "Rojo", "Verde", "Rosa", "Titanio natural", "Titanio negro", "Dorado"];
const CONDITIONS = ["Nuevo sellado", "Usado A", "Usado B", "Reacondicionado"];
const DEVICE_STATUSES = ["Disponible", "Reservado", "En reparación", "Vendido", "Retirado"];
const ACC_CATEGORIES = ["Fundas", "Vidrios", "Cargadores", "Cables", "Auriculares", "Soportes", "Otros"];
const ROLES = ["Administrador", "Encargado", "Vendedor", "Cajero"];
const METHODS = [
  { id: "Efectivo USD", cur: "USD", cash: true },
  { id: "Efectivo ARS", cur: "ARS", cash: true },
  { id: "Transferencia ARS", cur: "ARS", cash: false },
  { id: "Tarjeta", cur: "ARS", cash: false },
  { id: "Mercado Pago", cur: "ARS", cash: false },
];
const DEFECTS = ["Pantalla dañada", "Tapa trasera rota", "Cámara con falla", "Face ID / Touch ID no funciona", "Botones con falla", "Puerto de carga con falla", "Parlante / micrófono con falla"];
const GRADE_NOTES = { "Usado A": "Sin marcas visibles", "Usado B": "Marcas leves de uso" };

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", roles: ROLES },
  { id: "ventas", label: "Ventas", icon: "ventas", roles: ["Administrador", "Encargado", "Vendedor", "Cajero"] },
  { id: "canje", label: "Plan Canje", icon: "canje", roles: ["Administrador", "Encargado", "Vendedor"] },
  { id: "stock", label: "Stock de equipos", icon: "stock", roles: ["Administrador", "Encargado", "Vendedor"] },
  { id: "ingresos", label: "Ingreso de equipos", icon: "ingresos", roles: ["Administrador", "Encargado"] },
  { id: "accesorios", label: "Accesorios", icon: "accesorios", roles: ["Administrador", "Encargado", "Vendedor", "Cajero"] },
  { id: "catalogo", label: "Catálogo online", icon: "catalogo", roles: ["Administrador", "Encargado"] },
  { id: "clientes", label: "Clientes", icon: "clientes", roles: ["Administrador", "Encargado", "Vendedor", "Cajero"] },
  { id: "caja", label: "Caja", icon: "caja", roles: ["Administrador", "Encargado", "Cajero"] },
  { id: "reportes", label: "Reportes", icon: "reportes", roles: ["Administrador", "Encargado"] },
  { id: "usuarios", label: "Usuarios y roles", icon: "usuarios", roles: ["Administrador"] },
  { id: "config", label: "Configuración", icon: "config", roles: ["Administrador"] },
];

const DEFAULT_CONFIG = {
  storeName: "Tu Local Apple", cuit: "30-00000000-0", address: "Av. San Martín 1234, Mendoza", phone: "+54 9 261 555 0000",
  fx: 1200, targetMargin: 0.12, maxDiscountSeller: 5, warrantyNew: 365, warrantyUsed: 90,
  condMult: { "Usado A": 1, "Usado B": 0.9, Reacondicionado: 0.85 },
  defectCosts: { "Pantalla dañada": 90, "Tapa trasera rota": 35, "Cámara con falla": 45, "Face ID / Touch ID no funciona": 80, "Botones con falla": 25, "Puerto de carga con falla": 30, "Parlante / micrófono con falla": 25 },
  baseValues: [
    { model: "iPhone 11", capacity: 64, value: 170 }, { model: "iPhone 11", capacity: 128, value: 195 },
    { model: "iPhone 12", capacity: 64, value: 240 }, { model: "iPhone 12", capacity: 128, value: 270 },
    { model: "iPhone 13", capacity: 128, value: 370 }, { model: "iPhone 13", capacity: 256, value: 420 },
    { model: "iPhone 14", capacity: 128, value: 470 }, { model: "iPhone 14", capacity: 256, value: 520 },
    { model: "iPhone 14 Pro", capacity: 128, value: 610 }, { model: "iPhone 14 Pro", capacity: 256, value: 660 },
    { model: "iPhone 15", capacity: 128, value: 580 }, { model: "iPhone 15 Pro", capacity: 128, value: 780 },
    { model: "iPhone 15 Pro", capacity: 256, value: 840 }, { model: "iPhone 15 Pro Max", capacity: 256, value: 940 },
    { model: "iPad 9", capacity: 64, value: 180 }, { model: "iPad Air M1", capacity: 64, value: 360 },
    { model: "MacBook Air M1", capacity: 256, value: 520 },
  ],
};

const EMPTY_DATA = {
  config: DEFAULT_CONFIG, users: [], devices: [], accessories: [], clients: [], sales: [], shifts: [], cashMoves: [], ingresos: [], log: [],
};

// ---------- utils ----------
function uid() { return Math.random().toString(36).slice(2, 10); }
function pad2(n) { return String(n).padStart(2, "0"); }
function localDay(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayStr() { return localDay(new Date()); }
function dayOf(iso) { if (!iso) return ""; return String(iso).length <= 10 ? String(iso) : localDay(new Date(iso)); }
function nowISO() { return new Date().toISOString(); }
function addDays(dateStr, days) { const d = new Date(dateStr + "T12:00:00"); d.setDate(d.getDate() + days); return localDay(d); }
function daysSince(dateStr) { return Math.round((new Date(todayStr() + "T12:00:00") - new Date(dayOf(dateStr) + "T12:00:00")) / 86400000); }
function fmtUSD(n) { return (Number(n) || 0).toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }); }
function fmtARS(n) { return (Number(n) || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }); }
function fmtCur(n, cur) { return cur === "USD" ? fmtUSD(n) : fmtARS(n); }
function fmtDate(d) { if (!d) return "-"; try { return new Date(dayOf(d) + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } }
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function fmtDateTime(iso) { return iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : "-"; }
function waLink(phone, text) { return `https://wa.me/${(phone || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(text || "")}`; }
function toUSD(amount, cur, fx) { return cur === "USD" ? Number(amount) || 0 : (Number(amount) || 0) / (fx || 1); }
function methodOf(id) { return METHODS.find((m) => m.id === id) || METHODS[0]; }
function deviceTitle(d) { return `${d.model}${d.capacity ? " " + d.capacity + (d.kind === "iPhone" || d.kind === "iPad" ? "GB" : d.kind === "Mac" ? "GB" : "") : ""}${d.color ? " · " + d.color : ""}`; }
function deviceShort(d) { return `${d.model}${d.capacity ? " " + d.capacity + "GB" : ""}`; }
function validIMEI(s) { return /^\d{15}$/.test(String(s || "").trim()); }
function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function printHTML(title, body) {
  const w = window.open("", "_blank", "width=420,height=700");
  if (!w) return;
  w.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:18px;max-width:380px;margin:0 auto}h1{font-size:16px;margin:0}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}.r{text-align:right}hr{border:0;border-top:1px dashed #999;margin:10px 0}.s{color:#555;font-size:11px}.b{font-weight:bold}</style></head><body>${body}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
}

// ---------- permisos ----------
function permsFor(role) {
  const admin = role === "Administrador", enc = role === "Encargado";
  return {
    seeCost: admin || enc, editPrice: admin || enc, voidSale: admin || enc, overTradeIn: admin || enc,
    editStock: admin || enc, seeAllShifts: admin || enc, manageUsers: admin,
  };
}

// ---------- tasación (plan canje / ingreso) ----------
function appraise(cfg, d) {
  const row = cfg.baseValues.find((r) => r.model === d.model && String(r.capacity) === String(d.capacity));
  if (!d.model) return { ok: false, base: 0, value: 0, lines: [], reason: "Elegí el modelo del equipo." };
  if (d.icloudFree === false) return { ok: false, blocked: true, base: 0, value: 0, lines: [], reason: "Equipo con bloqueo de iCloud o Buscar mi iPhone activo. No se puede tomar." };
  if (d.imeiClean === false) return { ok: false, blocked: true, base: 0, value: 0, lines: [], reason: "IMEI con denuncia o bloqueo. No se puede tomar." };
  if (!row) return { ok: false, base: 0, value: 0, lines: [], reason: "Este modelo no tiene valor de referencia. Cargalo en Configuración o ingresá el valor a mano." };
  const lines = [{ label: `Valor de referencia ${deviceShort(d)}`, amount: row.value }];
  let v = row.value;
  const m = cfg.condMult[d.cond];
  if (m !== undefined && m !== 1) { const adj = Math.round(v * (m - 1)); lines.push({ label: `Condición ${d.cond}`, amount: adj }); v += adj; }
  const bat = Number(d.battery) || 100;
  const pen = bat < 80 ? 0.08 : bat < 90 ? 0.03 : 0;
  if (pen) { const adj = -Math.round(row.value * pen); lines.push({ label: `Batería al ${bat}%`, amount: adj }); v += adj; }
  (d.defects || []).forEach((def) => { const c = cfg.defectCosts[def] || 0; lines.push({ label: def, amount: -c }); v -= c; });
  v = Math.max(0, Math.round(v / 5) * 5);
  return { ok: true, base: row.value, value: v, lines };
}
function suggestedResale(cfg, costUSD) { return Math.max(0, Math.round((Number(costUSD) || 0) * (1 + cfg.targetMargin) / 10) * 10); }

// ---------- lógica pura de datos ----------
function addLog(data, user, action, detail) {
  return { ...data, log: [{ id: uid(), ts: nowISO(), user, action, detail }, ...(data.log || [])].slice(0, 300) };
}
function openShiftOf(data) { return (data.shifts || []).find((s) => s.status === "Abierta") || null; }
function shiftNumber(data) { return "T-" + String((data.shifts || []).length + 1).padStart(3, "0"); }

function cashExpected(data, shift) {
  const moves = data.cashMoves.filter((m) => m.shiftId === shift.id);
  let ars = Number(shift.openingARS) || 0, usd = Number(shift.openingUSD) || 0;
  moves.forEach((m) => {
    if (!methodOf(m.method).cash) return;
    const sign = m.type === "Ingreso" ? 1 : -1;
    if (m.currency === "USD") usd += sign * m.amount; else ars += sign * m.amount;
  });
  return { ars, usd };
}
function shiftBreakdown(data, shift) {
  const moves = data.cashMoves.filter((m) => m.shiftId === shift.id);
  return METHODS.map((m) => {
    const inc = moves.filter((x) => x.method === m.id && x.type === "Ingreso").reduce((a, x) => a + x.amount, 0);
    const out = moves.filter((x) => x.method === m.id && x.type === "Egreso").reduce((a, x) => a + x.amount, 0);
    return { method: m.id, cur: m.cur, inc, out, net: inc - out };
  });
}

function saleTotals(lines, discountPct, fx) {
  const sub = lines.reduce((a, l) => a + toUSD(l.unit * l.qty, l.currency, fx), 0);
  const discount = sub * ((Number(discountPct) || 0) / 100);
  const costs = lines.reduce((a, l) => a + toUSD((l.cost || 0) * l.qty, l.costCurrency || l.currency, fx), 0);
  return { sub, discount, revenue: sub - discount, cost: costs };
}
function paymentsUSD(payments, fx) { return payments.reduce((a, p) => a + toUSD(Number(p.amount) || 0, methodOf(p.method).cur, fx), 0); }

// aplica una venta (con canje opcional) y devuelve el nuevo estado
function applySale(data, input, user) {
  const fx = data.config.fx;
  const shift = openShiftOf(data);
  const number = "V-" + String(data.sales.length + 1).padStart(4, "0");
  const saleId = uid();
  let next = { ...data };
  let tradeInRecord = null;
  let devices = data.devices.map((d) => ({ ...d, history: [...(d.history || [])] }));
  let accessories = data.accessories.map((a) => ({ ...a, moves: [...(a.moves || [])] }));

  input.lines.forEach((l) => {
    if (l.kind === "device") {
      const d = devices.find((x) => x.id === l.refId);
      if (d) { d.status = "Vendido"; d.soldInSaleId = saleId; d.history.push({ date: nowISO(), action: `Vendido en ${number}`, by: user.name }); }
    }
    if (l.kind === "acc") {
      const a = accessories.find((x) => x.id === l.refId);
      if (a) { a.stock = Math.max(0, a.stock - l.qty); a.moves.push({ date: nowISO(), qty: -l.qty, note: `Venta ${number}`, by: user.name }); }
    }
  });

  if (input.tradeIn) {
    const t = input.tradeIn;
    const newDev = {
      id: uid(), kind: t.kind || "iPhone", model: t.model, capacity: t.capacity, color: t.color, condition: t.cond || "Usado B", imei: t.imei,
      battery: t.battery, cost: t.valueUSD, price: t.resaleUSD, status: "Disponible", origin: "Canje", entryDate: todayStr(),
      warrantyDays: data.config.warrantyUsed, notes: [t.defects?.length ? "Defectos: " + t.defects.join(", ") : "", t.note || ""].filter(Boolean).join(" · "),
      history: [{ date: nowISO(), action: `Ingresó por plan canje (${number}) a ${fmtUSD(t.valueUSD)}`, by: user.name }],
    };
    devices.push(newDev);
    tradeInRecord = { ...t, deviceId: newDev.id };
  }

  const totals = saleTotals(input.lines, input.discountPct, fx);
  const tradeInUSD = tradeInRecord ? tradeInRecord.valueUSD : 0;
  const paidUSD = paymentsUSD(input.payments, fx);

  const sale = {
    id: saleId, number, date: nowISO(), shiftId: shift ? shift.id : null, clientId: input.clientId || null, clientName: input.clientName || "Consumidor final",
    clientPhone: input.clientPhone || "", sellerName: input.sellerName, cashierName: user.name, lines: input.lines, discountPct: Number(input.discountPct) || 0,
    tradeIn: tradeInRecord, payments: input.payments, fx, subtotalUSD: totals.sub, discountUSD: totals.discount, totalUSD: totals.revenue,
    tradeInUSD, paidUSD, revenueUSD: totals.revenue, costUSD: totals.cost, status: "Cerrada", invoice: { status: "No emitida" }, notes: input.notes || "",
  };

  const moves = input.payments.filter((p) => Number(p.amount) > 0).map((p) => ({
    id: uid(), shiftId: shift ? shift.id : null, ts: nowISO(), type: "Ingreso", concept: `Venta ${number}`, method: p.method,
    currency: methodOf(p.method).cur, amount: Number(p.amount), ref: saleId, by: user.name,
  }));

  let clients = data.clients;
  if (input.clientName && !input.clientId) {
    const c = { id: uid(), name: input.clientName, phone: input.clientPhone || "", dni: "", email: "", notes: "", createdAt: todayStr() };
    clients = [...clients, c]; sale.clientId = c.id;
  }

  next = { ...next, devices, accessories, sales: [...data.sales, sale], cashMoves: [...data.cashMoves, ...moves], clients };
  next = addLog(next, user.name, "Venta", `${number} · ${fmtUSD(totals.revenue)}${tradeInRecord ? " · con canje " + fmtUSD(tradeInUSD) : ""}`);
  return { data: next, sale };
}

function applyVoidSale(data, saleId, user, reason) {
  const sale = data.sales.find((s) => s.id === saleId);
  if (!sale || sale.status === "Anulada") return data;
  const shift = openShiftOf(data);
  const devices = data.devices.map((d) => {
    if (d.soldInSaleId === saleId) return { ...d, status: "Disponible", soldInSaleId: null, history: [...(d.history || []), { date: nowISO(), action: `Venta ${sale.number} anulada`, by: user.name }] };
    if (sale.tradeIn && d.id === sale.tradeIn.deviceId && d.status === "Disponible") return { ...d, status: "Retirado", history: [...(d.history || []), { date: nowISO(), action: `Canje ${sale.number} anulado: equipo devuelto`, by: user.name }] };
    return d;
  });
  const accessories = data.accessories.map((a) => {
    const lines = sale.lines.filter((l) => l.kind === "acc" && l.refId === a.id);
    if (!lines.length) return a;
    const qty = lines.reduce((x, l) => x + l.qty, 0);
    return { ...a, stock: a.stock + qty, moves: [...(a.moves || []), { date: nowISO(), qty, note: `Anulación ${sale.number}`, by: user.name }] };
  });
  const reversal = sale.payments.filter((p) => Number(p.amount) > 0).map((p) => ({
    id: uid(), shiftId: shift ? shift.id : null, ts: nowISO(), type: "Egreso", concept: `Anulación ${sale.number}`, method: p.method,
    currency: methodOf(p.method).cur, amount: Number(p.amount), ref: saleId, by: user.name,
  }));
  let next = { ...data, devices, accessories, cashMoves: [...data.cashMoves, ...reversal], sales: data.sales.map((s) => (s.id === saleId ? { ...s, status: "Anulada", voidReason: reason, voidedBy: user.name } : s)) };
  return addLog(next, user.name, "Venta anulada", `${sale.number} · ${reason || "sin motivo"}`);
}

function applyIngreso(data, input, user) {
  const shift = openShiftOf(data);
  const dev = {
    id: uid(), kind: input.kind, model: input.model, capacity: input.capacity, color: input.color, condition: input.cond, imei: input.imei,
    battery: input.battery, cost: input.costUSD, price: input.priceUSD, status: "Disponible", origin: input.origin, entryDate: todayStr(),
    warrantyDays: input.cond === "Nuevo sellado" ? data.config.warrantyNew : data.config.warrantyUsed,
    notes: [input.defects?.length ? "Defectos: " + input.defects.join(", ") : "", input.note || ""].filter(Boolean).join(" · "),
    history: [{ date: nowISO(), action: `Ingreso (${input.origin}) a ${fmtUSD(input.costUSD)}`, by: user.name }],
  };
  const number = "I-" + String((data.ingresos || []).length + 1).padStart(4, "0");
  const ing = { id: uid(), number, date: nowISO(), deviceId: dev.id, origin: input.origin, personName: input.personName, personDni: input.personDni, personPhone: input.personPhone, costUSD: input.costUSD, payMethod: input.payMethod, payAmount: input.payAmount, by: user.name, deviceDesc: deviceTitle(dev), imei: dev.imei };
  const moves = [];
  if (input.payAmount > 0) moves.push({ id: uid(), shiftId: shift ? shift.id : null, ts: nowISO(), type: "Egreso", concept: `Compra de equipo ${number} · ${deviceShort(dev)}`, method: input.payMethod, currency: methodOf(input.payMethod).cur, amount: input.payAmount, ref: ing.id, by: user.name });
  let next = { ...data, devices: [...data.devices, dev], ingresos: [...(data.ingresos || []), ing], cashMoves: [...data.cashMoves, ...moves] };
  return { data: addLog(next, user.name, "Ingreso de equipo", `${number} · ${deviceShort(dev)} a ${fmtUSD(input.costUSD)}`), ingreso: ing };
}

// ---------- átomos de UI ----------
function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#E8E8ED", color: OFFWHITE }, green: { bg: "rgba(36,138,61,0.12)", color: SUCCESS }, gray: { bg: "rgba(110,110,115,0.12)", color: GRAY },
    red: { bg: "rgba(215,0,21,0.10)", color: RED }, amber: { bg: "rgba(178,80,0,0.12)", color: AMBER },
  };
  const t = tones[tone] || tones.neutral;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, background: t.bg, color: t.color, fontSize: 12, fontWeight: 600, fontFamily: SF, whiteSpace: "nowrap" }}>{children}</span>;
}
function Btn({ children, onClick, variant = "primary", style = {}, href, disabled, title, type = "button", testid }) {
  const base = { fontFamily: SF, fontWeight: 600, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", border: "none", borderRadius: 980, padding: "9px 18px", opacity: disabled ? 0.4 : 1, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" };
  const variants = {
    primary: { background: ACCENT, color: "#fff" }, secondary: { background: "transparent", color: OFFWHITE, border: `1px solid ${BORDER}` },
    danger: { background: "transparent", color: RED, border: "1px solid #F1C0C5" }, ghost: { background: "transparent", color: GRAY, border: "none" },
  };
  const El = href ? "a" : "button";
  return (
    <El href={href} target={href ? "_blank" : undefined} rel={href ? "noopener noreferrer" : undefined} type={href ? undefined : type} title={title} data-testid={testid}
      onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.opacity = 0.8)} onMouseLeave={(e) => !disabled && (e.currentTarget.style.opacity = 1)}>
      {children}
    </El>
  );
}
function Field({ label, children, hint, style }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: SF, fontSize: 12, color: GRAY, flex: 1, minWidth: 140, ...style }}>
      {label}{children}{hint && <span style={{ fontSize: 11, color: GRAY, opacity: 0.8 }}>{hint}</span>}
    </label>
  );
}
const inputStyle = { background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, color: OFFWHITE, padding: "9px 10px", fontFamily: SF, fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
function Input(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }
function Select(props) { return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>{props.children}</select>; }
function TextArea(props) { return <textarea {...props} style={{ ...inputStyle, resize: "vertical", minHeight: 60, ...(props.style || {}) }} />; }
function Card({ children, style = {}, ...rest }) { return <div {...rest} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style }}>{children}</div>; }
function EmptyState({ text }) { return <div style={{ padding: "36px 20px", textAlign: "center", color: GRAY, fontFamily: SF, fontSize: 13 }}>{text}</div>; }
function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 28, letterSpacing: "-0.02em", color: OFFWHITE }}>{title}</div>
        {subtitle && <div style={{ fontFamily: SF, fontSize: 13, color: GRAY, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}
function FilterPills({ options, value, onChange, counts }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => (
        <div key={o} onClick={() => onChange(o)} style={{ padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: SF, fontSize: 12, fontWeight: 600, background: value === o ? OFFWHITE : "transparent", color: value === o ? "#fff" : GRAY, border: `1px solid ${value === o ? OFFWHITE : BORDER}`, display: "flex", alignItems: "center", gap: 6 }}>
          {o}{counts && <span style={{ opacity: 0.7, fontSize: 11 }}>{counts[o] ?? 0}</span>}
        </div>
      ))}
    </div>
  );
}
function MiniStat({ label, value, tone, sub }) {
  const color = tone === "warn" ? AMBER : tone === "bad" ? RED : tone === "good" ? SUCCESS : OFFWHITE;
  return (
    <Card>
      <div style={{ fontFamily: SF, fontSize: 11.5, color: GRAY, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 21, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SF, fontSize: 11.5, color: GRAY, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}
function Bars({ data, unit }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130, padding: "6px 2px" }}>
      {data.map((d) => (
        <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ fontSize: 10.5, color: GRAY, fontFamily: SF }}>{unit ? unit(d.value) : d.value}</div>
          <div style={{ width: "100%", height: Math.max(4, (d.value / max) * 84), background: ACCENT, borderRadius: 4, opacity: 0.85 }} />
          <div style={{ fontSize: 10.5, color: GRAY, fontFamily: SF, textAlign: "center" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}
function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.38)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", zIndex: 100, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 22, width: "100%", maxWidth: width, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 17, color: OFFWHITE }}>{title}</div>
          <span onClick={onClose} style={{ cursor: "pointer", color: GRAY, fontSize: 20, lineHeight: 1 }}>×</span>
        </div>
        {children}
      </div>
    </div>
  );
}
function Table({ cols, rows, empty = "Sin datos", onRow }) {
  if (!rows.length) return <EmptyState text={empty} />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SF, fontSize: 13 }}>
        <thead>
          <tr>{cols.map((c) => <th key={c.label} style={{ textAlign: c.right ? "right" : "left", padding: "9px 10px", color: GRAY, fontWeight: 600, fontSize: 11.5, borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap" }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} onClick={onRow ? () => onRow(r) : undefined} style={{ cursor: onRow ? "pointer" : "default", borderBottom: `1px solid ${BORDER}` }}
              onMouseEnter={(e) => onRow && (e.currentTarget.style.background = CARD2)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              {cols.map((c) => <td key={c.label} style={{ padding: "10px", color: OFFWHITE, textAlign: c.right ? "right" : "left", verticalAlign: "middle" }}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Notice({ tone = "amber", children, style }) {
  const c = tone === "red" ? RED : tone === "green" ? SUCCESS : AMBER;
  return <div style={{ border: `1px solid ${c}55`, background: `${c}14`, color: c, borderRadius: 10, padding: "10px 14px", fontFamily: SF, fontSize: 12.5, ...style }}>{children}</div>;
}
function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => { const f = () => setM(window.innerWidth < 900); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return m;
}
const statusTone = (s) => ({ Disponible: "green", Reservado: "amber", "En reparación": "amber", Vendido: "gray", Retirado: "red", Cerrada: "green", Anulada: "red", Abierta: "amber" }[s] || "neutral");

function NavIcon({ name }) {
  const P = {
    dashboard: <g><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></g>,
    ventas: <g><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></g>,
    canje: <g><path d="M4 8h14m0 0-3-3m3 3-3 3" /><path d="M20 16H6m0 0 3-3m-3 3 3 3" /></g>,
    stock: <g><rect x="7" y="2.5" width="10" height="19" rx="2.6" /><path d="M11 18.5h2" /></g>,
    ingresos: <g><path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M5 20h14" /></g>,
    accesorios: <g><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3.5" y="14.5" width="4" height="6" rx="1.6" /><rect x="16.5" y="14.5" width="4" height="6" rx="1.6" /></g>,
    catalogo: <g><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3.2 3.2 3.2 14.8 0 18" /><path d="M12 3c-3.2 3.2-3.2 14.8 0 18" /></g>,
    clientes: <g><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6" /></g>,
    caja: <g><rect x="2.5" y="6" width="19" height="12" rx="2.4" /><circle cx="12" cy="12" r="2.8" /></g>,
    reportes: <g><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></g>,
    usuarios: <g><path d="M12 3l8 3v6c0 4.8-3.4 7.9-8 9-4.6-1.1-8-4.2-8-9V6l8-3z" /></g>,
    config: <g><path d="M4 7h9m4 0h3" /><path d="M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></g>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>{P[name]}</svg>;
}

// ---------- datos demo ----------
function fakeIMEI(n) { return "35" + String(9000000000000 + n * 7919317).slice(0, 13); }

function seedDemoData() {
  const cfg = DEFAULT_CONFIG;
  const users = [
    { id: "u-admin", name: "Santiago", role: "Administrador", active: true, commission: 0, pin: "1111" },
    { id: "u-enc", name: "Lucía", role: "Encargado", active: true, commission: 0, pin: "2222" },
    { id: "u-ven", name: "Mati", role: "Vendedor", active: true, commission: 2, pin: "3333" },
    { id: "u-caj", name: "Caro", role: "Cajero", active: true, commission: 0, pin: "4444" },
  ];
  const mk = (i, kind, model, capacity, color, condition, battery, cost, price, origin, age) => ({
    id: "d" + i, kind, model, capacity, color, condition, imei: fakeIMEI(i), battery, cost, price, status: "Disponible", origin,
    entryDate: addDays(todayStr(), -age), warrantyDays: condition === "Nuevo sellado" ? 365 : 90, notes: "",
    history: [{ date: addDays(todayStr(), -age) + "T14:00:00.000Z", action: `Ingreso (${origin}) a ${fmtUSD(cost)}`, by: "Lucía" }],
  });
  const devices = [
    mk(1, "iPhone", "iPhone 15 Pro", 256, "Titanio natural", "Nuevo sellado", 100, 1010, 1190, "Proveedor", 12),
    mk(2, "iPhone", "iPhone 15", 128, "Azul", "Nuevo sellado", 100, 700, 830, "Proveedor", 12),
    mk(3, "iPhone", "iPhone 14", 128, "Negro", "Usado A", 91, 480, 580, "Compra a particular", 20),
    mk(4, "iPhone", "iPhone 13", 128, "Rosa", "Usado A", 88, 370, 450, "Canje", 34),
    mk(5, "iPhone", "iPhone 14 Pro", 256, "Negro", "Usado A", 94, 660, 780, "Compra a particular", 9),
    mk(6, "iPhone", "iPhone 12", 128, "Blanco", "Usado B", 82, 255, 330, "Canje", 52),
    mk(7, "iPhone", "iPhone 11", 64, "Negro", "Usado B", 79, 170, 230, "Compra a particular", 61),
    mk(8, "iPhone", "iPhone 16 Pro", 256, "Titanio negro", "Nuevo sellado", 100, 1180, 1390, "Proveedor", 5),
    mk(9, "iPad", "iPad 9", 64, "Plata", "Nuevo sellado", 100, 270, 340, "Proveedor", 25),
    mk(10, "Mac", "MacBook Air M1", 256, "Plata", "Reacondicionado", 90, 560, 680, "Compra a particular", 18),
    mk(11, "Watch", "Watch Series 9", 0, "Rojo", "Nuevo sellado", 100, 330, 410, "Proveedor", 14),
    mk(12, "AirPods", "AirPods Pro 2", 0, "Blanco", "Nuevo sellado", 100, 190, 245, "Proveedor", 8),
    mk(13, "iPhone", "iPhone 13", 256, "Azul", "Usado A", 90, 420, 500, "Compra a particular", 3),
    mk(14, "iPhone", "iPhone 15", 128, "Rosa", "Nuevo sellado", 100, 700, 830, "Proveedor", 12),
  ];
  const acc = (i, sku, name, category, cost, price, stock, minStock, supplier) => ({ id: "a" + i, sku, name, category, cost, price, stock, minStock, supplier, moves: [{ date: addDays(todayStr(), -20) + "T12:00:00.000Z", qty: stock, note: "Stock inicial", by: "Lucía" }] });
  const accessories = [
    acc(1, "FUN-001", "Funda silicona iPhone 15", "Fundas", 3500, 12000, 14, 5, "Distribuidora Centro"),
    acc(2, "FUN-002", "Funda MagSafe iPhone 15 Pro", "Fundas", 6500, 19000, 8, 4, "Distribuidora Centro"),
    acc(3, "FUN-003", "Funda transparente iPhone 13/14", "Fundas", 2500, 9000, 3, 6, "Distribuidora Centro"),
    acc(4, "VID-001", "Vidrio templado iPhone 15", "Vidrios", 1200, 6500, 22, 8, "ImportCell"),
    acc(5, "VID-002", "Vidrio templado iPhone 13/14", "Vidrios", 1200, 6500, 18, 8, "ImportCell"),
    acc(6, "VID-003", "Vidrio privacidad iPhone 15 Pro", "Vidrios", 2800, 11000, 0, 4, "ImportCell"),
    acc(7, "CAR-001", "Cargador 20W USB-C", "Cargadores", 7000, 19000, 9, 4, "ImportCell"),
    acc(8, "CAR-002", "Cargador MagSafe", "Cargadores", 16000, 42000, 5, 3, "ImportCell"),
    acc(9, "CAB-001", "Cable USB-C a Lightning 1m", "Cables", 4500, 13000, 17, 6, "Distribuidora Centro"),
    acc(10, "CAB-002", "Cable USB-C a USB-C 1m", "Cables", 4000, 12000, 12, 6, "Distribuidora Centro"),
    acc(11, "AUR-001", "Auriculares con cable Lightning", "Auriculares", 5500, 15000, 2, 4, "ImportCell"),
    acc(12, "SOP-001", "Soporte auto magnético", "Soportes", 3200, 10000, 11, 4, "Distribuidora Centro"),
    acc(13, "OTR-001", "Pop socket", "Otros", 900, 4500, 25, 10, "Distribuidora Centro"),
    acc(14, "OTR-002", "Limpieza de equipo (servicio)", "Otros", 0, 8000, 99, 0, "Interno"),
  ];
  const clients = [
    { id: "c1", name: "María Gómez", phone: "+54 9 261 555 0101", dni: "30111222", email: "", notes: "", createdAt: addDays(todayStr(), -40) },
    { id: "c2", name: "Juan Pérez", phone: "+54 9 261 555 0102", dni: "28999111", email: "", notes: "Siempre cambia el equipo cada año", createdAt: addDays(todayStr(), -33) },
    { id: "c3", name: "Lucas Romero", phone: "+54 9 261 555 0103", dni: "35444111", email: "", notes: "", createdAt: addDays(todayStr(), -20) },
    { id: "c4", name: "Sofía Ledesma", phone: "+54 9 261 555 0104", dni: "37222444", email: "", notes: "", createdAt: addDays(todayStr(), -12) },
    { id: "c5", name: "Diego Navarro", phone: "+54 9 261 555 0105", dni: "31777555", email: "", notes: "", createdAt: addDays(todayStr(), -6) },
  ];

  let data = { ...EMPTY_DATA, config: cfg, users, devices, accessories, clients, log: [] };
  const caro = users[3], mati = users[2];

  const line = (dev) => ({ kind: "device", refId: dev.id, desc: deviceTitle(dev), qty: 1, unit: dev.price, currency: "USD", cost: dev.cost, costCurrency: "USD" });
  const aline = (a, qty) => ({ kind: "acc", refId: a.id, desc: a.name, qty, unit: a.price, currency: "ARS", cost: a.cost, costCurrency: "ARS" });
  const autoPay = (totalUSD, fx) => {
    const usd = Math.round(totalUSD * 0.5 / 10) * 10;
    return [{ method: "Efectivo USD", amount: usd }, { method: "Transferencia ARS", amount: Math.max(0, Math.round((totalUSD - usd) * fx)) }];
  };

  const openDay = (d, offset, openARS, openUSD, user) => {
    const day = addDays(todayStr(), -offset);
    const shift = { id: uid(), number: shiftNumber(d), openedAt: day + "T12:00:00.000Z", openedBy: user.name, openingARS: openARS, openingUSD: openUSD, status: "Abierta" };
    return { ...d, shifts: [...d.shifts, shift] };
  };
  const sellOnDay = (d, offset, spec) => {
    const day = addDays(todayStr(), -offset);
    const lines = spec.lines.map((l) => (typeof l === "function" ? l(d) : l));
    const totals = saleTotals(lines, spec.discountPct || 0, cfg.fx);
    let tradeIn = null;
    if (spec.tradeIn) {
      const t = spec.tradeIn; const ap = appraise(cfg, t);
      tradeIn = { ...t, valueUSD: ap.value, appraisedUSD: ap.value, resaleUSD: suggestedResale(cfg, ap.value) };
    }
    const owed = totals.revenue - (tradeIn ? tradeIn.valueUSD : 0);
    const { data: nd, sale } = applySale(d, { lines, discountPct: spec.discountPct || 0, tradeIn, payments: autoPay(owed, cfg.fx), clientId: spec.clientId, clientName: spec.clientName, clientPhone: spec.clientPhone, sellerName: spec.seller }, spec.user || caro);
    const ts = day + "T" + (spec.hour || "15") + ":00:00.000Z";
    return {
      ...nd,
      sales: nd.sales.map((s) => (s.id === sale.id ? { ...s, date: ts } : s)),
      cashMoves: nd.cashMoves.map((m) => (m.ref === sale.id ? { ...m, ts } : m)),
    };
  };
  const closeDay = (d, offset, diffARS, diffUSD, user) => {
    const day = addDays(todayStr(), -offset);
    const shift = openShiftOf(d);
    const exp = cashExpected(d, shift);
    const closed = { ...shift, status: "Cerrada", closedAt: day + "T22:00:00.000Z", closedBy: user.name, expectedARS: exp.ars, expectedUSD: exp.usd, countedARS: exp.ars + diffARS, countedUSD: exp.usd + diffUSD, diffARS, diffUSD, note: diffARS || diffUSD ? "Diferencia detectada al contar." : "", breakdown: shiftBreakdown(d, shift) };
    return { ...d, shifts: d.shifts.map((s) => (s.id === shift.id ? closed : s)) };
  };

  const dv = (id) => (d) => line(d.devices.find((x) => x.id === id));
  const ac = (id, q) => (d) => aline(d.accessories.find((x) => x.id === id), q);

  const plan = [
    { off: 6, sales: [{ lines: [dv("d9"), ac("a4", 1)], clientId: "c3", clientName: "Lucas Romero", seller: "Mati", user: mati, hour: "14" }], diff: [0, 0] },
    { off: 5, sales: [{ lines: [dv("d2"), ac("a1", 1), ac("a4", 1)], clientId: "c1", clientName: "María Gómez", seller: "Lucía", hour: "16" }], diff: [-2000, 0] },
    { off: 4, sales: [{ lines: [dv("d11")], clientName: "Cliente mostrador", seller: "Mati", user: mati, hour: "13" }, { lines: [ac("a7", 1), ac("a9", 2)], clientName: "Cliente mostrador", seller: "Mati", hour: "17" }], diff: [0, 0] },
    { off: 3, sales: [{ lines: [dv("d14"), ac("a2", 1)], clientId: "c2", clientName: "Juan Pérez", seller: "Lucía", hour: "15", tradeIn: { kind: "iPhone", model: "iPhone 13", capacity: 128, color: "Azul", cond: "Usado B", battery: 86, defects: [], icloudFree: true, imeiClean: true, imei: fakeIMEI(31) } }], diff: [0, 0] },
    { off: 2, sales: [{ lines: [dv("d12"), ac("a8", 1)], clientId: "c4", clientName: "Sofía Ledesma", seller: "Mati", user: mati, hour: "18" }], diff: [0, 20] },
    { off: 1, sales: [{ lines: [dv("d8"), ac("a6", 1)], clientId: "c5", clientName: "Diego Navarro", seller: "Lucía", hour: "12", discountPct: 2 }, { lines: [ac("a5", 2), ac("a10", 1), ac("a13", 2)], clientName: "Cliente mostrador", seller: "Mati", user: mati, hour: "19" }], diff: [0, 0] },
  ];
  plan.forEach((p) => {
    data = openDay(data, p.off, 50000, 200, caro);
    p.sales.forEach((s) => { data = sellOnDay(data, p.off, s); });
    data = closeDay(data, p.off, p.diff[0], p.diff[1], caro);
  });
  // hoy: caja abierta con una venta con canje
  data = openDay(data, 0, 50000, 200, caro);
  data = sellOnDay(data, 0, { lines: [dv("d3"), ac("a1", 1), ac("a5", 1)], clientId: "c2", clientName: "Juan Pérez", seller: "Mati", user: mati, hour: "10", tradeIn: { kind: "iPhone", model: "iPhone 12", capacity: 64, color: "Negro", cond: "Usado B", battery: 81, defects: ["Tapa trasera rota"], icloudFree: true, imeiClean: true, imei: fakeIMEI(32) } });
  data = sellOnDay(data, 0, { lines: [ac("a9", 1), ac("a13", 1)], clientName: "Cliente mostrador", seller: "Mati", user: mati, hour: "11" });
  data = { ...data, log: [{ id: uid(), ts: nowISO(), user: "Santiago", action: "Datos demo", detail: "Se cargaron datos de demostración" }, ...data.log] };
  return data;
}

// ---------- formulario de evaluación de equipo (ingreso / canje / cotizador) ----------
function newDraft() {
  return { kind: "iPhone", model: "", capacity: 128, color: "Negro", cond: "Usado A", battery: 90, imei: "", defects: [], icloudFree: true, imeiClean: true, note: "" };
}
function idLooksOk(d) { return d.kind === "iPhone" || d.kind === "iPad" ? validIMEI(d.imei) : String(d.imei || "").trim().length >= 6; }

function DeviceEvalForm({ draft, set, data, kinds = KINDS, allowSealed = false }) {
  const up = (patch) => set({ ...draft, ...patch });
  const dup = draft.imei && data.devices.find((x) => x.imei === draft.imei.trim() && x.status !== "Vendido" && x.status !== "Retirado");
  const hasBattery = ["iPhone", "iPad", "Mac"].includes(draft.kind);
  const toggleDefect = (def) => up({ defects: draft.defects.includes(def) ? draft.defects.filter((x) => x !== def) : [...draft.defects, def] });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Tipo">
          <Select data-testid="ev-kind" value={draft.kind} onChange={(e) => up({ kind: e.target.value, model: "", capacity: CAPACITIES[e.target.value][0] })}>{kinds.map((k) => <option key={k}>{k}</option>)}</Select>
        </Field>
        <Field label="Modelo">
          <Select data-testid="ev-model" value={draft.model} onChange={(e) => up({ model: e.target.value })}>
            <option value="">Elegí un modelo</option>{CATALOG[draft.kind].map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        {CAPACITIES[draft.kind][0] !== 0 && (
          <Field label="Capacidad">
            <Select data-testid="ev-cap" value={draft.capacity} onChange={(e) => up({ capacity: Number(e.target.value) })}>{CAPACITIES[draft.kind].map((c) => <option key={c} value={c}>{c} GB</option>)}</Select>
          </Field>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Color"><Select value={draft.color} onChange={(e) => up({ color: e.target.value })}>{COLORS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Condición" hint={GRADE_NOTES[draft.cond]}>
          <Select data-testid="ev-cond" value={draft.cond} onChange={(e) => up({ cond: e.target.value })}>{(allowSealed ? CONDITIONS : CONDITIONS.slice(1)).map((c) => <option key={c}>{c}</option>)}</Select>
        </Field>
        {hasBattery && draft.cond !== "Nuevo sellado" && (
          <Field label="Batería (%)"><Input data-testid="ev-battery" type="number" min="40" max="100" value={draft.battery} onChange={(e) => up({ battery: e.target.value })} /></Field>
        )}
      </div>
      <Field label={draft.kind === "iPhone" || draft.kind === "iPad" ? "IMEI (15 dígitos)" : "N.º de serie"} hint={draft.imei && !idLooksOk(draft) ? "Revisá el número: formato inválido" : undefined}>
        <Input data-testid="ev-imei" value={draft.imei} onChange={(e) => up({ imei: e.target.value.replace(/\s/g, "") })} placeholder="Ej: 353912080123456" />
      </Field>
      {dup && <Notice tone="red">Este IMEI ya figura en stock ({deviceShort(dup)}, {dup.status}). Revisá antes de continuar.</Notice>}
      <div>
        <div style={{ fontFamily: SF, fontSize: 12, color: GRAY, marginBottom: 8 }}>Defectos detectados</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DEFECTS.map((def) => {
            const on = draft.defects.includes(def);
            return <div key={def} onClick={() => toggleDefect(def)} style={{ padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontFamily: SF, fontSize: 12, fontWeight: 600, background: on ? "rgba(178,80,0,0.10)" : "transparent", color: on ? AMBER : GRAY, border: `1px solid ${on ? AMBER : BORDER}` }}>{def}</div>;
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: SF, fontSize: 13, color: OFFWHITE }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input data-testid="ev-icloud" type="checkbox" checked={draft.icloudFree} onChange={(e) => up({ icloudFree: e.target.checked })} />iCloud / Buscar mi iPhone desactivado</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={draft.imeiClean} onChange={(e) => up({ imeiClean: e.target.checked })} />IMEI sin denuncia ni bloqueo</label>
      </div>
      <Field label="Observaciones"><Input value={draft.note} onChange={(e) => up({ note: e.target.value })} placeholder="Opcional: incluye caja, cargador, factura de compra..." /></Field>
    </div>
  );
}

function AppraisalBox({ ap }) {
  if (!ap) return null;
  if (!ap.ok) return <Notice tone={ap.blocked ? "red" : "amber"}>{ap.reason}</Notice>;
  return (
    <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", fontFamily: SF, fontSize: 13 }}>
      {ap.lines.map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: l.amount < 0 ? AMBER : OFFWHITE }}>
          <span>{l.label}</span><span>{l.amount < 0 ? "−" : ""}{fmtUSD(Math.abs(l.amount))}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 6, borderTop: `1px solid ${BORDER}`, fontWeight: 600 }}>
        <span>Valor sugerido de toma</span><span style={{ color: ACCENT, fontFamily: SF }}>{fmtUSD(ap.value)}</span>
      </div>
    </div>
  );
}

// estado de validación del canje (usado por venta y cotizador)
function tradeInState(draft, cfg, data, valueStr, perms) {
  const ap = appraise(cfg, draft);
  const value = valueStr === "" || valueStr === undefined ? (ap.ok ? ap.value : 0) : Number(valueStr) || 0;
  const errors = [];
  if (!draft.model) errors.push("Elegí el modelo del equipo que entrega el cliente.");
  if (!idLooksOk(draft)) errors.push("Ingresá un IMEI / serie válido.");
  if (ap.blocked) errors.push(ap.reason);
  if (!ap.ok && !ap.blocked && draft.model && (valueStr === "" || valueStr === undefined)) errors.push("Sin valor de referencia: ingresá el valor a mano.");
  if (draft.imei && data.devices.find((x) => x.imei === draft.imei.trim() && x.status !== "Vendido" && x.status !== "Retirado")) errors.push("El IMEI ya está en stock.");
  if (ap.ok && value > ap.value && !perms.overTradeIn) errors.push(`Tu rol no permite tomar el equipo por encima de ${fmtUSD(ap.value)}. Pedí autorización al encargado.`);
  if (value <= 0 && !ap.blocked) errors.push("El valor tomado debe ser mayor a cero.");
  return { ap, value, errors, valid: errors.length === 0 };
}

function TradeInBlock({ draft, setDraft, valueStr, setValueStr, data, perms }) {
  const cfg = data.config;
  const st = tradeInState(draft, cfg, data, valueStr, perms);
  const resale = suggestedResale(cfg, st.value);
  return (
    <div data-testid="tradein-block" style={{ border: `1px solid ${ACCENT}55`, borderRadius: 12, padding: 14, background: "rgba(0,113,227,0.04)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 14, color: ACCENT }}>Equipo que entrega el cliente</div>
      <DeviceEvalForm draft={draft} set={setDraft} data={data} kinds={["iPhone", "iPad", "Mac"]} />
      <AppraisalBox ap={st.ap} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Field label="Valor tomado (USD)" hint={perms.overTradeIn ? "Podés ajustar el valor sugerido." : "Máximo: el valor sugerido."}>
          <Input data-testid="ti-value" type="number" value={valueStr === "" ? (st.ap.ok ? st.ap.value : "") : valueStr} onChange={(e) => setValueStr(e.target.value)} />
        </Field>
        {perms.seeCost && <Field label="Precio de reventa sugerido"><Input readOnly value={fmtUSD(resale)} /></Field>}
      </div>
      {st.errors.length > 0 && draft.model && <Notice tone="amber">{st.errors[0]}</Notice>}
    </div>
  );
}

// ---------- constructor de venta (POS) ----------
function SaleBuilder({ data, user, perms, persist, toast, startWithTradeIn, goCaja, onSold }) {
  const cfg = data.config, fx = cfg.fx;
  const shift = openShiftOf(data);
  const sellers = data.users.filter((u) => u.active && ["Vendedor", "Encargado", "Administrador"].includes(u.role));
  const [tab, setTab] = useState("equipos");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState([]);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [seller, setSeller] = useState(user.role === "Vendedor" ? user.name : sellers[0] ? sellers[0].name : user.name);
  const [useTI, setUseTI] = useState(!!startWithTradeIn);
  const [draft, setDraft] = useState(newDraft());
  const [tiValue, setTiValue] = useState("");
  const [payments, setPayments] = useState([{ method: "Efectivo USD", amount: "" }]);
  const [notes, setNotes] = useState("");
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrice, setFreePrice] = useState("");
  const [receiptId, setReceiptId] = useState(null);

  const totals = saleTotals(lines, discountPct, fx);
  const ti = useTI ? tradeInState(draft, cfg, data, tiValue, perms) : null;
  const tiUSD = ti && ti.valid ? ti.value : 0;
  const due = totals.revenue - tiUSD;
  const paid = paymentsUSD(payments, fx);
  const balance = due - paid;
  const discErr = !perms.editPrice && Number(discountPct) > cfg.maxDiscountSeller ? `Tu rol permite hasta ${cfg.maxDiscountSeller}% de descuento.` : "";
  const problems = [];
  if (!shift) problems.push("No hay caja abierta. Abrí la caja para registrar ventas.");
  if (!lines.length) problems.push("Agregá al menos un producto.");
  if (discErr) problems.push(discErr);
  if (useTI && ti && !ti.valid) problems.push("Completá el equipo del plan canje: " + ti.errors[0]);
  if (due < -0.5) problems.push("El valor del canje supera el total de la compra.");
  if (Math.abs(balance) > 0.5 && lines.length) problems.push(balance > 0 ? `Falta cobrar ${fmtUSD(balance)}.` : `Hay ${fmtUSD(-balance)} de más: ajustá los pagos.`);
  if (!seller) problems.push("Elegí el vendedor.");
  const canConfirm = problems.length === 0;

  const inCart = (id) => lines.find((l) => l.refId === id);
  const addDevice = (d) => { if (inCart(d.id)) return; setLines([...lines, { kind: "device", refId: d.id, desc: deviceTitle(d), qty: 1, unit: d.price, currency: "USD", cost: d.cost, costCurrency: "USD", warrantyDays: d.warrantyDays }]); };
  const addAcc = (a) => {
    const ex = inCart(a.id);
    if (ex) { if (ex.qty < a.stock) setLines(lines.map((l) => (l.refId === a.id ? { ...l, qty: l.qty + 1 } : l))); return; }
    if (a.stock <= 0) return;
    setLines([...lines, { kind: "acc", refId: a.id, desc: a.name, qty: 1, unit: a.price, currency: "ARS", cost: a.cost, costCurrency: "ARS" }]);
  };
  const addFree = () => { if (!freeDesc || !Number(freePrice)) return; setLines([...lines, { kind: "service", refId: uid(), desc: freeDesc, qty: 1, unit: Number(freePrice), currency: "ARS", cost: 0, costCurrency: "ARS" }]); setFreeDesc(""); setFreePrice(""); };
  const setLine = (i, patch) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const accStock = (id) => (data.accessories.find((a) => a.id === id) || {}).stock || 0;

  const setPay = (i, patch) => setPayments(payments.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const fillRest = (i) => {
    const others = payments.reduce((a, p, k) => (k === i ? a : a + toUSD(Number(p.amount) || 0, methodOf(p.method).cur, fx)), 0);
    const restUSD = Math.max(0, due - others);
    const cur = methodOf(payments[i].method).cur;
    setPay(i, { amount: String(cur === "USD" ? Math.round(restUSD * 100) / 100 : Math.round(restUSD * fx)) });
  };

  const confirm = () => {
    if (!canConfirm) return;
    let tradeIn = null;
    if (useTI) tradeIn = { ...draft, imei: draft.imei.trim(), valueUSD: ti.value, appraisedUSD: ti.ap.ok ? ti.ap.value : 0, resaleUSD: suggestedResale(cfg, ti.value) };
    const client = data.clients.find((c) => c.id === clientId);
    const input = {
      lines, discountPct, tradeIn, payments: payments.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: Number(p.amount) })),
      clientId: client ? client.id : "", clientName: client ? client.name : clientName, clientPhone: client ? client.phone : clientPhone, sellerName: seller, notes,
    };
    const res = applySale(data, input, user);
    persist(res.data);
    setReceiptId(res.sale.id);
    setLines([]); setDiscountPct(""); setUseTI(false); setDraft(newDraft()); setTiValue(""); setPayments([{ method: "Efectivo USD", amount: "" }]); setClientId(""); setClientName(""); setClientPhone(""); setNotes("");
    toast("Venta registrada");
    if (onSold) onSold(res.sale);
  };

  const availDevices = data.devices.filter((d) => d.status === "Disponible" && (!q || `${deviceTitle(d)} ${d.imei} ${d.condition}`.toLowerCase().includes(q.toLowerCase())));
  const availAcc = data.accessories.filter((a) => !q || `${a.name} ${a.sku} ${a.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
      <Card>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <FilterPills options={["equipos", "accesorios", "libre"]} value={tab} onChange={setTab} />
        </div>
        {tab !== "libre" && <Input data-testid="pos-search" placeholder={tab === "equipos" ? "Buscar modelo, IMEI, condición..." : "Buscar accesorio o SKU..."} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />}
        {tab === "equipos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 460, overflowY: "auto" }}>
            {availDevices.length === 0 && <EmptyState text="No hay equipos disponibles con ese filtro." />}
            {availDevices.map((d) => (
              <div key={d.id} data-testid="pos-device" onClick={() => addDevice(d)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", background: inCart(d.id) ? "rgba(0,113,227,0.07)" : CARD2, border: `1px solid ${inCart(d.id) ? ACCENT : BORDER}`, borderRadius: 10, cursor: "pointer", fontFamily: SF }}>
                <div>
                  <div style={{ color: OFFWHITE, fontWeight: 600, fontSize: 13.5 }}>{deviceTitle(d)}</div>
                  <div style={{ color: GRAY, fontSize: 11.5, marginTop: 2 }}>{d.condition}{d.battery && d.condition !== "Nuevo sellado" ? ` · batería ${d.battery}%` : ""} · IMEI …{String(d.imei).slice(-4)}</div>
                </div>
                <div style={{ fontFamily: SF, fontWeight: 600, color: ACCENT }}>{fmtUSD(d.price)}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "accesorios" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 460, overflowY: "auto" }}>
            {availAcc.map((a) => (
              <div key={a.id} data-testid="pos-acc" onClick={() => addAcc(a)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 10, cursor: a.stock > 0 ? "pointer" : "not-allowed", opacity: a.stock > 0 ? 1 : 0.45, fontFamily: SF }}>
                <div>
                  <div style={{ color: OFFWHITE, fontWeight: 600, fontSize: 13.5 }}>{a.name}</div>
                  <div style={{ color: GRAY, fontSize: 11.5, marginTop: 2 }}>{a.sku} · {a.stock > 0 ? `${a.stock} en stock` : "Sin stock"}</div>
                </div>
                <div style={{ fontFamily: SF, fontWeight: 600, color: OFFWHITE }}>{fmtARS(a.price)}</div>
              </div>
            ))}
          </div>
        )}
        {tab === "libre" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY }}>Servicios o conceptos sin stock: instalación de vidrio, configuración, limpieza.</div>
            <Field label="Concepto"><Input value={freeDesc} onChange={(e) => setFreeDesc(e.target.value)} placeholder="Ej: Colocación de vidrio" /></Field>
            <Field label="Precio (ARS)"><Input type="number" value={freePrice} onChange={(e) => setFreePrice(e.target.value)} /></Field>
            <Btn variant="secondary" onClick={addFree}>Agregar al carrito</Btn>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Card data-testid="cart">
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, color: OFFWHITE, marginBottom: 10 }}>Carrito</div>
          {lines.length === 0 && <EmptyState text="Tocá un producto para agregarlo." />}
          {lines.map((l, i) => (
            <div key={l.refId} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BORDER}`, fontFamily: SF, fontSize: 13 }}>
              <div style={{ flex: 1, color: OFFWHITE }}>{l.desc}</div>
              {l.kind === "acc" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span onClick={() => setLine(i, { qty: Math.max(1, l.qty - 1) })} style={{ cursor: "pointer", color: GRAY, padding: "0 6px" }}>−</span>
                  <span style={{ minWidth: 14, textAlign: "center" }}>{l.qty}</span>
                  <span onClick={() => setLine(i, { qty: Math.min(accStock(l.refId), l.qty + 1) })} style={{ cursor: "pointer", color: GRAY, padding: "0 6px" }}>+</span>
                </div>
              )}
              {perms.editPrice ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 10.5, color: GRAY }}>{l.currency}</span><Input type="number" value={l.unit} onChange={(e) => setLine(i, { unit: Number(e.target.value) || 0 })} style={{ width: 96 }} /></div>
              ) : (
                <div style={{ minWidth: 80, textAlign: "right" }}>{fmtCur(l.unit * l.qty, l.currency)}</div>
              )}
              <span onClick={() => setLines(lines.filter((_, k) => k !== i))} style={{ cursor: "pointer", color: RED, fontSize: 16 }}>×</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <Field label="Cliente">
              <Select data-testid="pos-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Cliente nuevo / mostrador</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Vendedor"><Select data-testid="pos-seller" value={seller} onChange={(e) => setSeller(e.target.value)}>{sellers.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
          </div>
          {!clientId && (
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <Field label="Nombre"><Input data-testid="pos-client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Opcional" /></Field>
              <Field label="WhatsApp"><Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Opcional" /></Field>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Descuento (%)"><Input data-testid="pos-discount" type="number" min="0" max="100" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} /></Field>
            <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontFamily: SF, fontSize: 13, color: useTI ? ACCENT : OFFWHITE, paddingBottom: 9, fontWeight: 600 }}>
              <input data-testid="pos-use-tradein" type="checkbox" checked={useTI} onChange={(e) => setUseTI(e.target.checked)} />Plan canje
            </label>
          </div>
        </Card>

        {useTI && <TradeInBlock draft={draft} setDraft={setDraft} valueStr={tiValue} setValueStr={setTiValue} data={data} perms={perms} />}

        <Card>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, color: OFFWHITE, marginBottom: 10 }}>Cobro</div>
          <div style={{ fontFamily: SF, fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
            <Row label="Subtotal" value={fmtUSD(totals.sub)} />
            {totals.discount > 0 && <Row label={`Descuento ${discountPct}%`} value={"−" + fmtUSD(totals.discount)} tone={AMBER} />}
            {tiUSD > 0 && <Row label="Plan canje (equipo recibido)" value={"−" + fmtUSD(tiUSD)} tone={SUCCESS} />}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontWeight: 600, fontSize: 16 }}>
              <span>{tiUSD > 0 ? "Diferencia a pagar" : "Total a pagar"}</span>
              <span data-testid="pos-due" style={{ color: ACCENT, fontFamily: SF }}>{fmtUSD(Math.max(0, due))}</span>
            </div>
            <div style={{ color: GRAY, fontSize: 11.5, textAlign: "right" }}>≈ {fmtARS(Math.max(0, due) * fx)} · cotización {fmtARS(fx)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {payments.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Select data-testid={`pay-method-${i}`} value={p.method} onChange={(e) => setPay(i, { method: e.target.value })} style={{ flex: 1 }}>{METHODS.map((m) => <option key={m.id}>{m.id}</option>)}</Select>
                <Input data-testid={`pay-amount-${i}`} type="number" placeholder={methodOf(p.method).cur} value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} style={{ width: 120 }} />
                <span onClick={() => fillRest(i)} title="Completar con el saldo" style={{ cursor: "pointer", color: ACCENT, fontSize: 12, fontWeight: 600 }}>Saldo</span>
                {payments.length > 1 && <span onClick={() => setPayments(payments.filter((_, k) => k !== i))} style={{ cursor: "pointer", color: RED, fontSize: 16 }}>×</span>}
              </div>
            ))}
            <Btn variant="ghost" onClick={() => setPayments([...payments, { method: "Transferencia ARS", amount: "" }])} style={{ alignSelf: "flex-start", padding: "4px 0" }}>+ Agregar medio de pago</Btn>
          </div>
          <Field label="Notas" style={{ marginTop: 10 }}><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></Field>
          {lines.length > 0 && problems.length > 0 && <Notice tone="amber" style={{ marginTop: 12 }}>{problems[0]}{!shift && goCaja && <span onClick={goCaja} style={{ marginLeft: 8, textDecoration: "underline", cursor: "pointer" }}>Ir a Caja</span>}</Notice>}
          {lines.length === 0 && !shift && <Notice tone="amber" style={{ marginTop: 12 }}>No hay caja abierta. {goCaja && <span onClick={goCaja} style={{ textDecoration: "underline", cursor: "pointer" }}>Abrir caja</span>}</Notice>}
          <Btn testid="pos-confirm" disabled={!canConfirm} onClick={confirm} style={{ width: "100%", marginTop: 14, padding: 13, fontSize: 14 }}>Confirmar venta</Btn>
        </Card>
      </div>
      {receiptId && <ReceiptModal data={data} saleId={receiptId} persist={persist} user={user} onClose={() => setReceiptId(null)} />}
    </div>
  );
}
function Row({ label, value, tone }) { return <div style={{ display: "flex", justifyContent: "space-between", color: tone || OFFWHITE }}><span>{label}</span><span>{value}</span></div>; }

// ---------- comprobante ----------
function ReceiptModal({ data, saleId, persist, user, onClose }) {
  const sale = data.sales.find((s) => s.id === saleId);
  if (!sale) return null;
  const cfg = data.config;
  const phone = sale.clientPhone || (data.clients.find((c) => c.id === sale.clientId) || {}).phone || "";
  const invoice = () => {
    const cae = String(Math.floor(70000000000000 + Math.random() * 9999999999999));
    persist({ ...data, sales: data.sales.map((s) => (s.id === saleId ? { ...s, invoice: { status: "Emitida (demo)", cae, vto: addDays(todayStr(), 10), number: "0001-" + sale.number.slice(2).padStart(8, "0") } } : s)) });
  };
  const html = () => `
    <h1>${cfg.storeName}</h1><div class="s">CUIT ${cfg.cuit}<br/>${cfg.address}</div><hr/>
    <div class="b">Comprobante ${sale.number}</div><div class="s">${fmtDateTime(sale.date)} · Cliente: ${sale.clientName}<br/>Vendedor: ${sale.sellerName}</div><hr/>
    <table>${sale.lines.map((l) => `<tr><td>${l.qty} × ${l.desc}</td><td class="r">${fmtCur(l.unit * l.qty, l.currency)}</td></tr>`).join("")}</table><hr/>
    <table><tr><td>Subtotal</td><td class="r">${fmtUSD(sale.subtotalUSD)}</td></tr>
    ${sale.discountUSD > 0 ? `<tr><td>Descuento ${sale.discountPct}%</td><td class="r">-${fmtUSD(sale.discountUSD)}</td></tr>` : ""}
    ${sale.tradeIn ? `<tr><td>Plan canje: ${deviceShort(sale.tradeIn)} (IMEI ${sale.tradeIn.imei})</td><td class="r">-${fmtUSD(sale.tradeInUSD)}</td></tr>` : ""}
    <tr><td class="b">A pagar</td><td class="r b">${fmtUSD(sale.totalUSD - sale.tradeInUSD)}</td></tr></table><hr/>
    <div class="s">${sale.payments.map((p) => `${p.method}: ${fmtCur(p.amount, methodOf(p.method).cur)}`).join("<br/>")}</div><hr/>
    <div class="s">Garantía: equipos nuevos ${cfg.warrantyNew} días, usados ${cfg.warrantyUsed} días desde la fecha de compra. No cubre golpes ni humedad.</div>
    ${sale.invoice.status !== "No emitida" ? `<hr/><div class="s">Factura ${sale.invoice.number} · CAE ${sale.invoice.cae} · Vto ${fmtDate(sale.invoice.vto)}<br/>SIMULACIÓN DE DEMOSTRACIÓN: sin validez fiscal.</div>` : ""}`;
  return (
    <Modal title={`Venta ${sale.number}`} onClose={onClose} width={500}>
      <div data-testid="receipt" style={{ fontFamily: SF, fontSize: 13, color: OFFWHITE, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: GRAY, fontSize: 12 }}>{fmtDateTime(sale.date)} · {sale.clientName} · vendedor {sale.sellerName}</div>
        {sale.lines.map((l, i) => <Row key={i} label={`${l.qty} × ${l.desc}`} value={fmtCur(l.unit * l.qty, l.currency)} />)}
        {sale.discountUSD > 0 && <Row label={`Descuento ${sale.discountPct}%`} value={"−" + fmtUSD(sale.discountUSD)} tone={AMBER} />}
        {sale.tradeIn && <Row label={`Plan canje: ${deviceShort(sale.tradeIn)}`} value={"−" + fmtUSD(sale.tradeInUSD)} tone={SUCCESS} />}
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontWeight: 600, fontSize: 16 }}>
          <span>{sale.tradeIn ? "Diferencia pagada" : "Total"}</span><span style={{ color: ACCENT, fontFamily: SF }}>{fmtUSD(sale.totalUSD - sale.tradeInUSD)}</span>
        </div>
        <div style={{ color: GRAY, fontSize: 12 }}>{sale.payments.map((p) => `${p.method}: ${fmtCur(p.amount, methodOf(p.method).cur)}`).join(" · ")}</div>
        {sale.tradeIn && <Notice tone="green">El {deviceShort(sale.tradeIn)} recibido ya está en stock como disponible.</Notice>}
        {sale.invoice.status !== "No emitida" ? (
          <Notice tone="green">Factura {sale.invoice.number} · CAE {sale.invoice.cae}<br />Simulación de demostración: sin validez fiscal.</Notice>
        ) : (
          <div style={{ color: GRAY, fontSize: 12 }}>Factura: no emitida. En la versión con módulo ARCA se emite desde acá.</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <Btn onClick={() => printHTML("Comprobante " + sale.number, html())}>Imprimir</Btn>
        {phone && <Btn variant="secondary" href={waLink(phone, `Hola ${sale.clientName}! Gracias por tu compra en ${cfg.storeName}. Comprobante ${sale.number} por ${fmtUSD(sale.totalUSD - sale.tradeInUSD)}.`)}>Enviar por WhatsApp</Btn>}
        {sale.invoice.status === "No emitida" && <Btn testid="invoice-btn" variant="secondary" onClick={invoice}>Emitir factura ARCA (demo)</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
      </div>
    </Modal>
  );
}

// ================= PÁGINAS =================
const activeSales = (data) => data.sales.filter((s) => s.status === "Cerrada");

function Dashboard({ data, perms, setPage }) {
  const cfg = data.config, today = todayStr();
  const sales = activeSales(data);
  const todaySales = sales.filter((s) => dayOf(s.date) === today);
  const revenueToday = todaySales.reduce((a, s) => a + s.revenueUSD, 0);
  const profitToday = todaySales.reduce((a, s) => a + (s.revenueUSD - s.costUSD), 0);
  const inStock = data.devices.filter((d) => d.status === "Disponible");
  const capital = inStock.reduce((a, d) => a + d.cost, 0);
  const monthStart = today.slice(0, 8) + "01";
  const canjesMes = sales.filter((s) => s.tradeIn && dayOf(s.date) >= monthStart);
  const lowAcc = data.accessories.filter((a) => a.minStock > 0 && a.stock <= a.minStock);
  const shift = openShiftOf(data);
  const oldStock = inStock.filter((d) => daysSince(d.entryDate) > 45);
  const staleShift = shift && dayOf(shift.openedAt) < today;
  const lastClosed = [...data.shifts].filter((s) => s.status === "Cerrada").sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))[0];
  const days = Array.from({ length: 7 }).map((_, i) => {
    const day = addDays(today, i - 6);
    return { label: new Date(day + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short" }), value: Math.round(sales.filter((s) => dayOf(s.date) === day).reduce((a, s) => a + s.revenueUSD, 0)) };
  });
  const recent = [...data.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen de tu local en tiempo real" />
      {staleShift && <Notice tone="red" style={{ marginBottom: 14 }}>Hay una caja abierta desde el {fmtDate(shift.openedAt)}. Cerrala antes de seguir vendiendo. <span onClick={() => setPage("caja")} style={{ textDecoration: "underline", cursor: "pointer" }}>Ir a Caja</span></Notice>}
      {lastClosed && (lastClosed.diffARS !== 0 || lastClosed.diffUSD !== 0) && perms.seeAllShifts && (
        <Notice style={{ marginBottom: 14 }}>El último cierre ({lastClosed.number}) tuvo diferencia: {lastClosed.diffARS !== 0 ? fmtARS(lastClosed.diffARS) : ""} {lastClosed.diffUSD !== 0 ? fmtUSD(lastClosed.diffUSD) : ""}.</Notice>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <MiniStat label="Ventas del día" value={fmtUSD(revenueToday)} tone="good" sub={`${todaySales.length} operaciones`} />
        {perms.seeCost && <MiniStat label="Ganancia del día" value={fmtUSD(profitToday)} />}
        <MiniStat label="Equipos en stock" value={inStock.length} sub={perms.seeCost ? `Capital: ${fmtUSD(capital)}` : undefined} />
        <MiniStat label="Caja" value={shift ? "Abierta" : "Cerrada"} tone={shift ? "good" : "warn"} sub={shift ? `Desde ${fmtTime(shift.openedAt)} · ${shift.openedBy}` : "Abrila para vender"} />
        <MiniStat label="Canjes del mes" value={canjesMes.length} sub={fmtUSD(canjesMes.reduce((a, s) => a + s.tradeInUSD, 0)) + " tomados"} />
        <MiniStat label="Accesorios a reponer" value={lowAcc.length} tone={lowAcc.length ? "warn" : undefined} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <Card>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Ventas últimos 7 días (USD)</div>
          <Bars data={days} unit={(v) => (v ? v : "")} />
        </Card>
        <Card>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Para atender</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: SF, fontSize: 13 }}>
            {lowAcc.slice(0, 4).map((a) => <div key={a.id} style={{ display: "flex", justifyContent: "space-between" }}><span>{a.name}</span><Badge tone={a.stock === 0 ? "red" : "amber"}>{a.stock === 0 ? "Sin stock" : `${a.stock} u.`}</Badge></div>)}
            {oldStock.slice(0, 3).map((d) => <div key={d.id} style={{ display: "flex", justifyContent: "space-between" }}><span>{deviceShort(d)} ({d.condition})</span><Badge tone="amber">{daysSince(d.entryDate)} días en stock</Badge></div>)}
            {lowAcc.length === 0 && oldStock.length === 0 && <div style={{ color: GRAY }}>Todo en orden.</div>}
          </div>
        </Card>
      </div>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Últimas operaciones</div>
        <Table empty="Todavía no hay ventas." rows={recent} cols={[
          { label: "N.º", render: (s) => s.number }, { label: "Cliente", render: (s) => s.clientName },
          { label: "Detalle", render: (s) => s.lines.map((l) => l.desc).slice(0, 2).join(", ") + (s.lines.length > 2 ? "…" : "") },
          { label: "Canje", render: (s) => (s.tradeIn ? <Badge tone="green">Canje</Badge> : "") },
          { label: "Total", right: true, render: (s) => fmtUSD(s.totalUSD) },
          { label: "Estado", render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge> },
        ]} />
      </Card>
    </div>
  );
}

function VoidModal({ sale, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <Modal title={`Anular ${sale.number}`} onClose={onClose} width={440}>
      <div style={{ fontFamily: SF, fontSize: 13, color: GRAY, marginBottom: 12 }}>Se devuelve el stock, se registra el egreso en caja y {sale.tradeIn ? "el equipo recibido en canje se retira del stock." : "queda el registro de la anulación."}</div>
      <Field label="Motivo (obligatorio)"><Input data-testid="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}><Btn variant="danger" testid="void-confirm" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>Anular venta</Btn><Btn variant="ghost" onClick={onClose}>Cancelar</Btn></div>
    </Modal>
  );
}

function SalesPage({ data, user, perms, persist, toast, setPage }) {
  const [tab, setTab] = useState("nueva");
  const [view, setView] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [q, setQ] = useState("");
  const rows = [...data.sales].sort((a, b) => b.date.localeCompare(a.date)).filter((s) => !q || `${s.number} ${s.clientName} ${s.sellerName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="Ventas" subtitle="Equipos, accesorios y servicios en una sola operación" action={<FilterPills options={["nueva", "historial"]} value={tab} onChange={setTab} />} />
      {tab === "nueva" ? <SaleBuilder data={data} user={user} perms={perms} persist={persist} toast={toast} goCaja={() => setPage("caja")} /> : (
        <Card>
          <Input placeholder="Buscar por número, cliente o vendedor" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12, maxWidth: 360 }} />
          <Table empty="No hay ventas." rows={rows} onRow={(s) => setView(s.id)} cols={[
            { label: "N.º", render: (s) => s.number }, { label: "Fecha", render: (s) => fmtDateTime(s.date) }, { label: "Cliente", render: (s) => s.clientName },
            { label: "Vendedor", render: (s) => s.sellerName }, { label: "Canje", render: (s) => (s.tradeIn ? <Badge tone="green">{fmtUSD(s.tradeInUSD)}</Badge> : "") },
            { label: "Factura", render: (s) => (s.invoice.status === "No emitida" ? <Badge tone="gray">Sin emitir</Badge> : <Badge tone="green">Emitida</Badge>) },
            { label: "Total", right: true, render: (s) => fmtUSD(s.totalUSD) }, { label: "Estado", render: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge> },
            { label: "", render: (s) => (perms.voidSale && s.status === "Cerrada" ? <span data-testid={`void-${s.number}`} onClick={(e) => { e.stopPropagation(); setVoiding(s); }} style={{ color: RED, cursor: "pointer", fontSize: 12 }}>Anular</span> : null) },
          ]} />
        </Card>
      )}
      {view && <ReceiptModal data={data} saleId={view} persist={persist} user={user} onClose={() => setView(null)} />}
      {voiding && <VoidModal sale={voiding} onClose={() => setVoiding(null)} onConfirm={(reason) => { persist(applyVoidSale(data, voiding.id, user, reason)); setVoiding(null); toast("Venta anulada"); }} />}
    </div>
  );
}

function QuotePanel({ data, perms }) {
  const cfg = data.config;
  const [draft, setDraft] = useState(newDraft());
  const [valueStr, setValueStr] = useState("");
  const [targetId, setTargetId] = useState("");
  const [phone, setPhone] = useState("");
  const st = tradeInState(draft, cfg, data, valueStr, perms);
  const target = data.devices.find((d) => d.id === targetId);
  const diff = target ? target.price - (st.valid ? st.value : 0) : null;
  const msg = target && st.valid ? `Hola! Cotización plan canje en ${cfg.storeName}: tu ${deviceShort(draft)} (${draft.cond}) lo tomamos a ${fmtUSD(st.value)}. El ${deviceTitle(target)} sale ${fmtUSD(target.price)}. Diferencia a pagar: ${fmtUSD(diff)} (aprox. ${fmtARS(diff * cfg.fx)}). Cotización válida por 48 hs, sujeta a revisión del equipo en el local.` : "";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
      <Card>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>1. Equipo del cliente</div>
        <DeviceEvalForm draft={draft} set={setDraft} data={data} kinds={["iPhone", "iPad", "Mac"]} />
      </Card>
      <Card>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>2. Cotización</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AppraisalBox ap={st.ap} />
          <Field label="Equipo que quiere llevarse">
            <Select data-testid="quote-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Elegí un equipo del stock</option>{data.devices.filter((d) => d.status === "Disponible").map((d) => <option key={d.id} value={d.id}>{deviceTitle(d)} · {d.condition} · {fmtUSD(d.price)}</option>)}
            </Select>
          </Field>
          {target && (
            <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, fontFamily: SF, fontSize: 13 }}>
              <Row label="Precio del equipo" value={fmtUSD(target.price)} />
              <Row label="Valor de tu equipo" value={"−" + fmtUSD(st.valid ? st.value : 0)} tone={SUCCESS} />
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 6, borderTop: `1px solid ${BORDER}`, fontWeight: 600, fontSize: 16 }}>
                <span>Diferencia a pagar</span><span data-testid="quote-diff" style={{ color: ACCENT, fontFamily: SF }}>{fmtUSD(diff)}</span>
              </div>
              <div style={{ textAlign: "right", color: GRAY, fontSize: 11.5 }}>≈ {fmtARS(diff * cfg.fx)}</div>
            </div>
          )}
          {!st.valid && draft.model && <Notice>{st.errors[0]}</Notice>}
          {msg && (
            <>
              <Field label="WhatsApp del cliente (opcional)"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+54 9 261 ..." /></Field>
              <Btn href={waLink(phone, msg)} variant="secondary">Enviar cotización por WhatsApp</Btn>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function TradeInPage({ data, user, perms, persist, toast, setPage }) {
  const [tab, setTab] = useState("cotizar");
  const sales = activeSales(data).filter((s) => s.tradeIn).sort((a, b) => b.date.localeCompare(a.date));
  const monthStart = todayStr().slice(0, 8) + "01";
  const mes = sales.filter((s) => dayOf(s.date) >= monthStart);
  const avgDiff = mes.length ? mes.reduce((a, s) => a + (s.totalUSD - s.tradeInUSD), 0) / mes.length : 0;
  return (
    <div>
      <PageHeader title="Plan Canje" subtitle="Tasá el equipo del cliente, mostrá la diferencia y cerrá la venta" action={<FilterPills options={["cotizar", "nuevo canje", "historial"]} value={tab} onChange={setTab} />} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <MiniStat label="Canjes del mes" value={mes.length} tone="good" />
        <MiniStat label="Valor tomado en el mes" value={fmtUSD(mes.reduce((a, s) => a + s.tradeInUSD, 0))} />
        <MiniStat label="Diferencia promedio cobrada" value={fmtUSD(avgDiff)} />
      </div>
      {tab === "cotizar" && <QuotePanel data={data} perms={perms} />}
      {tab === "nuevo canje" && <SaleBuilder data={data} user={user} perms={perms} persist={persist} toast={toast} startWithTradeIn goCaja={() => setPage("caja")} />}
      {tab === "historial" && (
        <Card>
          <Table empty="Todavía no hay canjes." rows={sales} cols={[
            { label: "Venta", render: (s) => s.number }, { label: "Fecha", render: (s) => fmtDate(s.date) }, { label: "Cliente", render: (s) => s.clientName },
            { label: "Equipo recibido", render: (s) => `${deviceShort(s.tradeIn)} · ${s.tradeIn.cond}` }, { label: "IMEI", render: (s) => s.tradeIn.imei },
            { label: "Valor tomado", right: true, render: (s) => fmtUSD(s.tradeInUSD) }, { label: "Diferencia pagada", right: true, render: (s) => fmtUSD(s.totalUSD - s.tradeInUSD) },
          ]} />
        </Card>
      )}
    </div>
  );
}

function DeviceDetail({ d, data, perms, persist, user, toast, onClose }) {
  const [price, setPrice] = useState(d.price);
  const [status, setStatus] = useState(d.status);
  const [notes, setNotes] = useState(d.notes || "");
  const save = () => {
    let nd = { ...data, devices: data.devices.map((x) => (x.id === d.id ? { ...x, price: Number(price) || 0, status, notes, history: [...(x.history || []), ...(Number(price) !== d.price || status !== d.status ? [{ date: nowISO(), action: `Editado: ${Number(price) !== d.price ? "precio " + fmtUSD(price) + " " : ""}${status !== d.status ? "estado " + status : ""}`, by: user.name }] : [])] } : x)) };
    persist(addLog(nd, user.name, "Equipo editado", deviceShort(d))); toast("Equipo actualizado"); onClose();
  };
  const sold = d.status === "Vendido";
  return (
    <Modal title={deviceTitle(d)} onClose={onClose} width={560}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}><Badge tone={statusTone(d.status)}>{d.status}</Badge><Badge>{d.condition}</Badge><Badge tone="gray">{d.origin}</Badge></div>
      <div style={{ fontFamily: SF, fontSize: 13, color: OFFWHITE, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div><span style={{ color: GRAY }}>IMEI / serie: </span>{d.imei}</div>
        {d.battery && d.condition !== "Nuevo sellado" && <div><span style={{ color: GRAY }}>Batería: </span>{d.battery}%</div>}
        <div><span style={{ color: GRAY }}>Ingreso: </span>{fmtDate(d.entryDate)} ({daysSince(d.entryDate)} días)</div>
        <div><span style={{ color: GRAY }}>Garantía: </span>{d.warrantyDays} días</div>
        {perms.seeCost && <div><span style={{ color: GRAY }}>Costo: </span>{fmtUSD(d.cost)}</div>}
        {perms.seeCost && <div><span style={{ color: GRAY }}>Margen: </span>{fmtUSD(d.price - d.cost)} ({d.price ? Math.round(((d.price - d.cost) / d.price) * 100) : 0}%)</div>}
      </div>
      {d.notes && <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY, marginBottom: 12 }}>{d.notes}</div>}
      {perms.editStock && !sold && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Field label="Precio (USD)"><Input data-testid="dev-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Estado"><Select value={status} onChange={(e) => setStatus(e.target.value)}>{DEVICE_STATUSES.filter((s) => s !== "Vendido").map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Notas" style={{ flexBasis: "100%" }}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      )}
      <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Historial</div>
      <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY, display: "flex", flexDirection: "column", gap: 4, maxHeight: 150, overflowY: "auto" }}>
        {[...(d.history || [])].reverse().map((h, i) => <div key={i}>{fmtDateTime(h.date)} · {h.action} <span style={{ opacity: 0.7 }}>({h.by})</span></div>)}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {perms.editStock && !sold && <Btn onClick={save} testid="dev-save">Guardar</Btn>}
        <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
      </div>
    </Modal>
  );
}

function StockPage({ data, user, perms, persist, toast, setPage, role }) {
  const [kind, setKind] = useState("Todos");
  const [status, setStatus] = useState("Disponible");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const rows = data.devices.filter((d) => (kind === "Todos" || d.kind === kind) && (status === "Todos" || d.status === status) && (!q || `${deviceTitle(d)} ${d.imei} ${d.condition}`.toLowerCase().includes(q.toLowerCase())));
  const counts = Object.fromEntries(["Todos", ...KINDS].map((k) => [k, data.devices.filter((d) => (k === "Todos" || d.kind === k) && (status === "Todos" || d.status === status)).length]));
  const cols = [
    { label: "Equipo", render: (d) => <div><div style={{ fontWeight: 600 }}>{deviceTitle(d)}</div><div style={{ color: GRAY, fontSize: 11.5 }}>{d.condition}</div></div> },
    { label: "IMEI / serie", render: (d) => <span style={{ color: GRAY }}>{d.imei}</span> },
    { label: "Batería", render: (d) => (d.condition === "Nuevo sellado" || !d.battery ? "-" : d.battery + "%") },
    { label: "Origen", render: (d) => <Badge tone={d.origin === "Canje" ? "green" : "gray"}>{d.origin}</Badge> },
    { label: "Días", render: (d) => (d.status === "Disponible" ? <span style={{ color: daysSince(d.entryDate) > 45 ? AMBER : OFFWHITE }}>{daysSince(d.entryDate)}</span> : "-") },
  ];
  if (perms.seeCost) cols.push({ label: "Costo", right: true, render: (d) => fmtUSD(d.cost) });
  cols.push({ label: "Precio", right: true, render: (d) => <b>{fmtUSD(d.price)}</b> }, { label: "Estado", render: (d) => <Badge tone={statusTone(d.status)}>{d.status}</Badge> });
  return (
    <div>
      <PageHeader title="Stock de equipos" subtitle="Cada equipo con su IMEI, condición e historial"
        action={<div style={{ display: "flex", gap: 8 }}>
          {perms.seeCost && <Btn variant="secondary" onClick={() => downloadCSV("stock-equipos.csv", rows.map((d) => ({ Equipo: deviceTitle(d), Condicion: d.condition, IMEI: d.imei, Costo: d.cost, Precio: d.price, Estado: d.status, Ingreso: d.entryDate })))}>Exportar CSV</Btn>}
          {NAV_ITEMS.find((n) => n.id === "ingresos").roles.includes(role) && <Btn onClick={() => setPage("ingresos")}>+ Ingresar equipo</Btn>}
        </div>} />
      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <Input data-testid="stock-search" placeholder="Buscar modelo, IMEI, condición..." value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300 }} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 170 }}>{["Todos", ...DEVICE_STATUSES].map((s) => <option key={s}>{s}</option>)}</Select>
        </div>
        <div style={{ marginBottom: 12 }}><FilterPills options={["Todos", ...KINDS]} value={kind} onChange={setKind} counts={counts} /></div>
        <Table cols={cols} rows={rows} empty="No hay equipos con ese filtro." onRow={(d) => setSel(d.id)} />
      </Card>
      {sel && <DeviceDetail d={data.devices.find((x) => x.id === sel)} data={data} perms={perms} persist={persist} user={user} toast={toast} onClose={() => setSel(null)} />}
    </div>
  );
}

function IngresosPage({ data, user, persist, toast, perms }) {
  const cfg = data.config;
  const shift = openShiftOf(data);
  const [origin, setOrigin] = useState("Compra a particular");
  const [person, setPerson] = useState({ name: "", dni: "", phone: "" });
  const [draft, setDraft] = useState({ ...newDraft(), cond: "Usado A" });
  const [costStr, setCostStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [payMethod, setPayMethod] = useState("Efectivo USD");
  const [payStr, setPayStr] = useState("");
  const [done, setDone] = useState(null);
  const sealed = origin === "Proveedor";
  const d2 = sealed ? { ...draft, cond: draft.cond === "Usado A" || draft.cond === "Usado B" ? "Nuevo sellado" : draft.cond } : draft;
  const ap = appraise(cfg, d2);
  const cost = costStr === "" ? (ap.ok ? ap.value : 0) : Number(costStr) || 0;
  const price = priceStr === "" ? suggestedResale(cfg, cost) : Number(priceStr) || 0;
  const payAmount = payStr === "" ? (methodOf(payMethod).cur === "USD" ? cost : Math.round(cost * cfg.fx)) : Number(payStr) || 0;
  const errors = [];
  if (!d2.model) errors.push("Elegí el modelo.");
  if (!idLooksOk(d2)) errors.push("Ingresá un IMEI / serie válido.");
  if (data.devices.find((x) => x.imei === d2.imei.trim() && x.status !== "Vendido" && x.status !== "Retirado")) errors.push("El IMEI ya está en stock.");
  if (!sealed && ap.blocked) errors.push(ap.reason);
  if (!sealed && !d2.icloudFree) errors.push("No se puede comprar un equipo con iCloud activo.");
  if (!sealed && origin === "Compra a particular" && (!person.name.trim() || !person.dni.trim())) errors.push("Cargá nombre y DNI de quien vende (queda en el boleto de compra).");
  if (cost <= 0) errors.push("Ingresá el valor de compra.");
  if (price <= 0) errors.push("Ingresá el precio de venta.");
  if (payAmount > 0 && !shift) errors.push("Abrí la caja para registrar el pago.");
  const valid = errors.length === 0;
  const submit = () => {
    const input = { ...d2, imei: d2.imei.trim(), origin, personName: person.name, personDni: person.dni, personPhone: person.phone, costUSD: cost, priceUSD: price, payMethod, payAmount };
    const res = applyIngreso(data, input, user);
    persist(res.data); setDone(res.ingreso); toast("Equipo ingresado al stock");
    setDraft({ ...newDraft(), cond: "Usado A" }); setPerson({ name: "", dni: "", phone: "" }); setCostStr(""); setPriceStr(""); setPayStr("");
  };
  const boleto = (i) => printHTML("Boleto de compra " + i.number, `<h1>${cfg.storeName}</h1><div class="s">CUIT ${cfg.cuit}<br/>${cfg.address}</div><hr/><div class="b">Boleto de compra ${i.number}</div><div class="s">${fmtDateTime(i.date)}</div><hr/><table><tr><td>Vendedor</td><td class="r">${i.personName || "-"}</td></tr><tr><td>DNI</td><td class="r">${i.personDni || "-"}</td></tr><tr><td>Equipo</td><td class="r">${i.deviceDesc}</td></tr><tr><td>IMEI / serie</td><td class="r">${i.imei}</td></tr><tr><td class="b">Valor abonado</td><td class="r b">${fmtUSD(i.costUSD)}</td></tr></table><hr/><div class="s">El vendedor declara ser titular del equipo, que está libre de bloqueos, denuncias y de iCloud, y que lo vende por su propia voluntad.<br/><br/><br/>Firma vendedor: ________________</div>`);
  const ingresos = [...(data.ingresos || [])].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <PageHeader title="Ingreso de equipos" subtitle="Comprá usados a particulares o cargá mercadería de proveedor, con control de IMEI y pago por caja" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Origen"><Select data-testid="ing-origin" value={origin} onChange={(e) => { setOrigin(e.target.value); setDraft({ ...draft, cond: e.target.value === "Proveedor" ? "Nuevo sellado" : "Usado A" }); }}>{["Compra a particular", "Proveedor", "Otro"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
            {origin === "Compra a particular" && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Nombre de quien vende"><Input data-testid="ing-person" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} /></Field>
                <Field label="DNI"><Input data-testid="ing-dni" value={person.dni} onChange={(e) => setPerson({ ...person, dni: e.target.value })} /></Field>
                <Field label="Teléfono"><Input value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} /></Field>
              </div>
            )}
            <DeviceEvalForm draft={d2} set={setDraft} data={data} allowSealed={sealed || origin === "Otro"} />
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Valuación</div>
            {!sealed && <AppraisalBox ap={ap} />}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <Field label="Valor de compra (USD)"><Input data-testid="ing-cost" type="number" value={costStr === "" ? (cost || "") : costStr} onChange={(e) => setCostStr(e.target.value)} /></Field>
              <Field label="Precio de venta (USD)"><Input data-testid="ing-price" type="number" value={priceStr === "" ? (price || "") : priceStr} onChange={(e) => setPriceStr(e.target.value)} /></Field>
            </div>
            {perms.seeCost && cost > 0 && <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY, marginTop: 8 }}>Margen proyectado: <b style={{ color: price - cost > 0 ? SUCCESS : RED }}>{fmtUSD(price - cost)}</b> ({price ? Math.round(((price - cost) / price) * 100) : 0}%)</div>}
          </Card>
          <Card>
            <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Pago desde caja</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field label="Medio"><Select data-testid="ing-pay-method" value={payMethod} onChange={(e) => { setPayMethod(e.target.value); setPayStr(""); }}>{METHODS.map((m) => <option key={m.id}>{m.id}</option>)}</Select></Field>
              <Field label={`Monto (${methodOf(payMethod).cur})`}><Input type="number" value={payStr === "" ? payAmount || "" : payStr} onChange={(e) => setPayStr(e.target.value)} /></Field>
            </div>
            {errors.length > 0 && (d2.model || person.name) && <Notice style={{ marginTop: 12 }}>{errors[0]}</Notice>}
            <Btn testid="ing-submit" disabled={!valid} onClick={submit} style={{ width: "100%", marginTop: 14, padding: 13 }}>Confirmar ingreso</Btn>
          </Card>
        </div>
      </div>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Ingresos recientes</div>
        <Table empty="Todavía no registraste ingresos." rows={ingresos.slice(0, 10)} cols={[
          { label: "N.º", render: (i) => i.number }, { label: "Fecha", render: (i) => fmtDateTime(i.date) }, { label: "Equipo", render: (i) => i.deviceDesc }, { label: "Origen", render: (i) => i.origin },
          { label: "Vendedor", render: (i) => i.personName || "-" }, { label: "Valor", right: true, render: (i) => fmtUSD(i.costUSD) }, { label: "Registró", render: (i) => i.by },
          { label: "", render: (i) => <span onClick={() => boleto(i)} style={{ color: ACCENT, cursor: "pointer", fontSize: 12 }}>Boleto</span> },
        ]} />
      </Card>
      {done && (
        <Modal title="Equipo ingresado" onClose={() => setDone(null)} width={420}>
          <div data-testid="ing-done" style={{ fontFamily: SF, fontSize: 13, color: OFFWHITE, marginBottom: 14 }}>{done.deviceDesc} ingresó al stock a {fmtUSD(done.costUSD)}. {done.payAmount > 0 ? "El pago quedó registrado en la caja." : ""}</div>
          <div style={{ display: "flex", gap: 8 }}><Btn onClick={() => boleto(done)}>Imprimir boleto de compra</Btn><Btn variant="ghost" onClick={() => setDone(null)}>Cerrar</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Accesorios ----------
function AccForm({ acc, onSave, onClose, seeCost }) {
  const [f, setF] = useState(acc || { sku: "", name: "", category: "Fundas", cost: "", price: "", stock: "", minStock: 3, supplier: "" });
  const up = (k, v) => setF({ ...f, [k]: v });
  const ok = f.name.trim() && Number(f.price) > 0;
  return (
    <Modal title={acc ? "Editar accesorio" : "Nuevo accesorio"} onClose={onClose} width={520}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Nombre" style={{ flex: 3 }}><Input data-testid="acc-name" value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
          <Field label="SKU"><Input value={f.sku} onChange={(e) => up("sku", e.target.value)} placeholder="Auto" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Categoría"><Select value={f.category} onChange={(e) => up("category", e.target.value)}>{ACC_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Proveedor"><Input value={f.supplier} onChange={(e) => up("supplier", e.target.value)} /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {seeCost && <Field label="Costo (ARS)"><Input type="number" value={f.cost} onChange={(e) => up("cost", e.target.value)} /></Field>}
          <Field label="Precio (ARS)"><Input data-testid="acc-price" type="number" value={f.price} onChange={(e) => up("price", e.target.value)} /></Field>
          {!acc && <Field label="Stock inicial"><Input data-testid="acc-stock" type="number" value={f.stock} onChange={(e) => up("stock", e.target.value)} /></Field>}
          <Field label="Stock mínimo"><Input type="number" value={f.minStock} onChange={(e) => up("minStock", e.target.value)} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8 }}><Btn testid="acc-save" disabled={!ok} onClick={() => onSave({ ...f, cost: Number(f.cost) || 0, price: Number(f.price), stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0 })}>Guardar</Btn><Btn variant="ghost" onClick={onClose}>Cancelar</Btn></div>
      </div>
    </Modal>
  );
}

function AccessoriesPage({ data, user, perms, persist, toast }) {
  const [cat, setCat] = useState("Todas");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const [restock, setRestock] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [qty, setQty] = useState("");
  const [newCost, setNewCost] = useState("");
  const rows = data.accessories.filter((a) => (cat === "Todas" || a.category === cat) && (!q || `${a.name} ${a.sku}`.toLowerCase().includes(q.toLowerCase())));
  const low = data.accessories.filter((a) => a.minStock > 0 && a.stock <= a.minStock);
  const nextSku = (category) => category.slice(0, 3).toUpperCase() + "-" + String(data.accessories.filter((a) => a.category === category).length + 1).padStart(3, "0");
  const saveAcc = (f) => {
    if (f.id) persist(addLog({ ...data, accessories: data.accessories.map((a) => (a.id === f.id ? { ...a, ...f } : a)) }, user.name, "Accesorio editado", f.name));
    else {
      const a = { ...f, id: uid(), sku: f.sku || nextSku(f.category), moves: f.stock ? [{ date: nowISO(), qty: f.stock, note: "Stock inicial", by: user.name }] : [] };
      persist(addLog({ ...data, accessories: [...data.accessories, a] }, user.name, "Accesorio nuevo", a.name));
    }
    setEdit(null); toast("Accesorio guardado");
  };
  const doRestock = () => {
    const n = Number(qty); if (!n || n <= 0) return;
    const c = newCost === "" ? restock.cost : Number(newCost);
    const avg = restock.stock + n > 0 ? Math.round((restock.stock * restock.cost + n * c) / (restock.stock + n)) : c;
    persist(addLog({ ...data, accessories: data.accessories.map((a) => (a.id === restock.id ? { ...a, stock: a.stock + n, cost: avg, moves: [...(a.moves || []), { date: nowISO(), qty: n, note: `Reposición a ${fmtARS(c)} c/u`, by: user.name }] } : a)) }, user.name, "Reposición", `${restock.name} +${n}`));
    setRestock(null); setQty(""); setNewCost(""); toast("Stock actualizado");
  };
  const parsed = bulkText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, category, cost, price, stock] = l.split(";").map((x) => x.trim());
    return { name, category: ACC_CATEGORIES.includes(category) ? category : "Otros", cost: Number(cost) || 0, price: Number(price) || 0, stock: Number(stock) || 0 };
  });
  const validBulk = parsed.filter((p) => p.name && p.price > 0);
  const doBulk = () => {
    let list = [...data.accessories];
    validBulk.forEach((p) => {
      const sku = p.category.slice(0, 3).toUpperCase() + "-" + String(list.filter((a) => a.category === p.category).length + 1).padStart(3, "0");
      list.push({ id: uid(), sku, name: p.name, category: p.category, cost: p.cost, price: p.price, stock: p.stock, minStock: 3, supplier: "", moves: p.stock ? [{ date: nowISO(), qty: p.stock, note: "Carga masiva", by: user.name }] : [] });
    });
    persist(addLog({ ...data, accessories: list }, user.name, "Carga masiva", `${validBulk.length} accesorios`));
    setBulk(false); setBulkText(""); toast(`${validBulk.length} accesorios cargados`);
  };
  const cols = [
    { label: "SKU", render: (a) => <span style={{ color: GRAY }}>{a.sku}</span> }, { label: "Accesorio", render: (a) => <b>{a.name}</b> }, { label: "Categoría", render: (a) => a.category },
    { label: "Stock", render: (a) => <Badge tone={a.stock === 0 ? "red" : a.minStock > 0 && a.stock <= a.minStock ? "amber" : "green"}>{a.stock}</Badge> }, { label: "Mín.", render: (a) => a.minStock },
  ];
  if (perms.seeCost) cols.push({ label: "Costo", right: true, render: (a) => fmtARS(a.cost) });
  cols.push({ label: "Precio", right: true, render: (a) => <b>{fmtARS(a.price)}</b> });
  if (perms.editStock) cols.push({ label: "", render: (a) => <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}><span data-testid={`restock-${a.sku}`} onClick={() => setRestock(a)} style={{ color: ACCENT, cursor: "pointer", fontSize: 12 }}>Reponer</span><span onClick={() => setEdit(a)} style={{ color: GRAY, cursor: "pointer", fontSize: 12 }}>Editar</span></div> });
  return (
    <div>
      <PageHeader title="Accesorios" subtitle="Fundas, vidrios, cargadores y más, con stock y alertas de reposición"
        action={perms.editStock && <div style={{ display: "flex", gap: 8 }}><Btn variant="secondary" testid="acc-bulk" onClick={() => setBulk(true)}>Carga masiva</Btn><Btn testid="acc-new" onClick={() => setEdit({})}>+ Nuevo accesorio</Btn></div>} />
      {low.length > 0 && <Notice style={{ marginBottom: 14 }}>{low.length} accesorios en o por debajo del mínimo: {low.slice(0, 3).map((a) => a.name).join(", ")}{low.length > 3 ? "…" : ""}</Notice>}
      <Card>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}><Input placeholder="Buscar accesorio o SKU" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} /></div>
        <div style={{ marginBottom: 12 }}><FilterPills options={["Todas", ...ACC_CATEGORIES]} value={cat} onChange={setCat} /></div>
        <Table cols={cols} rows={rows} empty="No hay accesorios con ese filtro." />
      </Card>
      {edit && <AccForm acc={edit.id ? edit : null} seeCost={perms.seeCost} onClose={() => setEdit(null)} onSave={saveAcc} />}
      {restock && (
        <Modal title={`Reponer: ${restock.name}`} onClose={() => setRestock(null)} width={420}>
          <div style={{ fontFamily: SF, fontSize: 13, color: GRAY, marginBottom: 12 }}>Stock actual: {restock.stock}. {perms.seeCost ? `Costo actual: ${fmtARS(restock.cost)}.` : ""}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cantidad que ingresa"><Input data-testid="restock-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="Costo unitario (ARS)" hint="Se recalcula el costo promedio."><Input type="number" value={newCost} onChange={(e) => setNewCost(e.target.value)} placeholder={String(restock.cost)} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}><Btn testid="restock-save" disabled={!Number(qty)} onClick={doRestock}>Ingresar stock</Btn><Btn variant="ghost" onClick={() => setRestock(null)}>Cancelar</Btn></div>
        </Modal>
      )}
      {bulk && (
        <Modal title="Carga masiva de accesorios" onClose={() => setBulk(false)} width={620}>
          <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY, marginBottom: 10 }}>Pegá una línea por accesorio con este formato: <b style={{ color: OFFWHITE }}>nombre; categoría; costo; precio; stock</b>. Categorías: {ACC_CATEGORIES.join(", ")}.</div>
          <TextArea data-testid="bulk-text" value={bulkText} onChange={(e) => setBulkText(e.target.value)} style={{ minHeight: 140 }} placeholder={"Funda silicona iPhone 16; Fundas; 3800; 12500; 10\nVidrio templado iPhone 16; Vidrios; 1300; 6800; 20"} />
          <div style={{ fontFamily: SF, fontSize: 12.5, color: validBulk.length ? SUCCESS : GRAY, margin: "10px 0" }}>{validBulk.length} líneas válidas de {parsed.length}.</div>
          <div style={{ display: "flex", gap: 8 }}><Btn testid="bulk-save" disabled={!validBulk.length} onClick={doBulk}>Cargar {validBulk.length || ""}</Btn><Btn variant="ghost" onClick={() => setBulk(false)}>Cancelar</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Clientes ----------
function ClientsPage({ data, user, persist, toast }) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const rows = data.clients.filter((c) => !q || `${c.name} ${c.phone} ${c.dni}`.toLowerCase().includes(q.toLowerCase()));
  const spent = (c) => activeSales(data).filter((s) => s.clientId === c.id).reduce((a, s) => a + s.totalUSD, 0);
  const [f, setF] = useState({ name: "", phone: "", dni: "", email: "", notes: "" });
  const open = (c) => { setF(c.id ? c : { name: "", phone: "", dni: "", email: "", notes: "" }); setEdit(c); };
  const save = () => {
    if (!f.name.trim()) return;
    if (f.id) persist({ ...data, clients: data.clients.map((c) => (c.id === f.id ? f : c)) });
    else persist(addLog({ ...data, clients: [...data.clients, { ...f, id: uid(), createdAt: todayStr() }] }, user.name, "Cliente nuevo", f.name));
    setEdit(null); toast("Cliente guardado");
  };
  const vc = view && data.clients.find((c) => c.id === view);
  return (
    <div>
      <PageHeader title="Clientes" subtitle="Historial de compras y canjes de cada cliente" action={<Btn onClick={() => open({})}>+ Nuevo cliente</Btn>} />
      <Card>
        <Input placeholder="Buscar por nombre, teléfono o DNI" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 12 }} />
        <Table rows={rows} empty="No hay clientes." onRow={(c) => setView(c.id)} cols={[
          { label: "Cliente", render: (c) => <b>{c.name}</b> }, { label: "Teléfono", render: (c) => c.phone || "-" }, { label: "DNI", render: (c) => c.dni || "-" },
          { label: "Compras", render: (c) => activeSales(data).filter((s) => s.clientId === c.id).length }, { label: "Total comprado", right: true, render: (c) => fmtUSD(spent(c)) },
        ]} />
      </Card>
      {edit && (
        <Modal title={f.id ? "Editar cliente" : "Nuevo cliente"} onClose={() => setEdit(null)} width={480}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Nombre"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Field label="WhatsApp"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="DNI"><Input value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value })} /></Field></div>
            <Field label="Notas"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 8 }}><Btn onClick={save} disabled={!f.name.trim()}>Guardar</Btn><Btn variant="ghost" onClick={() => setEdit(null)}>Cancelar</Btn></div>
          </div>
        </Modal>
      )}
      {vc && (
        <Modal title={vc.name} onClose={() => setView(null)} width={560}>
          <div style={{ fontFamily: SF, fontSize: 13, color: GRAY, marginBottom: 12 }}>{vc.phone} {vc.dni ? "· DNI " + vc.dni : ""} {vc.notes ? "· " + vc.notes : ""}</div>
          <Table rows={activeSales(data).filter((s) => s.clientId === vc.id)} empty="Sin compras todavía." cols={[
            { label: "Fecha", render: (s) => fmtDate(s.date) }, { label: "Detalle", render: (s) => s.lines.map((l) => l.desc).join(", ") }, { label: "Canje", render: (s) => (s.tradeIn ? deviceShort(s.tradeIn) : "") }, { label: "Total", right: true, render: (s) => fmtUSD(s.totalUSD) },
          ]} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>{vc.phone && <Btn href={waLink(vc.phone, `Hola ${vc.name.split(" ")[0]}! `)} variant="secondary">WhatsApp</Btn>}<Btn variant="secondary" onClick={() => { open(vc); setView(null); }}>Editar</Btn><Btn variant="ghost" onClick={() => setView(null)}>Cerrar</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Caja ----------
function ShiftReportModal({ data, shift, onClose }) {
  const cfg = data.config;
  const sales = data.sales.filter((s) => s.shiftId === shift.id && s.status === "Cerrada");
  const br = shift.breakdown || shiftBreakdown(data, shift);
  const html = () => `<h1>${cfg.storeName}</h1><div class="b">Cierre de caja ${shift.number}</div><div class="s">Apertura: ${fmtDateTime(shift.openedAt)} (${shift.openedBy})<br/>Cierre: ${fmtDateTime(shift.closedAt)} (${shift.closedBy})</div><hr/><table>${br.map((b) => `<tr><td>${b.method}</td><td class="r">${fmtCur(b.net, b.cur)}</td></tr>`).join("")}</table><hr/><table><tr><td>Efectivo ARS esperado</td><td class="r">${fmtARS(shift.expectedARS)}</td></tr><tr><td>Efectivo ARS contado</td><td class="r">${fmtARS(shift.countedARS)}</td></tr><tr><td class="b">Diferencia ARS</td><td class="r b">${fmtARS(shift.diffARS)}</td></tr><tr><td>Efectivo USD esperado</td><td class="r">${fmtUSD(shift.expectedUSD)}</td></tr><tr><td>Efectivo USD contado</td><td class="r">${fmtUSD(shift.countedUSD)}</td></tr><tr><td class="b">Diferencia USD</td><td class="r b">${fmtUSD(shift.diffUSD)}</td></tr></table>${shift.note ? `<hr/><div class="s">Nota: ${shift.note}</div>` : ""}<br/><br/><div class="s">Firma: ______________</div>`;
  const dtone = (n) => (n === 0 ? SUCCESS : RED);
  return (
    <Modal title={`Cierre ${shift.number}`} onClose={onClose} width={560}>
      <div data-testid="shift-report" style={{ fontFamily: SF, fontSize: 13, color: OFFWHITE, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ color: GRAY, fontSize: 12 }}>Abrió {shift.openedBy} {fmtDateTime(shift.openedAt)} · cerró {shift.closedBy} {fmtDateTime(shift.closedAt)}</div>
        <div style={{ fontFamily: SF, fontWeight: 600, margin: "8px 0 2px" }}>Por medio de pago</div>
        {br.map((b) => <Row key={b.method} label={`${b.method} (${b.inc ? "+" + fmtCur(b.inc, b.cur) : "0"}${b.out ? " / −" + fmtCur(b.out, b.cur) : ""})`} value={fmtCur(b.net, b.cur)} />)}
        <div style={{ fontFamily: SF, fontWeight: 600, margin: "10px 0 2px" }}>Arqueo de efectivo</div>
        <Row label="ARS esperado / contado" value={`${fmtARS(shift.expectedARS)} / ${fmtARS(shift.countedARS)}`} />
        <Row label="Diferencia ARS" value={fmtARS(shift.diffARS)} tone={dtone(shift.diffARS)} />
        <Row label="USD esperado / contado" value={`${fmtUSD(shift.expectedUSD)} / ${fmtUSD(shift.countedUSD)}`} />
        <Row label="Diferencia USD" value={fmtUSD(shift.diffUSD)} tone={dtone(shift.diffUSD)} />
        <Row label="Ventas del turno" value={`${sales.length} · ${fmtUSD(sales.reduce((a, s) => a + s.totalUSD, 0))}`} />
        {shift.note && <Notice>{shift.note}</Notice>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}><Btn onClick={() => printHTML("Cierre " + shift.number, html())}>Imprimir</Btn><Btn variant="ghost" onClick={onClose}>Cerrar</Btn></div>
    </Modal>
  );
}

function CashPage({ data, user, perms, persist, toast, role }) {
  const shift = openShiftOf(data);
  const lastClosed = [...data.shifts].filter((s) => s.status === "Cerrada").sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0];
  const [openARS, setOpenARS] = useState(lastClosed ? String(lastClosed.countedARS) : "0");
  const [openUSD, setOpenUSD] = useState(lastClosed ? String(lastClosed.countedUSD) : "0");
  const [moveModal, setMoveModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [report, setReport] = useState(null);
  const [mv, setMv] = useState({ type: "Egreso", concept: "Retiro a caja fuerte", method: "Efectivo ARS", amount: "" });
  const [cARS, setCARS] = useState("");
  const [cUSD, setCUSD] = useState("");
  const [note, setNote] = useState("");
  const blind = role === "Cajero";
  const lastId = lastClosed ? lastClosed.id : "";
  useEffect(() => { if (lastClosed) { setOpenARS(String(lastClosed.countedARS)); setOpenUSD(String(lastClosed.countedUSD)); } }, [lastId]); // eslint-disable-line

  const doOpen = () => {
    const s = { id: uid(), number: shiftNumber(data), openedAt: nowISO(), openedBy: user.name, openingARS: Number(openARS) || 0, openingUSD: Number(openUSD) || 0, status: "Abierta" };
    persist(addLog({ ...data, shifts: [...data.shifts, s] }, user.name, "Apertura de caja", `${s.number} · ${fmtARS(s.openingARS)} + ${fmtUSD(s.openingUSD)}`)); toast("Caja abierta");
  };
  const addMove = () => {
    const a = Number(mv.amount); if (!a || a <= 0) return;
    persist(addLog({ ...data, cashMoves: [...data.cashMoves, { id: uid(), shiftId: shift.id, ts: nowISO(), type: mv.type, concept: mv.concept, method: mv.method, currency: methodOf(mv.method).cur, amount: a, ref: null, by: user.name }] }, user.name, "Movimiento de caja", `${mv.type} ${fmtCur(a, methodOf(mv.method).cur)} · ${mv.concept}`));
    setMoveModal(false); setMv({ ...mv, amount: "" }); toast("Movimiento registrado");
  };
  const exp = shift ? cashExpected(data, shift) : { ars: 0, usd: 0 };
  const diffARS = (Number(cARS) || 0) - exp.ars, diffUSD = (Number(cUSD) || 0) - exp.usd;
  const needNote = (diffARS !== 0 || diffUSD !== 0) && cARS !== "" && cUSD !== "";
  const doClose = () => {
    const closed = { ...shift, status: "Cerrada", closedAt: nowISO(), closedBy: user.name, expectedARS: exp.ars, expectedUSD: exp.usd, countedARS: Number(cARS) || 0, countedUSD: Number(cUSD) || 0, diffARS, diffUSD, note: note.trim(), breakdown: shiftBreakdown(data, shift) };
    persist(addLog({ ...data, shifts: data.shifts.map((s) => (s.id === shift.id ? closed : s)) }, user.name, "Cierre de caja", `${shift.number}${diffARS || diffUSD ? " · con diferencia" : " · sin diferencias"}`));
    setCloseModal(false); setCARS(""); setCUSD(""); setNote(""); setReport(closed.id); toast("Caja cerrada");
  };
  const moves = shift ? data.cashMoves.filter((m) => m.shiftId === shift.id).sort((a, b) => b.ts.localeCompare(a.ts)) : [];
  const br = shift ? shiftBreakdown(data, shift) : [];
  const history = [...data.shifts].filter((s) => s.status === "Cerrada" && (perms.seeAllShifts || s.closedBy === user.name)).sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  const reportShift = report && data.shifts.find((s) => s.id === report);
  const concepts = ["Retiro a caja fuerte", "Gastos del local", "Pago a proveedor", "Adelanto", "Ingreso manual", "Otro"];
  return (
    <div>
      <PageHeader title="Caja" subtitle="Apertura, movimientos y cierre con arqueo por turno" action={shift && <div style={{ display: "flex", gap: 8 }}><Btn variant="secondary" testid="move-open" onClick={() => setMoveModal(true)}>+ Movimiento</Btn><Btn testid="close-open" onClick={() => setCloseModal(true)}>Cerrar caja</Btn></div>} />
      {!shift ? (
        <Card style={{ maxWidth: 520 }}>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Abrir caja</div>
          <div style={{ fontFamily: SF, fontSize: 13, color: GRAY, marginBottom: 14 }}>Contá el efectivo con el que arrancás el turno. {lastClosed ? "Cargamos lo que quedó en el último cierre." : ""}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Efectivo ARS"><Input data-testid="open-ars" type="number" value={openARS} onChange={(e) => setOpenARS(e.target.value)} /></Field>
            <Field label="Efectivo USD"><Input data-testid="open-usd" type="number" value={openUSD} onChange={(e) => setOpenUSD(e.target.value)} /></Field>
          </div>
          <Btn testid="open-confirm" onClick={doOpen} style={{ marginTop: 16 }}>Abrir caja</Btn>
        </Card>
      ) : (
        <>
          {dayOf(shift.openedAt) < todayStr() && <Notice tone="red" style={{ marginBottom: 14 }}>Esta caja se abrió el {fmtDate(shift.openedAt)}. Cerrala para empezar un turno nuevo.</Notice>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
            <MiniStat label={`Turno ${shift.number}`} value="Abierta" tone="good" sub={`${shift.openedBy} · desde ${fmtTime(shift.openedAt)}`} />
            {!blind && <MiniStat label="Efectivo ARS en caja" value={fmtARS(exp.ars)} />}
            {!blind && <MiniStat label="Efectivo USD en caja" value={fmtUSD(exp.usd)} />}
            <MiniStat label="Cobrado por transferencia / tarjeta / MP" value={fmtARS(br.filter((b) => !methodOf(b.method).cash).reduce((a, b) => a + b.net, 0))} />
          </div>
          {blind && <Notice style={{ marginBottom: 14 }}>Arqueo ciego: tu rol no ve el efectivo esperado hasta cerrar el turno.</Notice>}
          <Card>
            <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Movimientos del turno</div>
            <Table rows={moves} empty="Todavía no hay movimientos." cols={[
              { label: "Hora", render: (m) => fmtTime(m.ts) }, { label: "Concepto", render: (m) => m.concept }, { label: "Medio", render: (m) => m.method },
              { label: "Tipo", render: (m) => <Badge tone={m.type === "Ingreso" ? "green" : "red"}>{m.type}</Badge> },
              { label: "Monto", right: true, render: (m) => <span style={{ color: m.type === "Ingreso" ? SUCCESS : RED }}>{m.type === "Ingreso" ? "+" : "−"}{fmtCur(m.amount, m.currency)}</span> }, { label: "Por", render: (m) => m.by },
            ]} />
          </Card>
        </>
      )}
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Historial de cierres</div>
        <Table rows={history.slice(0, 12)} empty="Todavía no hay cierres." onRow={(s) => setReport(s.id)} cols={[
          { label: "Turno", render: (s) => s.number }, { label: "Fecha", render: (s) => fmtDate(s.closedAt) }, { label: "Abrió", render: (s) => s.openedBy }, { label: "Cerró", render: (s) => s.closedBy },
          { label: "Dif. ARS", right: true, render: (s) => <span style={{ color: s.diffARS ? RED : SUCCESS }}>{fmtARS(s.diffARS)}</span> }, { label: "Dif. USD", right: true, render: (s) => <span style={{ color: s.diffUSD ? RED : SUCCESS }}>{fmtUSD(s.diffUSD)}</span> },
          { label: "Estado", render: (s) => (s.diffARS || s.diffUSD ? <Badge tone="red">Con diferencia</Badge> : <Badge tone="green">Cuadra</Badge>) },
        ]} />
      </Card>
      {moveModal && (
        <Modal title="Movimiento de caja" onClose={() => setMoveModal(false)} width={460}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field label="Tipo"><Select data-testid="mv-type" value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })}><option>Egreso</option><option>Ingreso</option></Select></Field>
              <Field label="Medio"><Select data-testid="mv-method" value={mv.method} onChange={(e) => setMv({ ...mv, method: e.target.value })}>{METHODS.map((m) => <option key={m.id}>{m.id}</option>)}</Select></Field>
            </div>
            <Field label="Concepto"><Select value={mv.concept} onChange={(e) => setMv({ ...mv, concept: e.target.value })}>{concepts.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label={`Monto (${methodOf(mv.method).cur})`}><Input data-testid="mv-amount" type="number" value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 8 }}><Btn testid="mv-save" disabled={!Number(mv.amount)} onClick={addMove}>Registrar</Btn><Btn variant="ghost" onClick={() => setMoveModal(false)}>Cancelar</Btn></div>
          </div>
        </Modal>
      )}
      {closeModal && shift && (
        <Modal title={`Cerrar caja ${shift.number}`} onClose={() => setCloseModal(false)} width={500}>
          <div style={{ fontFamily: SF, fontSize: 13, color: GRAY, marginBottom: 12 }}>Contá el efectivo que hay físicamente en la caja.</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Efectivo ARS contado" hint={!blind ? `Esperado: ${fmtARS(exp.ars)}` : undefined}><Input data-testid="count-ars" type="number" value={cARS} onChange={(e) => setCARS(e.target.value)} /></Field>
            <Field label="Efectivo USD contado" hint={!blind ? `Esperado: ${fmtUSD(exp.usd)}` : undefined}><Input data-testid="count-usd" type="number" value={cUSD} onChange={(e) => setCUSD(e.target.value)} /></Field>
          </div>
          {!blind && cARS !== "" && cUSD !== "" && (
            <div data-testid="close-diff" style={{ fontFamily: SF, fontSize: 13, margin: "12px 0", color: diffARS || diffUSD ? RED : SUCCESS }}>{diffARS || diffUSD ? `Diferencia: ${fmtARS(diffARS)} / ${fmtUSD(diffUSD)}` : "La caja cuadra."}</div>
          )}
          {(needNote || blind) && <Field label={blind ? "Observaciones" : "Motivo de la diferencia (obligatorio)"} style={{ marginTop: 10 }}><Input data-testid="close-note" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Btn testid="close-confirm" disabled={cARS === "" || cUSD === "" || (!blind && needNote && !note.trim())} onClick={doClose}>Confirmar cierre</Btn><Btn variant="ghost" onClick={() => setCloseModal(false)}>Cancelar</Btn>
          </div>
        </Modal>
      )}
      {reportShift && <ShiftReportModal data={data} shift={reportShift} onClose={() => setReport(null)} />}
    </div>
  );
}

// ---------- Reportes ----------
function ReportsPage({ data, perms }) {
  const [period, setPeriod] = useState("30 días");
  const today = todayStr();
  const from = period === "Hoy" ? today : period === "7 días" ? addDays(today, -6) : period === "30 días" ? addDays(today, -29) : "0000-01-01";
  const sales = activeSales(data).filter((s) => dayOf(s.date) >= from);
  const rev = sales.reduce((a, s) => a + s.revenueUSD, 0), cost = sales.reduce((a, s) => a + s.costUSD, 0);
  const canjes = sales.filter((s) => s.tradeIn);
  const bySeller = data.users.filter((u) => ["Vendedor", "Encargado", "Administrador"].includes(u.role)).map((u) => {
    const ss = sales.filter((s) => s.sellerName === u.name);
    const r = ss.reduce((a, s) => a + s.revenueUSD, 0);
    return { id: u.id, name: u.name, n: ss.length, rev: r, profit: r - ss.reduce((a, s) => a + s.costUSD, 0), commission: r * (u.commission / 100) };
  }).filter((x) => x.n > 0);
  const cats = {};
  sales.forEach((s) => s.lines.forEach((l) => {
    const dev = l.kind === "device" ? data.devices.find((d) => d.id === l.refId) : null;
    const k = dev ? dev.kind : l.kind === "acc" ? "Accesorios" : "Servicios";
    cats[k] = (cats[k] || 0) + toUSD(l.unit * l.qty, l.currency, s.fx);
  }));
  const catRows = Object.entries(cats).map(([k, v]) => ({ id: k, k, v })).sort((a, b) => b.v - a.v);
  const exportSales = () => downloadCSV("ventas.csv", sales.map((s) => ({ Numero: s.number, Fecha: dayOf(s.date), Cliente: s.clientName, Vendedor: s.sellerName, TotalUSD: Math.round(s.totalUSD), CanjeUSD: Math.round(s.tradeInUSD), ...(perms.seeCost ? { GananciaUSD: Math.round(s.revenueUSD - s.costUSD) } : {}) })));
  return (
    <div>
      <PageHeader title="Reportes" subtitle="Ventas, ganancia y rendimiento por vendedor" action={<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><FilterPills options={["Hoy", "7 días", "30 días", "Todo"]} value={period} onChange={setPeriod} /><Btn variant="secondary" onClick={exportSales}>Exportar CSV</Btn></div>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <MiniStat label="Facturado" value={fmtUSD(rev)} tone="good" sub={`${sales.length} ventas`} />
        {perms.seeCost && <MiniStat label="Ganancia" value={fmtUSD(rev - cost)} sub={rev ? `Margen ${Math.round(((rev - cost) / rev) * 100)}%` : ""} />}
        <MiniStat label="Ticket promedio" value={fmtUSD(sales.length ? rev / sales.length : 0)} />
        <MiniStat label="Ventas con canje" value={canjes.length} sub={sales.length ? `${Math.round((canjes.length / sales.length) * 100)}% de las ventas` : ""} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <Card><div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Por vendedor</div>
          <Table rows={bySeller} empty="Sin ventas en el período." cols={[{ label: "Vendedor", render: (r) => r.name }, { label: "Ventas", render: (r) => r.n }, { label: "Facturado", right: true, render: (r) => fmtUSD(r.rev) }, ...(perms.seeCost ? [{ label: "Ganancia", right: true, render: (r) => fmtUSD(r.profit) }, { label: "Comisión", right: true, render: (r) => fmtUSD(r.commission) }] : [])]} /></Card>
        <Card><div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Por categoría</div>
          <Table rows={catRows} empty="Sin ventas en el período." cols={[{ label: "Categoría", render: (r) => r.k }, { label: "Facturado", right: true, render: (r) => fmtUSD(r.v) }, { label: "Peso", right: true, render: (r) => (rev ? Math.round((r.v / (rev + sales.reduce((a, s) => a + s.discountUSD, 0))) * 100) + "%" : "") }]} /></Card>
      </div>
    </div>
  );
}

// ---------- Usuarios y roles ----------
function UsersPage({ data, user, persist, toast }) {
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({});
  const admins = data.users.filter((u) => u.active && u.role === "Administrador");
  const open = (u) => { setF(u.id ? { ...u } : { name: "", role: "Vendedor", active: true, commission: 0, pin: "" }); setEdit(true); };
  const err = f.id && admins.length === 1 && admins[0].id === f.id && (f.role !== "Administrador" || !f.active) ? "Tiene que quedar al menos un administrador activo." : "";
  const save = () => {
    if (!f.name.trim() || err) return;
    const u = { ...f, commission: Number(f.commission) || 0 };
    persist(addLog({ ...data, users: f.id ? data.users.map((x) => (x.id === f.id ? u : x)) : [...data.users, { ...u, id: uid() }] }, user.name, f.id ? "Usuario editado" : "Usuario nuevo", `${u.name} (${u.role})`));
    setEdit(null); toast("Usuario guardado");
  };
  const matrix = [
    ["Ver costos y ganancia", [1, 1, 0, 0]], ["Vender y cobrar", [1, 1, 1, 1]], ["Descuentos sin tope", [1, 1, 0, 0]], ["Tomar canje sobre el valor sugerido", [1, 1, 0, 0]],
    ["Editar precios y stock", [1, 1, 0, 0]], ["Ingresar equipos", [1, 1, 0, 0]], ["Anular ventas", [1, 1, 0, 0]], ["Abrir y cerrar caja", [1, 1, 0, 1]],
    ["Ver todos los cierres", [1, 1, 0, 0]], ["Reportes", [1, 1, 0, 0]], ["Usuarios y configuración", [1, 0, 0, 0]],
  ];
  return (
    <div>
      <PageHeader title="Usuarios y roles" subtitle="Quién puede hacer qué en tu local" action={<Btn testid="user-new" onClick={() => open({})}>+ Nuevo usuario</Btn>} />
      <Card>
        <Table rows={data.users} cols={[
          { label: "Nombre", render: (u) => <b>{u.name}</b> }, { label: "Rol", render: (u) => <Badge tone={u.role === "Administrador" ? "green" : "neutral"}>{u.role}</Badge> },
          { label: "Comisión", render: (u) => (u.commission ? u.commission + "%" : "-") }, { label: "Estado", render: (u) => <Badge tone={u.active ? "green" : "gray"}>{u.active ? "Activo" : "Inactivo"}</Badge> },
          { label: "", render: (u) => <span onClick={() => open(u)} style={{ color: ACCENT, cursor: "pointer", fontSize: 12 }}>Editar</span> },
        ]} />
      </Card>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Permisos por rol</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SF, fontSize: 13 }}>
            <thead><tr><th style={{ textAlign: "left", padding: 8, color: GRAY, fontSize: 11.5 }}>Permiso</th>{ROLES.map((r) => <th key={r} style={{ padding: 8, color: GRAY, fontSize: 11.5 }}>{r}</th>)}</tr></thead>
            <tbody>{matrix.map(([label, v]) => <tr key={label} style={{ borderTop: `1px solid ${BORDER}` }}><td style={{ padding: 8 }}>{label}</td>{v.map((x, i) => <td key={i} style={{ textAlign: "center", padding: 8, color: x ? SUCCESS : GRAY }}>{x ? "✓" : "–"}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Actividad reciente</div>
        <Table rows={(data.log || []).slice(0, 15)} empty="Sin actividad." cols={[{ label: "Cuándo", render: (l) => fmtDateTime(l.ts) }, { label: "Usuario", render: (l) => l.user }, { label: "Acción", render: (l) => l.action }, { label: "Detalle", render: (l) => <span style={{ color: GRAY }}>{l.detail}</span> }]} />
      </Card>
      {edit && (
        <Modal title={f.id ? "Editar usuario" : "Nuevo usuario"} onClose={() => setEdit(null)} width={460}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Nombre"><Input data-testid="user-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Field label="Rol"><Select data-testid="user-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
              <Field label="Comisión (%)"><Input type="number" value={f.commission} onChange={(e) => setF({ ...f, commission: e.target.value })} /></Field>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: SF, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Usuario activo</label>
            {err && <Notice tone="red">{err}</Notice>}
            <div style={{ display: "flex", gap: 8 }}><Btn testid="user-save" disabled={!f.name || !!err} onClick={save}>Guardar</Btn><Btn variant="ghost" onClick={() => setEdit(null)}>Cancelar</Btn></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Configuración ----------
function ConfigPage({ data, user, persist, toast, loadDemo, clearAll }) {
  const [c, setC] = useState(data.config);
  const up = (k, v) => setC({ ...c, [k]: v });
  const setBase = (i, patch) => setC({ ...c, baseValues: c.baseValues.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const save = () => { persist(addLog({ ...data, config: { ...c, fx: Number(c.fx) || 1, targetMargin: Number(c.targetMargin) || 0 } }, user.name, "Configuración", "Se actualizaron los parámetros")); toast("Configuración guardada"); };
  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos del local, cotización y tabla de tasación" action={<Btn testid="cfg-save" onClick={save}>Guardar cambios</Btn>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
        <Card>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Local y comprobantes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Nombre del local"><Input value={c.storeName} onChange={(e) => up("storeName", e.target.value)} /></Field>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Field label="CUIT"><Input value={c.cuit} onChange={(e) => up("cuit", e.target.value)} /></Field><Field label="Teléfono"><Input value={c.phone} onChange={(e) => up("phone", e.target.value)} /></Field></div>
            <Field label="Dirección"><Input value={c.address} onChange={(e) => up("address", e.target.value)} /></Field>
          </div>
        </Card>
        <Card>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Reglas comerciales</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Cotización dólar (ARS)"><Input data-testid="cfg-fx" type="number" value={c.fx} onChange={(e) => up("fx", e.target.value)} /></Field>
            <Field label="Margen objetivo de reventa"><Input type="number" step="0.01" value={c.targetMargin} onChange={(e) => up("targetMargin", e.target.value)} /></Field>
            <Field label="Descuento máx. vendedor (%)"><Input type="number" value={c.maxDiscountSeller} onChange={(e) => up("maxDiscountSeller", Number(e.target.value))} /></Field>
            <Field label="Garantía nuevos (días)"><Input type="number" value={c.warrantyNew} onChange={(e) => up("warrantyNew", Number(e.target.value))} /></Field>
            <Field label="Garantía usados (días)"><Input type="number" value={c.warrantyUsed} onChange={(e) => up("warrantyUsed", Number(e.target.value))} /></Field>
          </div>
        </Card>
      </div>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Tabla de tasación (valores de referencia en USD)</div>
        <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY, marginBottom: 12 }}>Es la base del plan canje y de la compra de usados. Actualizala cuando cambie el mercado.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {c.baseValues.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontFamily: SF, fontSize: 13 }}>
              <div style={{ flex: 1 }}>{r.model} <span style={{ color: GRAY }}>{r.capacity}GB</span></div>
              <Input type="number" value={r.value} onChange={(e) => setBase(i, { value: Number(e.target.value) || 0 })} style={{ width: 80 }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16, fontFamily: SF, fontSize: 13 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ color: GRAY, fontSize: 12, marginBottom: 8 }}>Descuento por defecto (USD)</div>
            {DEFECTS.map((d) => <div key={d} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}><span>{d}</span><Input type="number" value={c.defectCosts[d]} onChange={(e) => setC({ ...c, defectCosts: { ...c.defectCosts, [d]: Number(e.target.value) || 0 } })} style={{ width: 80 }} /></div>)}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: GRAY, fontSize: 12, marginBottom: 8 }}>Multiplicador por condición</div>
            {Object.keys(c.condMult).map((k) => <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}><span>{k}</span><Input type="number" step="0.01" value={c.condMult[k]} onChange={(e) => setC({ ...c, condMult: { ...c.condMult, [k]: Number(e.target.value) || 0 } })} style={{ width: 80 }} /></div>)}
          </div>
        </div>
      </Card>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Datos</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Btn variant="secondary" testid="cfg-demo" onClick={loadDemo}>Cargar datos demo</Btn><Btn variant="danger" onClick={clearAll}>Borrar todos los datos</Btn></div>
      </Card>
    </div>
  );
}

// ================= CATÁLOGO ONLINE (link para Instagram) =================
const DEFAULT_CATALOG = { published: true, whatsapp: "", headline: "Tu próximo iPhone, al mejor precio", tagline: "Equipos nuevos y usados con garantía, y plan canje.", showAccessories: true, hidden: [], featured: [], photos: {}, clicks: [], assistantOn: true, assistantName: "Asistente", greeting: "", endpoint: "", chats: [] };
const AP = { bg: "#FBFBFD", surface: "#F5F5F7", text: "#1D1D1F", sub: "#6E6E73", line: "#D2D2D7", blue: "#0071E3", blueHover: "#0077ED", link: "#0066CC", dark: "#1D1D1F", green: "#248A3D", orange: "#B25000" };
const APPLE_FONT = SF;
const COLOR_HEX = { Negro: "#2E2E30", Blanco: "#F0F0F0", Plata: "#D9DADC", Azul: "#9DB7D0", Rojo: "#BF2C3A", Verde: "#B3CBB6", Rosa: "#F2CFD6", "Titanio natural": "#BDB3A6", "Titanio negro": "#3E3E41", Dorado: "#E3CFA8" };

function catalogOf(data) { return { ...DEFAULT_CATALOG, ...(data.catalog || {}) }; }
function catalogUrl(preview) { return `${window.location.origin}${window.location.pathname}#/catalogo${preview ? "?preview=1" : ""}`; }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
}

function DeviceArt({ kind, color, photo, rounded = 0 }) {
  if (photo) return <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: rounded }} />;
  const hex = COLOR_HEX[color] || "#BDBDBD", dark = shade(hex, -38), light = shade(hex, 22);
  let body;
  if (kind === "iPad") body = (<g><rect x="20" y="16" width="80" height="88" rx="9" fill={hex} /><rect x="24" y="20" width="72" height="80" rx="6" fill="#111" /><rect x="24" y="20" width="72" height="80" rx="6" fill="url(#sheen)" /></g>);
  else if (kind === "Mac") body = (<g><rect x="24" y="30" width="72" height="46" rx="4" fill={hex} /><rect x="27" y="33" width="66" height="40" rx="2" fill="#111" /><path d="M12 78h96l-6 7H18z" fill={dark} /></g>);
  else if (kind === "Watch") body = (<g><rect x="46" y="8" width="28" height="22" rx="6" fill={dark} /><rect x="46" y="90" width="28" height="22" rx="6" fill={dark} /><rect x="36" y="28" width="48" height="64" rx="14" fill={hex} /><rect x="40" y="32" width="40" height="56" rx="11" fill="#111" /><rect x="84" y="46" width="4" height="12" rx="2" fill={dark} /></g>);
  else if (kind === "AirPods") body = (<g><rect x="34" y="40" width="52" height="46" rx="16" fill={hex} /><path d="M34 60h52" stroke={dark} strokeWidth="1.5" /><circle cx="60" cy="72" r="3" fill={dark} /><rect x="42" y="14" width="12" height="30" rx="6" fill="#fff" stroke={light} /><rect x="66" y="14" width="12" height="30" rx="6" fill="#fff" stroke={light} /></g>);
  else body = (<g><rect x="34" y="8" width="52" height="104" rx="13" fill={hex} /><rect x="34" y="8" width="52" height="104" rx="13" fill="url(#sheen)" /><rect x="39" y="13" width="23" height="23" rx="7" fill={dark} /><circle cx="46" cy="20" r="4.2" fill="#15151a" /><circle cx="55" cy="29" r="4.2" fill="#15151a" /><circle cx="46" cy="30" r="2" fill="#15151a" /><circle cx="73" cy="20" r="3" fill={light} opacity=".9" /></g>);
  return (
    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }} aria-hidden="true">
      <defs><linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></linearGradient></defs>
      <ellipse cx="60" cy="112" rx="30" ry="3.2" fill="#000" opacity=".08" />
      {body}
    </svg>
  );
}

function PublicCatalog({ data, persist }) {
  const cfg = data.config, cat = catalogOf(data);
  const preview = window.location.hash.includes("preview=1");
  const [kind, setKind] = useState("Todos");
  const [cond, setCond] = useState("Todos");
  const [sort, setSort] = useState("destacados");
  const [sel, setSel] = useState(null);
  const wa = (cat.whatsapp || cfg.phone || "").replace(/[^\d]/g, "");
  const hasWa = wa.length >= 8;
  const go = (text, itemId, label) => {
    persist({ ...data, catalog: { ...cat, clicks: [...(cat.clicks || []), { ts: nowISO(), itemId: itemId || "general", label: label || "Consulta general" }].slice(-500) } });
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const featuredSet = new Set(cat.featured);
  const devices = data.devices.filter((d) => d.status === "Disponible" && !cat.hidden.includes(d.id));
  const kindsPresent = KINDS.filter((k) => devices.some((d) => d.kind === k));
  const accs = cat.showAccessories ? data.accessories.filter((a) => a.stock > 0 && !cat.hidden.includes(a.id)) : [];
  const chips = ["Todos", ...kindsPresent, ...(accs.length ? ["Accesorios"] : [])];
  let list = devices.filter((d) => (kind === "Todos" || kind === d.kind) && (cond === "Todos" || (cond === "Nuevos" ? d.condition === "Nuevo sellado" : d.condition !== "Nuevo sellado")));
  list = [...list].sort((a, b) => {
    if (sort === "menor") return a.price - b.price;
    if (sort === "mayor") return b.price - a.price;
    const fa = featuredSet.has(a.id) ? 0 : 1, fb = featuredSet.has(b.id) ? 0 : 1;
    return fa - fb || b.entryDate.localeCompare(a.entryDate);
  });
  const showDevices = kind !== "Accesorios";
  const showAcc = kind === "Todos" || kind === "Accesorios";
  const sub = (d) => (d.condition === "Nuevo sellado" ? "Nuevo sellado" : `${d.condition}${d.battery ? " · Batería " + d.battery + "%" : ""}`);
  const askDevice = (d) => `Hola! Vi el ${deviceTitle(d)} (${d.condition}) a ${fmtUSD(d.price)} en el catálogo de ${cfg.storeName}. ¿Sigue disponible?`;
  const askTrade = (d) => `Hola! Quiero cotizar mi equipo en plan canje${d ? " para llevarme el " + deviceTitle(d) : ""}. Mi equipo es: `;

  if (!cat.published && !preview) {
    return <div style={{ background: AP.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: APPLE_FONT, color: AP.text, textAlign: "center", padding: 24 }}><div><div style={{ fontSize: 28, fontWeight: 600 }}>{cfg.storeName}</div><div style={{ color: AP.sub, marginTop: 8 }}>Estamos actualizando el catálogo. Volvemos pronto.</div></div></div>;
  }
  const pill = { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 980, padding: "11px 22px", fontSize: 15, fontWeight: 500, cursor: "pointer", border: "none", fontFamily: APPLE_FONT, textDecoration: "none" };
  return (
    <div data-testid="public-catalog" style={{ background: AP.bg, color: AP.text, fontFamily: APPLE_FONT, minHeight: "100vh", WebkitFontSmoothing: "antialiased" }}>
      <style>{`body{margin:0;background:${AP.bg}} *{box-sizing:border-box} .apc-card{transition:transform .2s, box-shadow .2s} .apc-card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,.08)} .apc-scroll::-webkit-scrollbar{display:none}`}</style>
      {preview && <div style={{ background: AP.dark, color: "#fff", fontSize: 12.5, padding: "8px 16px", textAlign: "center" }}>Vista previa del catálogo · <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = ""; }} style={{ color: "#64A9FF" }}>Volver al panel</a></div>}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(251,251,253,0.82)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)", borderBottom: `1px solid ${AP.line}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>{cfg.storeName}</div>
          {hasWa && <a onClick={() => go("Hola! Quiero hacer una consulta.", "general", "Consulta general")} style={{ color: AP.link, fontSize: 14, cursor: "pointer" }}>Escribinos</a>}
        </div>
      </header>

      <section style={{ textAlign: "center", padding: "56px 20px 28px", maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(34px, 7vw, 56px)", lineHeight: 1.07, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>{cat.headline}</h1>
        <p style={{ fontSize: "clamp(17px, 3.2vw, 21px)", color: AP.sub, margin: "14px auto 0", lineHeight: 1.4 }}>{cat.tagline}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 26, flexWrap: "wrap" }}>
          <a href="#catalogo-lista" onClick={(e) => { e.preventDefault(); document.getElementById("catalogo-lista")?.scrollIntoView({ behavior: "smooth" }); }} style={{ ...pill, background: AP.blue, color: "#fff" }}>Ver equipos</a>
          {hasWa && <a data-testid="cat-trade-hero" onClick={() => go(askTrade(null), "canje", "Plan canje")} style={{ ...pill, background: "transparent", color: AP.link }}>Cotizar mi equipo ›</a>}
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 20px 0" }}>
        <div style={{ background: AP.surface, borderRadius: 24, padding: "22px 24px", display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em" }}>Plan canje</div>
            <div style={{ color: AP.sub, fontSize: 15, marginTop: 4 }}>Entregá tu iPhone usado y pagá solo la diferencia. Lo tasamos en el momento.</div>
          </div>
          {hasWa && <a onClick={() => go(askTrade(null), "canje", "Plan canje")} style={{ ...pill, background: AP.blue, color: "#fff" }}>Cotizar mi equipo</a>}
        </div>
      </section>

      <section id="catalogo-lista" style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px 0" }}>
        <div className="apc-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
          {chips.map((c) => <div key={c} data-testid={`cat-chip-${c}`} onClick={() => setKind(c)} style={{ flex: "none", padding: "8px 16px", borderRadius: 980, fontSize: 14, cursor: "pointer", background: kind === c ? AP.dark : AP.surface, color: kind === c ? "#fff" : AP.text, fontWeight: 500 }}>{c}</div>)}
        </div>
        {showDevices && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: AP.surface, borderRadius: 980, padding: 3 }}>
              {["Todos", "Nuevos", "Usados"].map((c) => <div key={c} data-testid={`cat-cond-${c}`} onClick={() => setCond(c)} style={{ padding: "6px 16px", borderRadius: 980, fontSize: 13.5, cursor: "pointer", background: cond === c ? "#fff" : "transparent", boxShadow: cond === c ? "0 1px 3px rgba(0,0,0,.12)" : "none", fontWeight: 500 }}>{c}</div>)}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ border: "none", background: AP.surface, borderRadius: 980, padding: "8px 14px", fontSize: 13.5, fontFamily: APPLE_FONT, color: AP.text }}>
              <option value="destacados">Destacados</option><option value="menor">Menor precio</option><option value="mayor">Mayor precio</option>
            </select>
          </div>
        )}

        {showDevices && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 210px), 1fr))", gap: 16, marginTop: 20 }}>
            {list.map((d) => (
              <div key={d.id} className="apc-card" data-testid="cat-item" onClick={() => setSel({ type: "device", item: d })} style={{ background: "#fff", border: `1px solid ${AP.line}`, borderRadius: 22, overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column" }}>
                <div style={{ aspectRatio: "1 / 0.92", background: AP.surface, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", padding: cat.photos[d.id] ? 0 : 26 }}>
                  <DeviceArt kind={d.kind} color={d.color} photo={cat.photos[d.id]} />
                  {featuredSet.has(d.id) && <span style={{ position: "absolute", top: 12, left: 12, background: AP.orange, color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 980 }}>Destacado</span>}
                </div>
                <div style={{ padding: "14px 16px 18px", display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{deviceShort(d)}</div>
                  <div style={{ fontSize: 13, color: AP.sub, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: COLOR_HEX[d.color] || "#ccc", border: "1px solid rgba(0,0,0,.15)", display: "inline-block" }} />{d.color}</div>
                  <div style={{ fontSize: 13, color: d.condition === "Nuevo sellado" ? AP.green : AP.sub }}>{sub(d)}</div>
                  <div style={{ marginTop: "auto", paddingTop: 10 }}>
                    <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em" }}>{fmtUSD(d.price)}</div>
                    <div style={{ fontSize: 12.5, color: AP.sub }}>≈ {fmtARS(d.price * cfg.fx)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {showDevices && list.length === 0 && <div style={{ textAlign: "center", color: AP.sub, padding: "50px 0" }}>No hay equipos con ese filtro por ahora. Escribinos y te avisamos cuando entre uno.</div>}

        {showAcc && accs.length > 0 && (
          <div style={{ marginTop: 44 }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 16px" }}>Accesorios</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 250px), 1fr))", gap: 12 }}>
              {accs.map((a) => (
                <div key={a.id} data-testid="cat-acc" onClick={() => setSel({ type: "acc", item: a })} className="apc-card" style={{ background: "#fff", border: `1px solid ${AP.line}`, borderRadius: 18, padding: "16px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div><div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{a.name}</div><div style={{ fontSize: 12.5, color: AP.sub, marginTop: 2 }}>{a.category}</div></div>
                  <div style={{ fontWeight: 600, fontSize: 16, whiteSpace: "nowrap" }}>{fmtARS(a.price)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <footer style={{ background: AP.surface, marginTop: 64, padding: "36px 20px 48px", fontSize: 12.5, color: AP.sub, lineHeight: 1.6 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ color: AP.text, fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{cfg.storeName}</div>
          <div>{cfg.address}</div>
          <div style={{ marginTop: 10 }}>Precios de equipos en dólares, con equivalente en pesos a la cotización del día (US$ 1 = {fmtARS(cfg.fx)}). Sujetos a cambios y disponibilidad. Garantía: {cfg.warrantyNew} días en equipos nuevos y {cfg.warrantyUsed} días en usados. Los equipos usados fueron revisados y tienen iCloud libre.</div>
        </div>
      </footer>

      {sel && (
        <div onClick={() => setSel(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", backdropFilter: "blur(6px)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="cat-sheet" style={{ background: "#fff", width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", borderRadius: "28px 28px 0 0", padding: "8px 24px 28px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><span onClick={() => setSel(null)} style={{ cursor: "pointer", fontSize: 26, color: AP.sub, lineHeight: 1, padding: 8 }}>×</span></div>
            {sel.type === "device" ? (() => {
              const d = sel.item;
              return (
                <div>
                  <div style={{ background: AP.surface, borderRadius: 22, aspectRatio: "1 / 0.7", display: "flex", alignItems: "center", justifyContent: "center", padding: cat.photos[d.id] ? 0 : 28, overflow: "hidden" }}><DeviceArt kind={d.kind} color={d.color} photo={cat.photos[d.id]} rounded={22} /></div>
                  <h2 style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.025em", margin: "20px 0 4px" }}>{deviceShort(d)}</h2>
                  <div style={{ fontSize: 15, color: AP.sub }}>{d.color} · {d.condition}</div>
                  <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 14 }}>{fmtUSD(d.price)} <span style={{ fontSize: 15, color: AP.sub, fontWeight: 400 }}>≈ {fmtARS(d.price * cfg.fx)}</span></div>
                  <div style={{ marginTop: 18, borderTop: `1px solid ${AP.line}` }}>
                    {[["Condición", d.condition], ...(d.condition !== "Nuevo sellado" && d.battery ? [["Salud de batería", d.battery + "%"]] : []), ["Garantía", d.warrantyDays + " días"], ["iCloud", "Libre, listo para usar"]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${AP.line}`, fontSize: 15 }}><span style={{ color: AP.sub }}>{k}</span><span>{v}</span></div>)}
                  </div>
                  {hasWa ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
                      <a data-testid="cat-ask" onClick={() => go(askDevice(d), d.id, deviceShort(d))} style={{ ...pill, background: AP.blue, color: "#fff", padding: "14px 22px" }}>Consultar por WhatsApp</a>
                      <a onClick={() => go(askTrade(d), d.id, deviceShort(d) + " (canje)")} style={{ ...pill, background: AP.surface, color: AP.link, padding: "14px 22px" }}>Pagarlo con plan canje</a>
                    </div>
                  ) : <div style={{ marginTop: 20, color: AP.sub, fontSize: 14 }}>Escribinos al {cfg.phone}.</div>}
                </div>
              );
            })() : (() => {
              const a = sel.item;
              return (
                <div>
                  <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", margin: "8px 0 4px" }}>{a.name}</h2>
                  <div style={{ fontSize: 15, color: AP.sub }}>{a.category}</div>
                  <div style={{ fontSize: 30, fontWeight: 600, marginTop: 14 }}>{fmtARS(a.price)}</div>
                  {hasWa && <a onClick={() => go(`Hola! Quiero consultar por: ${a.name} (${fmtARS(a.price)}).`, a.id, a.name)} style={{ ...pill, background: AP.blue, color: "#fff", padding: "14px 22px", marginTop: 22, width: "100%" }}>Consultar por WhatsApp</a>}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      {cat.assistantOn !== false && (preview || cat.published) && <AssistantChat data={data} persist={persist} cat={cat} cfg={cfg} devicesAvail={devices} accAvail={accs} onOpenDevice={(d) => setSel({ type: "device", item: d })} hasWa={hasWa} openWA={go} />}
    </div>
  );
}

// ---------- panel de administración del catálogo ----------
function resizeImage(file, max = 720) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function CatalogAdmin({ data, user, persist, toast }) {
  const cat = catalogOf(data);
  const [f, setF] = useState({ whatsapp: cat.whatsapp || "", headline: cat.headline, tagline: cat.tagline });
  const [a, setA] = useState({ assistantName: cat.assistantName || "Asistente", greeting: cat.greeting || "", endpoint: cat.endpoint || "" });
  const url = catalogUrl(false);
  const devices = data.devices.filter((d) => d.status === "Disponible");
  const week = addDays(todayStr(), -6);
  const clicks = (cat.clicks || []).filter((c) => dayOf(c.ts) >= week);
  const clicksBy = {}; (cat.clicks || []).forEach((c) => { clicksBy[c.itemId] = (clicksBy[c.itemId] || 0) + 1; });
  const setCat = (patch, msg) => { persist({ ...data, catalog: { ...cat, ...patch } }); if (msg) toast(msg); };
  const toggle = (key, id) => { const set = new Set(cat[key]); set.has(id) ? set.delete(id) : set.add(id); setCat({ [key]: [...set] }); };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast("Link copiado"); } catch { toast("Copialo manualmente"); } };
  const photo = async (id, file) => { if (!file) return; try { const url2 = await resizeImage(file); setCat({ photos: { ...cat.photos, [id]: url2 } }, "Foto guardada"); } catch { toast("No se pudo cargar la foto"); } };
  const visible = devices.filter((d) => !cat.hidden.includes(d.id)).length;
  const sw = (on, onClick, testid) => <div data-testid={testid} onClick={onClick} style={{ width: 38, height: 22, borderRadius: 11, background: on ? "#34C759" : "#E9E9EA", position: "relative", cursor: "pointer" }}><div style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .15s" }} /></div>;
  return (
    <div>
      <PageHeader title="Catálogo online" subtitle="Un link para la bio de Instagram: tus equipos disponibles, siempre actualizados desde el stock"
        action={<div style={{ display: "flex", gap: 8 }}><Btn variant="secondary" testid="cat-preview" onClick={() => { window.location.hash = "#/catalogo?preview=1"; }}>Ver catálogo</Btn><Btn testid="cat-copy" onClick={copy}>Copiar link</Btn></div>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <MiniStat label="Estado" value={cat.published ? "Publicado" : "Pausado"} tone={cat.published ? "good" : "warn"} />
        <MiniStat label="Equipos visibles" value={`${visible} de ${devices.length}`} />
        <MiniStat label="Consultas (7 días)" value={clicks.length} sub="Toques en WhatsApp" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: SF, fontSize: 12, color: GRAY, marginBottom: 6 }}>Tu link</div>
        <div data-testid="cat-url" style={{ fontFamily: SF, fontSize: 15, color: ACCENT, wordBreak: "break-all" }}>{url}</div>
        <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY, marginTop: 8 }}>Pegalo en la bio de Instagram. En la versión online, cada visita ve el stock real y no necesita instalar nada.</div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginBottom: 16, alignItems: "start" }}>
        <Card>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Textos y contacto</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Título"><Input data-testid="cat-headline" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></Field>
            <Field label="Subtítulo"><Input value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></Field>
            <Field label="WhatsApp de ventas" hint="Con código de país, por ejemplo 5492615550000. Si lo dejás vacío se usa el teléfono del local."><Input data-testid="cat-wa" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} /></Field>
            <Btn testid="cat-save" onClick={() => setCat({ whatsapp: f.whatsapp.trim(), headline: f.headline, tagline: f.tagline }, "Textos guardados")} style={{ alignSelf: "flex-start" }}>Guardar</Btn>
          </div>
        </Card>
        <Card>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Opciones</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: SF, fontSize: 13.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>Catálogo publicado</span>{sw(cat.published, () => setCat({ published: !cat.published }, cat.published ? "Catálogo pausado" : "Catálogo publicado"), "cat-published")}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>Mostrar accesorios</span>{sw(cat.showAccessories, () => setCat({ showAccessories: !cat.showAccessories }), "cat-acc-toggle")}</div>
            <div style={{ color: GRAY, fontSize: 12 }}>El catálogo nunca muestra costos, IMEI ni datos de clientes. Los equipos vendidos, reservados o en reparación se ocultan solos.</div>
          </div>
        </Card>
      </div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15 }}>Asistente de chat</div>
          {sw(cat.assistantOn !== false, () => setCat({ assistantOn: cat.assistantOn === false }, cat.assistantOn === false ? "Asistente activado" : "Asistente desactivado"), "assist-toggle")}
        </div>
        <div style={{ fontFamily: SF, fontSize: 12.5, color: GRAY, marginBottom: 12 }}>Responde con tu stock real, cotiza el plan canje paso a paso y deriva a WhatsApp. Por defecto usa un motor simulado; si cargás la URL de un servidor con IA, usa ese.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <Field label="Nombre del asistente"><Input data-testid="assist-name" value={a.assistantName} onChange={(e) => setA({ ...a, assistantName: e.target.value })} /></Field>
          <Field label="Saludo inicial" hint="Vacío = saludo por defecto."><Input data-testid="assist-greeting" value={a.greeting} onChange={(e) => setA({ ...a, greeting: e.target.value })} /></Field>
          <Field label="URL del servidor de IA (opcional)" hint="POST {store, messages} → {reply, handoff?, deviceIds?}"><Input data-testid="assist-endpoint" value={a.endpoint} onChange={(e) => setA({ ...a, endpoint: e.target.value })} placeholder="https://..." /></Field>
        </div>
        <Btn testid="assist-save" onClick={() => setCat({ assistantName: a.assistantName.trim() || "Asistente", greeting: a.greeting.trim(), endpoint: a.endpoint.trim() }, "Asistente guardado")} style={{ marginTop: 12 }}>Guardar asistente</Btn>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 13.5, margin: "18px 0 6px" }}>Últimas conversaciones ({(cat.chats || []).length})</div>
        <Table rows={[...(cat.chats || [])].reverse().slice(0, 10)} empty="Todavía no hubo conversaciones." cols={[
          { label: "Fecha", render: (c) => new Date(c.ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) },
          { label: "Tema", render: (c) => c.topic },
          { label: "Último mensaje", render: (c) => <span style={{ color: GRAY }}>{c.last}</span> },
          { label: "Msgs", right: true, render: (c) => c.msgs },
          { label: "Asesor", render: (c) => c.handoff ? <Badge tone="good">Derivado</Badge> : "—" },
        ]} />
      </Card>
      <Card>
        <div style={{ fontFamily: SF, fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Equipos del catálogo</div>
        <Table rows={devices} empty="No hay equipos disponibles en stock." cols={[
          { label: "Foto", render: (d) => (
            <label style={{ cursor: "pointer", display: "inline-block" }}>
              <div style={{ width: 46, height: 46, borderRadius: 8, overflow: "hidden", background: "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center", padding: cat.photos[d.id] ? 0 : 5 }}><DeviceArt kind={d.kind} color={d.color} photo={cat.photos[d.id]} /></div>
              <input data-testid={`photo-${d.id}`} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => photo(d.id, e.target.files[0])} />
            </label>) },
          { label: "Equipo", render: (d) => <div><b>{deviceShort(d)}</b><div style={{ color: GRAY, fontSize: 11.5 }}>{d.color} · {d.condition}</div></div> },
          { label: "Precio", right: true, render: (d) => fmtUSD(d.price) },
          { label: "Consultas", right: true, render: (d) => clicksBy[d.id] || 0 },
          { label: "Destacado", render: (d) => sw(cat.featured.includes(d.id), () => toggle("featured", d.id), `feat-${d.id}`) },
          { label: "Visible", render: (d) => sw(!cat.hidden.includes(d.id), () => toggle("hidden", d.id), `vis-${d.id}`) },
        ]} />
        <div style={{ fontFamily: SF, fontSize: 12, color: GRAY, marginTop: 10 }}>Tocá la miniatura para subir una foto real del equipo. Sin foto se muestra una ilustración del color.</div>
      </Card>
    </div>
  );
}

// ================= ASISTENTE DE CHAT (catálogo) =================
// Motor simulado: responde con datos reales del stock. Si el catálogo tiene un "endpoint" configurado,
// se le envía la conversación a ese servidor (donde corre la IA real) y se usa su respuesta.
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const r5 = (n) => Math.round(n / 5) * 5;

function parseIphoneModel(t) {
  const hasWord = /iphone|iph\b/.test(t);
  const m = t.match(/(?:iphone\s*|iph\s*)?\b(1[1-6])\b\s*(pro\s*max|pro|plus|mini)?/);
  if (!m) return null;
  const variant = (m[2] || "").replace(/\s+/g, " ").trim();
  if (!hasWord && !variant) return null;
  const v = variant === "pro max" ? " Pro Max" : variant === "pro" ? " Pro" : variant === "plus" ? " Plus" : variant === "mini" ? " Mini" : "";
  return "iPhone " + m[1] + v;
}
function parseKind(t) {
  if (/ipad|tablet/.test(t)) return "iPad";
  if (/macbook|\bmac\b|notebook|laptop/.test(t)) return "Mac";
  if (/watch|reloj/.test(t)) return "Watch";
  if (/airpod|auricular/.test(t) && !/con cable/.test(t)) return "AirPods";
  if (/iphone|celu|celular|telefono/.test(t) || parseIphoneModel(t)) return "iPhone";
  return null;
}
function parseCap(t) {
  if (/\b1\s*tb\b/.test(t)) return 1024;
  const m = t.match(/\b(64|128|256|512)\s*(?:gb|g\b)?/);
  return m ? Number(m[1]) : null;
}
function parseBattery(t) {
  let m = t.match(/(?:bateria|bat)\D{0,10}(\d{2,3})/); if (!m) m = t.match(/\b(\d{2,3})\s*%/);
  if (!m) return null; const n = Number(m[1]); return n >= 40 && n <= 100 ? n : null;
}
function parseDefects(t) {
  const d = [];
  if (/pantalla.{0,12}(rota|quebrad|trizad|daniad|astillad)|(rota|trizada|quebrada).{0,12}pantalla/.test(t)) d.push("Pantalla dañada");
  if (/tapa.{0,12}(rota|trizad|quebrad)/.test(t)) d.push("Tapa trasera rota");
  return d;
}
function parseCond(t, awaiting) {
  if (awaiting && /^\s*1\s*$/.test(t)) return { cond: "Usado A", defects: [] };
  if (awaiting && /^\s*2\s*$/.test(t)) return { cond: "Usado B", defects: [] };
  if (awaiting && /^\s*3\s*$/.test(t)) return { cond: "Usado B", defects: ["Pantalla dañada"] };
  if (/impecable|perfecto|como nuevo|sin marcas|sin rayon|excelente|impecabl/.test(t)) return { cond: "Usado A", defects: [] };
  if (/rayon|marca|detalle|golpe|desgaste|usado|bueno|normal|regular/.test(t)) return { cond: "Usado B", defects: parseDefects(t) };
  const df = parseDefects(t); if (df.length) return { cond: "Usado B", defects: df };
  return null;
}

function findDevices(ctx, { kind, model, cap }) {
  return ctx.devices.filter((d) => {
    if (kind && d.kind !== kind) return false;
    if (model && norm(d.model) !== norm(model)) return false;
    if (cap && d.capacity !== cap) return false;
    return true;
  }).sort((a, b) => (ctx.featured.includes(b.id) ? 1 : 0) - (ctx.featured.includes(a.id) ? 1 : 0) || a.price - b.price);
}

function assistantStep(input, st, ctx) {
  const t = norm(input), cfg = ctx.cfg, out = [];
  const s = { ...st, draft: { ...(st.draft || {}) }, userMsgs: [...(st.userMsgs || []), input].slice(-6) };
  const say = (text, extra = {}) => out.push({ text, ...extra });
  const handoffChip = "Hablar con un asesor";
  const handoff = (text) => { s.topic = s.topic || "Derivado"; say(text, { handoff: true }); };
  const kind = parseKind(t), model = parseIphoneModel(t), cap = parseCap(t);

  if (/asesor|persona|humano|vendedor|hablar con|llamen|llamar/.test(t)) {
    handoff("Dale, te paso con una persona del equipo por WhatsApp. Ya le llevo un resumen de lo que hablamos.");
    return { state: s, msgs: out };
  }

  // ---- plan canje (conversación guiada) ----
  const wantsCanje = /canje|cambio mi|entrego|entregar|tomar mi|tomen mi|cotiz|mi iphone|mi celu|permuta|parte de pago/.test(t);
  if (wantsCanje && s.mode !== "canje") { s.mode = "canje"; s.stage = "collect"; s.draft = {}; s.topic = "Plan canje"; s.askedBattery = false; }
  if (s.mode === "canje" && s.stage === "collect") {
    if (kind && kind !== "iPhone") {
      s.mode = null; handoff(`Los ${kind === "Mac" ? "Mac" : kind === "iPad" ? "iPad" : "equipos de ese tipo"} los tasamos en el local. Te paso con un asesor para coordinarlo.`);
      return { state: s, msgs: out };
    }
    if (model && !s.draft.model) s.draft.model = model;
    if (cap && !s.draft.capacity) s.draft.capacity = cap;
    const bat = parseBattery(t); if (bat && !s.draft.battery) { s.draft.battery = bat; s.askedBattery = true; }
    const cnd = parseCond(t, s.awaiting === "cond"); if (cnd && !s.draft.cond) { s.draft.cond = cnd.cond; s.draft.defects = cnd.defects; }
    if (s.awaiting === "battery" && /no se|ni idea|no lo se|no sé/.test(t)) s.askedBattery = true;
    if (!s.draft.model) { s.awaiting = "model"; say("Perfecto, te ayudo con la cotización. ¿Qué modelo de iPhone tenés? Por ejemplo: iPhone 13 Pro."); return { state: s, msgs: out }; }
    const refs = cfg.baseValues.filter((r) => r.model === s.draft.model);
    if (!refs.length) { s.mode = null; handoff(`Para el ${s.draft.model} prefiero que lo cotice un asesor para darte un valor justo. Te paso con una persona.`); return { state: s, msgs: out }; }
    if (!s.draft.capacity) {
      if (refs.length === 1) s.draft.capacity = refs[0].capacity;
      else { s.awaiting = "cap"; say(`¿Qué capacidad tiene tu ${s.draft.model}? (${refs.map((r) => r.capacity + " GB").join(", ")})`); return { state: s, msgs: out }; }
    }
    if (!refs.find((r) => r.capacity === s.draft.capacity)) { s.mode = null; handoff(`Para ${s.draft.model} de ${s.draft.capacity} GB no tengo referencia cargada. Te paso con un asesor.`); return { state: s, msgs: out }; }
    if (!s.draft.cond) { s.awaiting = "cond"; say("¿Cómo está el equipo?\n1. Impecable, sin marcas\n2. Con marcas leves de uso\n3. Con la pantalla o la tapa rota\nRespondé con el número o contame con tus palabras."); return { state: s, msgs: out }; }
    if (!s.draft.battery && !s.askedBattery) { s.awaiting = "battery"; s.askedBattery = true; say("¿Sabés el porcentaje de batería? (Ajustes > Batería > Salud). Si no sabés, escribí \"no sé\"."); return { state: s, msgs: out }; }
    const ap = appraise(cfg, { ...s.draft, kind: "iPhone", icloudFree: true, imeiClean: true });
    if (!ap.ok) { s.mode = null; handoff("Esa cotización la prefiero hacer con un asesor. Te paso con una persona."); return { state: s, msgs: out }; }
    const low = r5(ap.value * 0.9), high = ap.value;
    s.quote = { low, high, label: `${s.draft.model} ${s.draft.capacity}GB` }; s.stage = "quote"; s.awaiting = null;
    say(`Por tu ${s.quote.label} te lo tomaríamos, orientativamente, entre US$ ${low} y US$ ${high} (≈ ${fmtARS(low * cfg.fx)} a ${fmtARS(high * cfg.fx)}).\n\nEs una estimación: se confirma revisando el equipo en el local (iCloud, batería y estado general). Si me decís qué equipo te interesa, te calculo la diferencia.`, { chips: ["Ver iPhone disponibles", handoffChip] });
    return { state: s, msgs: out };
  }

  // ---- búsqueda de equipos ----
  const isAccQuery = /funda|vidrio|templado|cargador|cable|soporte|accesorio|pop ?socket|magsafe|auricular.*cable|con cable/.test(t);
  if (kind && !isAccQuery) {
    const list = findDevices(ctx, { kind, model: kind === "iPhone" ? model : null, cap });
    const quoteNote = (d) => (s.quote ? `Diferencia aprox.: US$ ${Math.max(0, d.price - s.quote.high)} a US$ ${Math.max(0, d.price - s.quote.low)} con tu equipo` : null);
    s.topic = s.topic || "Equipos";
    if (!list.length) {
      say(`Ahora no tengo ${model || kind} disponible${cap ? " de " + cap + " GB" : ""}. Si querés, un asesor te avisa cuando entre uno.`, { chips: [handoffChip, "Ver iPhone disponibles"] });
    } else {
      const shown = list.slice(0, 4);
      say(`${model || kind === "iPhone" ? "Estos son los" : "Esto es lo que tengo en"} ${model || kind} que tengo disponibles hoy:`, { cards: shown.map((d) => ({ id: d.id, note: quoteNote(d) })) });
      if (list.length > shown.length) say(`Hay ${list.length - shown.length} más en el catálogo. ¿Querés que te ayude a elegir?`);
      say("¿Te gustaría pagarlo con plan canje o te paso con un asesor?", { chips: ["Cotizar mi equipo", handoffChip] });
    }
    return { state: s, msgs: out };
  }

  // ---- accesorios ----
  if (isAccQuery) {
    s.topic = s.topic || "Accesorios";
    const nums = (t.match(/\b(1[1-6])\b/g) || []);
    const words = ["funda", "vidrio", "templado", "cargador", "cable", "soporte", "magsafe", "socket"].filter((w) => t.includes(w));
    let list = ctx.accessories.filter((a) => (!words.length || words.some((w) => norm(a.name + " " + a.category).includes(w === "templado" ? "vidrio" : w))) && (!nums.length || nums.some((n) => a.name.includes(n)) || !/iphone/.test(norm(a.name))));
    if (!list.length) list = ctx.accessories.filter((a) => words.some((w) => norm(a.name).includes(w)));
    if (!list.length) say("De eso no tengo stock ahora. Si querés, un asesor te consulta con el proveedor.", { chips: [handoffChip] });
    else say("Esto es lo que tengo:\n" + list.slice(0, 5).map((a) => `• ${a.name}: ${fmtARS(a.price)} (${a.stock} en stock)`).join("\n"), { chips: ["Cotizar mi equipo", handoffChip] });
    return { state: s, msgs: out };
  }

  if (/pago|pagar|medio|transferencia|tarjeta|efectivo|mercado ?pago|cuota|financ/.test(t)) {
    s.topic = s.topic || "Pagos";
    say(`Podés pagar en efectivo (pesos o dólares), transferencia, tarjeta o Mercado Pago. Los equipos están en dólares y en pesos se toma la cotización del día (US$ 1 = ${fmtARS(cfg.fx)}). Para cuotas o recargos con tarjeta, te lo confirma un asesor.`, { chips: [handoffChip, "Cotizar mi equipo"] });
    return { state: s, msgs: out };
  }
  if (/garantia|garantizado|revisado|icloud/.test(t)) {
    say(`Los equipos nuevos tienen ${cfg.warrantyNew} días de garantía y los usados ${cfg.warrantyUsed} días. Los usados están revisados y con iCloud libre. La garantía no cubre golpes ni humedad.`);
    return { state: s, msgs: out };
  }
  if (/donde|direccion|ubicacion|local|horario|abren|cierran/.test(t)) {
    say(`Estamos en ${cfg.address}. Para confirmar horarios, escribinos por WhatsApp y te respondemos al toque.`, { chips: [handoffChip] });
    return { state: s, msgs: out };
  }
  if (/^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|que tal)\b/.test(t) && t.length < 30) {
    say("¡Hola! Soy el asistente de " + cfg.storeName + ". Te puedo mostrar equipos disponibles, cotizar tu equipo en plan canje o contarte las formas de pago.", { chips: ["Ver iPhone disponibles", "Cotizar mi equipo", "¿Cómo puedo pagar?"] });
    return { state: s, msgs: out };
  }
  if (/precio|cuanto|sale|vale|stock|tienen|disponible|hay/.test(t)) {
    say("¿De qué equipo querés saber? Decime el modelo, por ejemplo iPhone 15 Pro 256 GB.", { chips: ["Ver iPhone disponibles"] });
    return { state: s, msgs: out };
  }
  say("No estoy seguro de haber entendido. Te puedo ayudar con equipos disponibles, accesorios, plan canje y formas de pago, o te paso con una persona.", { chips: ["Ver iPhone disponibles", "Cotizar mi equipo", handoffChip] });
  return { state: s, msgs: out };
}

function ChatIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>;
}

function AssistantChat({ data, persist, cat, cfg, devicesAvail, accAvail, onOpenDevice, hasWa, openWA }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [st, setSt] = useState({ mode: null, draft: {}, userMsgs: [] });
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [sid] = useState(() => uid());
  const endRef = React.useRef(null);
  const name = cat.assistantName || "Asistente";
  const greeting = cat.greeting || `¡Hola! Soy el asistente de ${cfg.storeName}. ¿Te muestro equipos, cotizamos tu canje o te cuento cómo pagar?`;
  useEffect(() => { if (open && msgs.length === 0) setMsgs([{ role: "bot", text: greeting, chips: ["Ver iPhone disponibles", "Cotizar mi equipo", "¿Cómo puedo pagar?"] }]); }, [open]); // eslint-disable-line
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [msgs, typing, open]);
  const ctx = { cfg, devices: devicesAvail, accessories: accAvail, featured: cat.featured || [] };

  const logChat = (n, last, topic, handoff) => {
    const chats = [...(cat.chats || [])]; const i = chats.findIndex((c) => c.id === sid);
    const row = { id: sid, ts: i >= 0 ? chats[i].ts : nowISO(), msgs: n, last, topic: topic || (i >= 0 ? chats[i].topic : "Consulta"), handoff: handoff || (i >= 0 && chats[i].handoff) };
    if (i >= 0) chats[i] = row; else chats.push(row);
    persist({ ...data, catalog: { ...cat, chats: chats.slice(-40) } });
  };
  const summary = (state) => {
    const d = state.draft || {};
    const canje = d.model ? ` Mi equipo: ${d.model}${d.capacity ? " " + d.capacity + "GB" : ""}${d.cond ? ", " + d.cond : ""}${d.battery ? ", batería " + d.battery + "%" : ""}.` : "";
    return `Hola! Vengo del chat del catálogo. ${(state.userMsgs || []).slice(-3).join(" / ")}.${canje}`;
  };
  const send = async (raw) => {
    const input = (raw ?? text).trim(); if (!input || typing) return;
    setText(""); const userMsg = { role: "user", text: input };
    const history = [...msgs, userMsg]; setMsgs(history); setTyping(true);
    let replyMsgs = null, nextState = null;
    if (cat.endpoint) {
      try {
        const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(cat.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal, body: JSON.stringify({ store: cfg.storeName, messages: history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text })) }) });
        clearTimeout(to);
        if (res.ok) { const j = await res.json(); if (j && j.reply) { replyMsgs = [{ text: j.reply, handoff: !!j.handoff, cards: (j.deviceIds || []).map((id) => ({ id })) }]; nextState = { ...st, userMsgs: [...(st.userMsgs || []), input].slice(-6) }; } }
      } catch (e) { /* si el servidor falla, usa el motor simulado */ }
    }
    if (!replyMsgs) { const r = assistantStep(input, st, ctx); replyMsgs = r.msgs; nextState = r.state; }
    await new Promise((r) => setTimeout(r, cat.endpoint ? 0 : 550));
    setTyping(false); setSt(nextState);
    setMsgs([...history, ...replyMsgs.map((m) => ({ role: "bot", ...m }))]);
    logChat(history.length + replyMsgs.length, input, nextState.topic, replyMsgs.some((m) => m.handoff));
  };
  const toWA = () => openWA(summary(st), "chat", "Chat del asistente");
  const chip = (c) => { if (c === "Hablar con un asesor") send("quiero hablar con un asesor"); else if (c === "Cotizar mi equipo") send("quiero cotizar mi equipo en plan canje"); else send(c); };
  const bub = (isUser) => ({ maxWidth: "84%", padding: "9px 14px", borderRadius: 19, fontSize: 15, lineHeight: 1.38, whiteSpace: "pre-wrap", background: isUser ? AP.blue : "#E9E9EB", color: isUser ? "#fff" : AP.text, alignSelf: isUser ? "flex-end" : "flex-start", borderBottomRightRadius: isUser ? 5 : 19, borderBottomLeftRadius: isUser ? 19 : 5 });
  const lastBot = [...msgs].reverse().find((m) => m.role === "bot");
  return (
    <>
      {!open && (
        <div data-testid="chat-open" onClick={() => setOpen(true)} style={{ position: "fixed", right: 18, bottom: 18, zIndex: 40, background: AP.blue, color: "#fff", borderRadius: 980, padding: "13px 20px 13px 16px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 8px 28px rgba(0,113,227,.4)", fontSize: 15, fontWeight: 500, fontFamily: APPLE_FONT }}>
          <ChatIcon size={20} />Preguntanos
        </div>
      )}
      {open && (
        <div data-testid="chat-panel" style={{ position: "fixed", zIndex: 60, right: 0, bottom: 0, width: "100%", maxWidth: 400, height: "min(640px, 86vh)", background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -10px 50px rgba(0,0,0,.22)", display: "flex", flexDirection: "column", fontFamily: APPLE_FONT, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${AP.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(251,251,253,.9)" }}>
            <div><div style={{ fontWeight: 600, fontSize: 16, color: AP.text }}>{name}</div><div style={{ fontSize: 12, color: AP.green }}>● Responde al instante</div></div>
            <span data-testid="chat-close" onClick={() => setOpen(false)} style={{ cursor: "pointer", fontSize: 26, color: AP.sub, lineHeight: 1, padding: 6 }}>×</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {msgs.map((m, i) => (
              <React.Fragment key={i}>
                <div data-testid={m.role === "bot" ? "chat-bot-msg" : "chat-user-msg"} style={bub(m.role === "user")}>{m.text}</div>
                {(m.cards || []).map((c) => {
                  const d = data.devices.find((x) => x.id === c.id); if (!d) return null;
                  return (
                    <div key={c.id} data-testid="chat-card" style={{ alignSelf: "flex-start", width: "86%", border: `1px solid ${AP.line}`, borderRadius: 16, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", background: "#fff" }}>
                      <div style={{ width: 52, height: 52, borderRadius: 10, background: AP.surface, flex: "none", padding: 4, overflow: "hidden" }}><DeviceArt kind={d.kind} color={d.color} photo={cat.photos[d.id]} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: AP.text }}>{deviceShort(d)}</div>
                        <div style={{ fontSize: 12, color: AP.sub }}>{d.condition}{d.battery && d.condition !== "Nuevo sellado" ? ` · batería ${d.battery}%` : ""}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: AP.text }}>{fmtUSD(d.price)}</div>
                        {c.note && <div style={{ fontSize: 11.5, color: AP.green, marginTop: 2 }}>{c.note}</div>}
                      </div>
                      <span onClick={() => { setOpen(false); onOpenDevice(d); }} style={{ color: AP.link, fontSize: 13, cursor: "pointer", flex: "none" }}>Ver</span>
                    </div>
                  );
                })}
                {m.handoff && hasWa && <div data-testid="chat-handoff" onClick={toWA} style={{ alignSelf: "flex-start", background: AP.blue, color: "#fff", borderRadius: 980, padding: "10px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Continuar por WhatsApp</div>}
              </React.Fragment>
            ))}
            {typing && <div data-testid="chat-typing" style={{ ...bub(false), color: AP.sub }}>escribiendo…</div>}
            {!typing && lastBot && lastBot.chips && msgs[msgs.length - 1] === lastBot && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {lastBot.chips.map((c) => <span key={c} data-testid="chat-chip" onClick={() => chip(c)} style={{ border: `1px solid ${AP.blue}`, color: AP.blue, borderRadius: 980, padding: "7px 13px", fontSize: 13.5, cursor: "pointer", background: "#fff" }}>{c}</span>)}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div style={{ borderTop: `1px solid ${AP.line}`, padding: "10px 12px 6px" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input data-testid="chat-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escribí tu consulta" style={{ flex: 1, border: `1px solid ${AP.line}`, borderRadius: 980, padding: "11px 16px", fontSize: 15, fontFamily: APPLE_FONT, outline: "none", color: AP.text, background: AP.bg }} />
              <button data-testid="chat-send" onClick={() => send()} style={{ border: "none", background: text.trim() ? AP.blue : "#C7C7CC", color: "#fff", width: 42, height: 42, borderRadius: 21, cursor: "pointer", fontSize: 18 }}>↑</button>
            </div>
            <div style={{ fontSize: 10.5, color: AP.sub, textAlign: "center", padding: "7px 8px 4px" }}>Asistente automático. Precios y tasaciones son orientativos y se confirman en el local.</div>
          </div>
        </div>
      )}
    </>
  );
}

// ================= SHELL =================
function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <rect x="18" y="10" width="64" height="80" rx="20" stroke={ACCENT} strokeWidth="6" />
      <rect x="34" y="34" width="32" height="6" rx="3" fill={ACCENT} /><rect x="34" y="47" width="32" height="6" rx="3" fill={ACCENT} /><rect x="34" y="60" width="32" height="6" rx="3" fill={ACCENT} />
    </svg>
  );
}

export default function App() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [userId, setUserId] = useState(null);
  const [menu, setMenu] = useState(false);
  const isMobile = useIsMobile();
  const [hash, setHash] = useState(typeof window !== "undefined" ? window.location.hash : "");
  useEffect(() => { const f = () => setHash(window.location.hash); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) setData({ ...EMPTY_DATA, ...JSON.parse(res.value) });
      } catch (e) { /* primera vez */ }
      finally { setLoaded(true); }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(next), false); } catch (e) { console.error("Storage error", e); }
  }, []);
  const showToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2400); }, []);

  const activeUsers = data.users.filter((u) => u.active);
  const user = data.users.find((u) => u.id === userId && u.active) || activeUsers[0] || { id: "none", name: "Sin usuario", role: "Administrador" };
  const role = user.role;
  const perms = permsFor(role);
  const nav = NAV_ITEMS.filter((n) => n.roles.includes(role));
  const allowed = nav.some((n) => n.id === page);

  useEffect(() => { if (loaded && !allowed) setPage("dashboard"); }, [loaded, allowed]);

  const loadDemo = () => { persist(seedDemoData()); setUserId("u-admin"); setPage("dashboard"); showToast("Datos demo cargados"); };
  const clearAll = () => { persist({ ...EMPTY_DATA, users: [{ id: "u-admin", name: "Administrador", role: "Administrador", active: true, commission: 0, pin: "" }] }); setUserId("u-admin"); showToast("Datos borrados"); };

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: SF }}>Cargando APPLE OPS...</div>;
  }

  if (hash.startsWith("#/catalogo")) return <PublicCatalog data={data} persist={persist} />;

  if (data.users.length === 0) {
    return (
      <div style={{ background: CARBON, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <style>{FONT_IMPORT}</style>
        <div style={{ maxWidth: 440, textAlign: "center", fontFamily: SF, color: OFFWHITE }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><Logo size={46} /></div>
          <div style={{ fontFamily: SF, fontWeight: 700, fontSize: 26 }}>APPLE<span style={{ color: ACCENT }}>OPS</span></div>
          <div style={{ color: GRAY, fontSize: 14, margin: "10px 0 22px" }}>Stock con IMEI, plan canje, accesorios, usuarios y cierres de caja para tu local.</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Btn testid="start-demo" onClick={loadDemo}>Ver con datos de ejemplo</Btn>
            <Btn variant="secondary" onClick={clearAll}>Empezar vacío</Btn>
          </div>
        </div>
      </div>
    );
  }

  const pageEl = {
    dashboard: <Dashboard data={data} perms={perms} setPage={setPage} />,
    ventas: <SalesPage data={data} user={user} perms={perms} persist={persist} toast={showToast} setPage={setPage} />,
    canje: <TradeInPage data={data} user={user} perms={perms} persist={persist} toast={showToast} setPage={setPage} />,
    stock: <StockPage data={data} user={user} perms={perms} persist={persist} toast={showToast} setPage={setPage} role={role} />,
    ingresos: <IngresosPage data={data} user={user} persist={persist} toast={showToast} perms={perms} />,
    accesorios: <AccessoriesPage data={data} user={user} perms={perms} persist={persist} toast={showToast} />,
    catalogo: <CatalogAdmin data={data} user={user} persist={persist} toast={showToast} />,
    clientes: <ClientsPage data={data} user={user} persist={persist} toast={showToast} />,
    caja: <CashPage data={data} user={user} perms={perms} persist={persist} toast={showToast} role={role} />,
    reportes: <ReportsPage data={data} perms={perms} />,
    usuarios: <UsersPage data={data} user={user} persist={persist} toast={showToast} />,
    config: <ConfigPage key={data.config.storeName + data.config.fx} data={data} user={user} persist={persist} toast={showToast} loadDemo={loadDemo} clearAll={clearAll} />,
  }[page];

  const shift = openShiftOf(data);
  const Sidebar = (
    <div style={{ width: 232, background: "rgba(255,255,255,0.86)", backdropFilter: "saturate(180%) blur(20px)", borderRight: `1px solid ${BORDER}`, padding: "18px 12px", display: "flex", flexDirection: "column", gap: 4, minHeight: isMobile ? "auto" : "100vh", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px 16px" }}>
        <Logo />
        <div>
          <div style={{ fontFamily: SF, fontWeight: 700, fontSize: 15, color: OFFWHITE }}>APPLE<span style={{ color: ACCENT }}>OPS</span></div>
          <div style={{ fontFamily: SF, fontSize: 10.5, color: GRAY }}>{data.config.storeName}</div>
        </div>
      </div>
      {nav.map((n) => (
        <div key={n.id} data-testid={`nav-${n.id}`} onClick={() => { setPage(n.id); setMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer", fontFamily: SF, fontSize: 13.5, fontWeight: 500, background: page === n.id ? "rgba(0,113,227,0.10)" : "transparent", color: page === n.id ? ACCENT : GRAY }}>
          <NavIcon name={n.icon} />{n.label}
          {n.id === "caja" && <span style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: 4, background: shift ? SUCCESS : AMBER }} />}
        </div>
      ))}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
        <div style={{ fontFamily: SF, fontSize: 11, color: GRAY, marginBottom: 6, padding: "0 4px" }}>Ver como</div>
        <Select data-testid="role-select" value={user.id} onChange={(e) => { setUserId(e.target.value); setPage("dashboard"); }}>
          {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
        </Select>
      </div>
    </div>
  );

  return (
    <div style={{ background: CARBON, minHeight: "100vh", color: OFFWHITE, fontFamily: SF }}>
      <style>{FONT_IMPORT + ` body{margin:0;background:${CARBON}} *{box-sizing:border-box} select option{background:${CARD2};color:${OFFWHITE}} input:focus,select:focus,textarea:focus{border-color:${ACCENT} !important} ::-webkit-scrollbar{width:8px;height:8px} ::-webkit-scrollbar-thumb{background:${BORDER};border-radius:4px}`}</style>
      {isMobile ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: CARD, borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, zIndex: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Logo size={24} /><span style={{ fontFamily: SF, fontWeight: 700 }}>APPLE<span style={{ color: ACCENT }}>OPS</span></span></div>
            <Btn variant="secondary" testid="menu-toggle" onClick={() => setMenu(!menu)} style={{ padding: "6px 12px" }}>{menu ? "Cerrar" : "Menú"}</Btn>
          </div>
          {menu && <div style={{ position: "fixed", top: 52, left: 0, right: 0, bottom: 0, zIndex: 45, overflowY: "auto", background: CARD }}>{React.cloneElement(Sidebar, {})}</div>}
          <div style={{ padding: 16 }}>{pageEl}</div>
        </div>
      ) : (
        <div style={{ display: "flex" }}>
          <div style={{ position: "sticky", top: 0, alignSelf: "flex-start", height: "100vh" }}>{Sidebar}</div>
          <div style={{ flex: 1, padding: "28px 32px", minWidth: 0, maxWidth: 1240 }}>{pageEl}</div>
        </div>
      )}
      {toast && <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1D1D1F", color: "#fff", padding: "11px 22px", borderRadius: 999, boxShadow: "0 8px 24px rgba(0,0,0,.2)", fontFamily: SF, fontWeight: 600, fontSize: 13, zIndex: 200 }}>{toast}</div>}
    </div>
  );
}
