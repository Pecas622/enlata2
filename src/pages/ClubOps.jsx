import React, { useState, useEffect, useCallback } from "react";
import { FONT_IMPORT, CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "../lib/theme.js";
import { uid, todayStr, addDays, daysBetween, fmtDate } from "../lib/utils.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips } from "../lib/ui.jsx";

const STORAGE_KEY = "clubops-full-data";
const MP_COMMISSION_RATE = 0.0604;

const MEMBER_STATUSES = ["Activo", "Moroso", "Suspendido", "Inactivo", "Baja"];
const PLAN_TYPES = ["Socio pleno", "Socio adherente", "Menor", "Jubilado", "Familiar", "Deportista", "Otro"];
const QUOTA_STATUSES = ["Pagada", "Pendiente", "Vencida", "Bonificada", "Anulada"];
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Mercado Pago", "Débito automático", "Otro"];
const SPORTS_SEED = ["Fútbol", "Futsal", "Básquet", "Vóley", "Natación"];
const TRAINING_STATUSES = ["Programado", "Realizado", "Suspendido", "Reprogramado"];
const ATTENDANCE_STATES = ["Presente", "Ausente", "Justificado"];
const MATCH_LOCALVISIT = ["Local", "Visitante"];
const CALLUP_STATES = ["Convocado", "Confirmado", "No disponible", "Pendiente"];
const FACILITY_TYPES = ["Cancha de fútbol", "Cancha de futsal", "Cancha de básquet", "Cancha de tenis", "Gimnasio", "Salón", "Quincho", "Pileta"];
const RESERVATION_STATUSES = ["Pendiente", "Confirmada", "Pagada", "Cancelada"];
const EXPENSE_CATEGORIES = ["Personal", "Mantenimiento", "Servicios", "Equipamiento", "Administración", "Seguridad", "Limpieza", "Otros"];
const EVENT_TYPES = ["Torneo", "Fiesta", "Cena", "Clínica", "Campamento", "Recaudación", "Evento social"];

const EMPTY_DATA = {
  members: [], sports: [], categories: [], players: [], coaches: [], trainings: [],
  matches: [], facilities: [], reservations: [], events: [], inventory: [], cash: [],
  quotas: [], payments: [], config: { clubName: "Tu Club", quotaAmount: "15000" },
};

// club money is always ARS (unlike InmoOps where currency varies per record)
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

// ---------- atoms unique to CLUB OPS (mini stat with semantic tone + bar chart) ----------
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
  const sports = SPORTS_SEED.map((name, i) => ({ id: uid(), name, description: "", coach: ["Diego", "Lucía", "Martín"][i % 3], price: String(12000 + i * 1000), slots: String(20 + i * 5), status: "Activa" }));
  const categories = [];
  ["Sub 10", "Sub 14", "Sub 18", "Primera"].forEach((cat, ci) => {
    sports.slice(0, 2).forEach((sp, si) => {
      categories.push({ id: uid(), name: cat, sportId: sp.id, sportName: sp.name, minAge: String(8 + ci * 4), maxAge: String(12 + ci * 4), coach: sp.coach, slots: "20", schedule: "Lun y Mié 18:00" });
    });
  });
  const coaches = Array.from({ length: 8 }).map((_, i) => ({
    id: uid(), name: ["Diego Fernández", "Lucía Torres", "Martín Ruiz", "Ana Paz", "Carlos Ríos", "Sofía Luna", "Pedro Vega", "Julia Soto"][i],
    dni: `${27000000 + i}`, phone: `+54 9 261 555 03${i}0`, sports: sports[i % sports.length].name, fee: String(80000 + i * 5000), status: "Activo",
  }));
  const members = Array.from({ length: 50 }).map((_, i) => {
    const status = i % 10 === 0 ? "Moroso" : i % 15 === 0 ? "Suspendido" : "Activo";
    return {
      id: uid(), memberNumber: `S-${1000 + i}`, name: ["Juan", "María", "Carlos", "Ana", "Pedro", "Lucía", "Diego", "Sofía", "Martín", "Valentina"][i % 10],
      lastName: `Apellido${i}`, dni: `${30000000 + i}`, birthDate: `${1990 + (i % 30)}-0${1 + (i % 9)}-15`, phone: `+54 9 261 555 04${i % 10}0`, whatsapp: `+54 9 261 555 04${i % 10}0`,
      email: "", address: "", entryDate: addDays(todayStr(), -i * 20), status, planType: PLAN_TYPES[i % PLAN_TYPES.length],
      sportName: sports[i % sports.length].name, coach: sports[i % sports.length].coach, notes: "",
      timeline: [{ id: uid(), date: todayStr(), type: "Nota", note: "Socio cargado desde datos demo" }],
    };
  });
  const players = Array.from({ length: 40 }).map((_, i) => {
    const cat = categories[i % categories.length];
    return { id: uid(), memberName: members[i % members.length].name + " " + members[i % members.length].lastName, sportName: cat.sportName, categoryName: cat.name,
      jerseyNumber: String(1 + (i % 30)), position: ["Arquero", "Defensor", "Mediocampista", "Delantero"][i % 4], coach: cat.coach, status: "Activo" };
  });
  const trainings = Array.from({ length: 6 }).map((_, i) => ({
    id: uid(), sportName: sports[i % sports.length].name, categoryName: categories[i % categories.length].name, coach: sports[i % sports.length].coach,
    date: addDays(todayStr(), i - 2), time: "18:00", duration: "90", facility: FACILITY_TYPES[i % 3], status: TRAINING_STATUSES[i % 4], attendance: [],
  }));
  const matches = Array.from({ length: 5 }).map((_, i) => ({
    id: uid(), sportName: sports[i % sports.length].name, categoryName: categories[i % categories.length].name, rival: `Club Rival ${i + 1}`,
    date: addDays(todayStr(), i * 3 - 3), time: "16:00", localVisit: i % 2 === 0 ? "Local" : "Visitante", place: "Predio del club", result: i < 2 ? `${i + 1}-${i}` : "", callups: [],
  }));
  const facilities = FACILITY_TYPES.slice(0, 5).map((name, i) => ({ id: uid(), name, type: name, capacity: String(10 + i * 5), status: "Disponible", price: String(3000 + i * 500) }));
  const reservations = Array.from({ length: 5 }).map((_, i) => ({
    id: uid(), memberName: members[i].name, facilityName: facilities[i % facilities.length].name, date: addDays(todayStr(), i), time: `${17 + i}:00`,
    duration: "60", people: String(4 + i), price: facilities[i % facilities.length].price, status: RESERVATION_STATUSES[i % 4],
  }));
  const events = Array.from({ length: 3 }).map((_, i) => ({
    id: uid(), name: ["Torneo Aniversario", "Cena de Fin de Año", "Clínica de Verano"][i], type: EVENT_TYPES[i], date: addDays(todayStr(), 15 + i * 10),
    place: "Predio del club", capacity: String(100 + i * 50), price: String(5000 + i * 1000), participants: [], status: "Programado",
  }));
  const inventory = [
    { id: uid(), product: "Pelotas fútbol N°5", quantity: "24", minStock: "10", location: "Depósito 1" },
    { id: uid(), product: "Pecheras", quantity: "40", minStock: "20", location: "Depósito 1" },
    { id: uid(), product: "Conos", quantity: "8", minStock: "15", location: "Depósito 2" },
  ];
  const quotas = members.map((m) => {
    const isOverdue = m.status === "Moroso";
    return { id: uid(), memberId: m.id, memberName: `${m.name} ${m.lastName}`, planType: m.planType, amount: "15000", dueDate: isOverdue ? addDays(todayStr(), -20) : addDays(todayStr(), 10), status: isOverdue ? "Vencida" : "Pendiente" };
  });
  const payments = members.filter((m) => m.status === "Activo").slice(0, 30).map((m) => ({
    id: uid(), memberId: m.id, memberName: `${m.name} ${m.lastName}`, concept: "Cuota mensual", amount: "15000", method: PAYMENT_METHODS[Math.floor(Math.random() * 3)], date: addDays(todayStr(), -Math.floor(Math.random() * 25)), registeredBy: "Admin",
  }));
  const cash = [
    { id: uid(), type: "Ingreso", concept: "Cuotas del mes", category: "Cuotas", amount: "450000", method: "Transferencia", date: todayStr() },
    { id: uid(), type: "Egreso", concept: "Sueldos profesores", category: "Personal", amount: "320000", method: "Transferencia", date: addDays(todayStr(), -3) },
    { id: uid(), type: "Egreso", concept: "Mantenimiento cancha", category: "Mantenimiento", amount: "45000", method: "Efectivo", date: addDays(todayStr(), -5) },
  ];
  return { members, sports, categories, players, coaches, trainings, matches, facilities, reservations, events, inventory, cash, quotas, payments, config: { clubName: "Tu Club", quotaAmount: "15000" } };
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
    { id: "dashboard", label: "Dashboard", roles: ["Administrador", "Directivo", "Administrativo", "Profesor"] },
    { id: "members", label: "Socios", roles: ["Administrador", "Directivo", "Administrativo"] },
    { id: "quotas", label: "Cuotas y Pagos", roles: ["Administrador", "Directivo", "Administrativo"] },
    { id: "debtors", label: "Morosidad", roles: ["Administrador", "Directivo", "Administrativo"] },
    { id: "sports", label: "Disciplinas", roles: ["Administrador", "Directivo", "Profesor"] },
    { id: "players", label: "Jugadores", roles: ["Administrador", "Directivo", "Profesor"] },
    { id: "trainings", label: "Entrenamientos", roles: ["Administrador", "Directivo", "Profesor"] },
    { id: "matches", label: "Partidos", roles: ["Administrador", "Directivo", "Profesor"] },
    { id: "coaches", label: "Profesores", roles: ["Administrador", "Directivo"] },
    { id: "facilities", label: "Instalaciones", roles: ["Administrador", "Directivo", "Administrativo"] },
    { id: "events", label: "Eventos", roles: ["Administrador", "Directivo", "Administrativo"] },
    { id: "inventory", label: "Inventario", roles: ["Administrador", "Directivo"] },
    { id: "cash", label: "Caja", roles: ["Administrador", "Directivo"] },
    { id: "communication", label: "Comunicación", roles: ["Administrador", "Directivo", "Administrativo"] },
    { id: "reports", label: "Reportes", roles: ["Administrador", "Directivo"] },
    { id: "config", label: "Configuración", roles: ["Administrador"] },
  ];
  const NAV = ALL_NAV.filter((n) => n.roles.includes(role));
  useEffect(() => { if (!NAV.find((n) => n.id === page)) setPage("dashboard"); }, [role]); // eslint-disable-line

  if (!loaded) {
    return <div style={{ background: CARBON, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: GRAY, fontFamily: "Inter" }}>Cargando CLUB OPS...</div>;
  }

  return (
    <div style={{ background: CARBON, minHeight: 680, borderRadius: 12, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ display: "flex", minHeight: 680 }}>
        <div style={{ width: 220, background: "#0E0E11", borderRight: `1px solid ${BORDER}`, padding: "20px 14px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 16px 8px" }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: CARBON }}>03</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>CLUB<span style={{ color: GREEN }}>OPS</span></div>
          </div>

          <div style={{ padding: "0 8px 14px 8px" }}>
            <div style={{ fontSize: 10.5, color: GRAY, marginBottom: 4, fontFamily: "Inter", textTransform: "uppercase" }}>Ver como</div>
            <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ fontSize: 12, padding: "7px 8px" }}>
              {["Administrador", "Directivo", "Administrativo", "Profesor"].map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>

          {NAV.map((n) => (
            <div key={n.id} onClick={() => setPage(n.id)} style={{
              padding: "9px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "Inter", fontSize: 13, fontWeight: 500,
              background: page === n.id ? "rgba(184,255,61,0.1)" : "transparent", color: page === n.id ? GREEN : GRAY,
            }}>{n.label}</div>
          ))}

          <div style={{ marginTop: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
            <Btn variant="secondary" onClick={loadDemo} style={{ fontSize: 11.5, padding: "7px 10px", width: "100%" }}>Cargar datos demo</Btn>
            <Btn variant="ghost" onClick={clearAll} style={{ fontSize: 11, padding: "5px 10px" }}>Borrar todo</Btn>
            <div style={{ fontFamily: "Inter", fontSize: 10.5, color: "#5A5A5E", marginTop: 4 }}>ENLATA2 · Software que ya viene listo.</div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "24px 28px", position: "relative", overflowY: "auto" }}>
          {toast && <div style={{ position: "absolute", top: 16, right: 28, background: GREEN, color: CARBON, padding: "8px 16px", borderRadius: 8, fontFamily: "Inter", fontWeight: 600, fontSize: 13, zIndex: 10 }}>{toast}</div>}
          {page === "dashboard" && <Dashboard data={data} setPage={setPage} />}
          {page === "members" && <Members data={data} persist={persist} showToast={showToast} />}
          {page === "quotas" && <Quotas data={data} persist={persist} showToast={showToast} />}
          {page === "debtors" && <Debtors data={data} />}
          {page === "sports" && <Sports data={data} persist={persist} showToast={showToast} />}
          {page === "players" && <Players data={data} persist={persist} showToast={showToast} />}
          {page === "trainings" && <Trainings data={data} persist={persist} showToast={showToast} />}
          {page === "matches" && <Matches data={data} persist={persist} showToast={showToast} />}
          {page === "coaches" && <Coaches data={data} persist={persist} showToast={showToast} />}
          {page === "facilities" && <Facilities data={data} persist={persist} showToast={showToast} />}
          {page === "events" && <Events data={data} persist={persist} showToast={showToast} />}
          {page === "inventory" && <Inventory data={data} persist={persist} showToast={showToast} />}
          {page === "cash" && <Cash data={data} persist={persist} showToast={showToast} />}
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
  const activeMembers = data.members.filter((m) => m.status === "Activo").length;
  const newMembers = data.members.filter((m) => daysBetween(m.entryDate, todayStr()) <= 30).length;
  const overdueMembers = data.members.filter((m) => m.status === "Moroso").length;
  const thisMonth = todayStr().slice(0, 7);
  const collectedThisMonth = data.payments.filter((p) => (p.date || "").slice(0, 7) === thisMonth).reduce((s, p) => s + Number(p.amount), 0);
  const totalDebt = data.quotas.filter((q) => q.status === "Vencida" || q.status === "Pendiente").reduce((s, q) => s + Number(q.amount), 0);
  const playersCount = data.players.length;
  const activeSports = data.sports.filter((s) => s.status === "Activa").length;
  const trainingsToday = data.trainings.filter((t) => t.date === todayStr()).length;
  const upcomingMatches = data.matches.filter((m) => m.date >= todayStr()).length;
  const activeCoaches = data.coaches.filter((c) => c.status === "Activo").length;
  const reservationsToday = data.reservations.filter((r) => r.date === todayStr()).length;

  const stats = [
    { label: "Socios activos", value: activeMembers, onClick: () => setPage("members") },
    { label: "Socios nuevos (30 días)", value: newMembers, onClick: () => setPage("members") },
    { label: "Socios morosos", value: overdueMembers, onClick: () => setPage("debtors"), tone: overdueMembers > 0 ? "warn" : undefined },
    { label: "Cobros del mes", value: fmtMoney(collectedThisMonth), onClick: () => setPage("quotas"), tone: "good" },
    { label: "Deuda total", value: fmtMoney(totalDebt), onClick: () => setPage("debtors"), tone: totalDebt > 0 ? "bad" : undefined },
    { label: "Jugadores registrados", value: playersCount, onClick: () => setPage("players") },
    { label: "Disciplinas activas", value: activeSports, onClick: () => setPage("sports") },
    { label: "Entrenamientos hoy", value: trainingsToday, onClick: () => setPage("trainings") },
    { label: "Partidos próximos", value: upcomingMatches, onClick: () => setPage("matches") },
    { label: "Profesores activos", value: activeCoaches, onClick: () => setPage("coaches") },
    { label: "Reservas hoy", value: reservationsToday, onClick: () => setPage("facilities") },
  ];

  const incomeByMonth = last6Months().map((m) => ({ label: m.label, value: Math.round(data.cash.filter((c) => c.type === "Ingreso" && (c.date || "").slice(0, 7) === m.key).reduce((s, c) => s + Number(c.amount), 0) / 1000) }));
  const membersEvolution = last6Months().map((m) => ({ label: m.label, value: data.members.filter((mem) => mem.entryDate <= `${m.key}-28`).length }));
  const byMethod = {}; data.payments.forEach((p) => { byMethod[p.method] = (byMethod[p.method] || 0) + 1; });
  const paymentsByMethod = Object.entries(byMethod).map(([label, value]) => ({ label, value }));
  const bySport = {}; data.players.forEach((p) => { bySport[p.sportName] = (bySport[p.sportName] || 0) + 1; });
  const playersBySport = Object.entries(bySport).map(([label, value]) => ({ label, value }));

  const birthdaysToday = data.members.filter((m) => m.birthDate && m.birthDate.slice(5) === todayStr().slice(5));
  const upcomingReservations = data.reservations.filter((r) => r.date >= todayStr() && r.status !== "Cancelada").sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Estado general del club en tiempo real" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {stats.map((s) => (
          <div key={s.label} onClick={s.onClick} style={{ cursor: "pointer" }}><MiniStat label={s.label} value={s.value} tone={s.tone} /></div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Ingresos mensuales (x1000 $)</div><Bars data={incomeByMonth} /></Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Evolución de socios</div><Bars data={membersEvolution} /></Card>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Jugadores por disciplina</div>{playersBySport.length ? <Bars data={playersBySport} /> : <EmptyState text="Sin jugadores." />}</Card>
        <Card><div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 4 }}>Cobros por método de pago</div>{paymentsByMethod.length ? <Bars data={paymentsByMethod} /> : <EmptyState text="Sin pagos." />}</Card>
      </div>

      {(birthdaysToday.length > 0 || upcomingReservations.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {birthdaysToday.length > 0 && (
            <Card>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>🎂 Cumpleaños de hoy</div>
              {birthdaysToday.map((m) => <div key={m.id} style={{ fontSize: 13, fontFamily: "Inter", color: OFFWHITE, padding: "4px 0" }}>{m.name} {m.lastName}</div>)}
            </Card>
          )}
          {upcomingReservations.length > 0 && (
            <Card>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Próximas reservas</div>
              {upcomingReservations.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", padding: "4px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ color: OFFWHITE }}>{r.facilityName} — {r.memberName}</span><span style={{ color: GRAY }}>{fmtDate(r.date)} {r.time}</span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== SOCIOS ====================
const emptyMember = { memberNumber: "", name: "", lastName: "", dni: "", birthDate: "", phone: "", whatsapp: "", email: "", address: "", entryDate: todayStr(), status: "Activo", planType: PLAN_TYPES[0], sportName: "", coach: "", notes: "", timeline: [] };

function Members({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(emptyMember);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [search, setSearch] = useState("");

  const filtered = data.members.filter((m) =>
    (statusFilter === "Todos" || m.status === statusFilter) &&
    (!search || `${m.name} ${m.lastName} ${m.memberNumber} ${m.dni}`.toLowerCase().includes(search.toLowerCase()))
  );
  const counts = Object.fromEntries(["Todos", ...MEMBER_STATUSES].map((s) => [s, s === "Todos" ? data.members.length : data.members.filter((m) => m.status === s).length]));

  const addMember = () => {
    if (!form.name || !form.lastName) { showToast("Completá nombre y apellido"); return; }
    persist({ ...data, members: [{ id: uid(), ...form, memberNumber: form.memberNumber || `S-${1000 + data.members.length}`, timeline: [{ id: uid(), date: todayStr(), type: "Nota", note: "Alta como socio" }] }, ...data.members] });
    setForm(emptyMember); setShowForm(false); showToast("Socio agregado");
  };
  const removeMember = (id) => persist({ ...data, members: data.members.filter((m) => m.id !== id) });
  const updateMember = (id, patch) => persist({ ...data, members: data.members.map((m) => m.id === id ? { ...m, ...patch } : m) });
  const addTimelineEntry = (id, type, note) => {
    const m = data.members.find((x) => x.id === id);
    updateMember(id, { timeline: [{ id: uid(), date: todayStr(), type, note }, ...(m.timeline || [])] });
  };

  return (
    <div>
      <PageHeader title="Socios" subtitle={`${data.members.length} socios`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo socio"}</Btn>} />
      <Input placeholder="Buscar por nombre, número de socio o DNI..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 14 }} />

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Field label="N° de socio"><Input value={form.memberNumber} onChange={(e) => setForm({ ...form, memberNumber: e.target.value })} placeholder="auto" /></Field>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Apellido"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
            <Field label="DNI"><Input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            <Field label="Fecha de nacimiento"><Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
            <Field label="Teléfono/WhatsApp"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value, whatsapp: e.target.value })} placeholder="+54 9 261 555 0100" /></Field>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Plan"><Select value={form.planType} onChange={(e) => setForm({ ...form, planType: e.target.value })}>{PLAN_TYPES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Disciplina"><Select value={form.sportName} onChange={(e) => setForm({ ...form, sportName: e.target.value })}><option value="">-</option>{data.sports.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Estado"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{MEMBER_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addMember}>Guardar socio</Btn></div>
        </Card>
      )}

      <div style={{ marginBottom: 16 }}><FilterChips options={["Todos", ...MEMBER_STATUSES]} value={statusFilter} onChange={setStatusFilter} counts={counts} /></div>

      {filtered.length === 0 ? <Card><EmptyState text="No hay socios para mostrar." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((m) => (
            <Card key={m.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ cursor: "pointer", flex: 1, minWidth: 200 }} onClick={() => setDetail(m)}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{m.name} {m.lastName}</div>
                    <Badge tone={m.status === "Activo" ? "green" : m.status === "Moroso" ? "red" : "gray"}>{m.status}</Badge>
                    <Badge tone="gray">{m.memberNumber}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{m.planType}{m.sportName ? " · " + m.sportName : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" href={waLink(m.whatsapp || m.phone, `Hola ${m.name}, te escribimos del club.`)}>WhatsApp</Btn>
                  <Btn variant="danger" onClick={() => removeMember(m.id)}>Eliminar</Btn>
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
              <div>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 19, color: OFFWHITE }}>{detail.name} {detail.lastName}</div>
                <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{detail.memberNumber} · socio desde {fmtDate(detail.entryDate)}</div>
              </div>
              <Btn variant="ghost" onClick={() => setDetail(null)}>✕</Btn>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <MiniStat label="Cuotas pendientes" value={data.quotas.filter((q) => q.memberId === detail.id && q.status !== "Pagada").length} />
              <MiniStat label="Deuda" value={fmtMoney(data.quotas.filter((q) => q.memberId === detail.id && q.status !== "Pagada").reduce((s, q) => s + Number(q.amount), 0))} />
            </div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 13, color: OFFWHITE, marginBottom: 10 }}>Línea de tiempo</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 200, overflowY: "auto" }}>
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
  const [type, setType] = useState("Nota"); const [note, setNote] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Select value={type} onChange={(e) => setType(e.target.value)} style={{ flex: 1 }}>
        {["Inscripción", "Pago", "Entrenamiento", "Nota", "Documentación"].map((t) => <option key={t}>{t}</option>)}
      </Select>
      <Input placeholder="Detalle..." value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 2 }} />
      <Btn onClick={() => { if (note) { onAdd(type, note); setNote(""); } }}>Agregar</Btn>
    </div>
  );
}

// ==================== CUOTAS Y PAGOS ====================
function Quotas({ data, persist, showToast }) {
  const [tab, setTab] = useState("Pagos");
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ memberId: "", concept: "Cuota mensual", amount: data.config?.quotaAmount || "15000", method: "Transferencia", date: todayStr() });
  const [showQuotaForm, setShowQuotaForm] = useState(false);
  const [quotaForm, setQuotaForm] = useState({ memberId: "", planType: PLAN_TYPES[0], amount: data.config?.quotaAmount || "15000", dueDate: addDays(todayStr(), 10), status: "Pendiente" });

  const addPayment = () => {
    const member = data.members.find((m) => m.id === payForm.memberId);
    if (!member || !payForm.amount) { showToast("Completá socio y monto"); return; }
    const payment = { id: uid(), ...payForm, memberName: `${member.name} ${member.lastName}`, registeredBy: "Admin" };
    // mark matching pending quota as paid if exists
    const matchingQuota = data.quotas.find((q) => q.memberId === payForm.memberId && q.status !== "Pagada");
    const updatedQuotas = matchingQuota ? data.quotas.map((q) => q.id === matchingQuota.id ? { ...q, status: "Pagada" } : q) : data.quotas;
    persist({ ...data, payments: [payment, ...data.payments], quotas: updatedQuotas, members: data.members.map((m) => m.id === member.id && m.status === "Moroso" ? { ...m, status: "Activo" } : m) });
    setPayForm({ memberId: "", concept: "Cuota mensual", amount: data.config?.quotaAmount || "15000", method: "Transferencia", date: todayStr() });
    setShowPayForm(false); showToast("Pago registrado — recibo generado");
  };
  const addQuota = () => {
    const member = data.members.find((m) => m.id === quotaForm.memberId);
    if (!member) { showToast("Seleccioná un socio"); return; }
    persist({ ...data, quotas: [{ id: uid(), ...quotaForm, memberName: `${member.name} ${member.lastName}` }, ...data.quotas] });
    setQuotaForm({ memberId: "", planType: PLAN_TYPES[0], amount: data.config?.quotaAmount || "15000", dueDate: addDays(todayStr(), 10), status: "Pendiente" });
    setShowQuotaForm(false); showToast("Cuota generada");
  };
  const updateQuotaStatus = (id, status) => persist({ ...data, quotas: data.quotas.map((q) => q.id === id ? { ...q, status } : q) });

  const income = data.payments.reduce((s, p) => s + Number(p.amount), 0);
  const mpFees = data.payments.filter((p) => p.method === "Mercado Pago").reduce((s, p) => s + Number(p.amount) * MP_COMMISSION_RATE, 0);

  return (
    <div>
      <PageHeader title="Cuotas y Pagos" subtitle={`${data.payments.length} pagos registrados`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Total cobrado" value={fmtMoney(income)} tone="good" />
        <MiniStat label="Cuotas pendientes/vencidas" value={data.quotas.filter((q) => q.status !== "Pagada").length} tone="warn" />
        <MiniStat label="Comisiones MP estimadas" value={fmtMoney(mpFees)} tone="warn" />
      </div>

      <div style={{ marginBottom: 16 }}><FilterChips options={["Pagos", "Cuotas generadas"]} value={tab} onChange={setTab} /></div>

      {tab === "Pagos" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowPayForm(!showPayForm)}>{showPayForm ? "Cancelar" : "+ Registrar pago"}</Btn></div>
          {showPayForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Socio">
                  <Select value={payForm.memberId} onChange={(e) => setPayForm({ ...payForm, memberId: e.target.value })}>
                    <option value="">-</option>{data.members.map((m) => <option key={m.id} value={m.id}>{m.name} {m.lastName}</option>)}
                  </Select>
                </Field>
                <Field label="Concepto"><Input value={payForm.concept} onChange={(e) => setPayForm({ ...payForm, concept: e.target.value })} /></Field>
                <Field label="Monto"><Input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></Field>
                <Field label="Método"><Select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
                <Field label="Fecha"><Input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addPayment}>Registrar pago</Btn></div>
            </Card>
          )}
          {data.payments.length === 0 ? <Card><EmptyState text="No hay pagos registrados." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.payments.map((p) => (
                <Card key={p.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{p.memberName}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.concept} · {p.method} · {fmtDate(p.date)}</div>
                    </div>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: GREEN }}>{fmtMoney(p.amount)}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "Cuotas generadas" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowQuotaForm(!showQuotaForm)}>{showQuotaForm ? "Cancelar" : "+ Generar cuota"}</Btn></div>
          {showQuotaForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Socio">
                  <Select value={quotaForm.memberId} onChange={(e) => setQuotaForm({ ...quotaForm, memberId: e.target.value })}>
                    <option value="">-</option>{data.members.map((m) => <option key={m.id} value={m.id}>{m.name} {m.lastName}</option>)}
                  </Select>
                </Field>
                <Field label="Plan"><Select value={quotaForm.planType} onChange={(e) => setQuotaForm({ ...quotaForm, planType: e.target.value })}>{PLAN_TYPES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
                <Field label="Monto"><Input type="number" value={quotaForm.amount} onChange={(e) => setQuotaForm({ ...quotaForm, amount: e.target.value })} /></Field>
                <Field label="Vencimiento"><Input type="date" value={quotaForm.dueDate} onChange={(e) => setQuotaForm({ ...quotaForm, dueDate: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addQuota}>Generar</Btn></div>
            </Card>
          )}
          {data.quotas.length === 0 ? <Card><EmptyState text="No hay cuotas generadas." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.quotas.map((q) => (
                <Card key={q.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{q.memberName}</div>
                        <Badge tone={q.status === "Pagada" ? "green" : q.status === "Vencida" ? "red" : "gray"}>{q.status}</Badge>
                      </div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{q.planType} · vence {fmtDate(q.dueDate)}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(q.amount)}</div>
                      <Select value={q.status} onChange={(e) => updateQuotaStatus(q.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{QUOTA_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
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

// ==================== MOROSIDAD ====================
function Debtors({ data }) {
  const [sportFilter, setSportFilter] = useState("Todas");
  const debtByMember = {};
  data.quotas.filter((q) => q.status === "Vencida").forEach((q) => {
    debtByMember[q.memberId] = debtByMember[q.memberId] || { count: 0, total: 0 };
    debtByMember[q.memberId].count += 1;
    debtByMember[q.memberId].total += Number(q.amount);
  });
  let debtors = data.members.filter((m) => debtByMember[m.id]).map((m) => ({
    member: m, ...debtByMember[m.id], lastPayment: data.payments.filter((p) => p.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date))[0],
  }));
  if (sportFilter !== "Todas") debtors = debtors.filter((d) => d.member.sportName === sportFilter);
  debtors.sort((a, b) => b.total - a.total);

  const totalDebt = debtors.reduce((s, d) => s + d.total, 0);

  return (
    <div>
      <PageHeader title="Morosidad" subtitle={`${debtors.length} socios con cuotas vencidas · deuda total ${fmtMoney(totalDebt)}`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Todas", ...data.sports.map((s) => s.name)]} value={sportFilter} onChange={setSportFilter} /></div>
      {debtors.length === 0 ? <Card><EmptyState text="No hay socios morosos. 🎉" /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {debtors.map((d) => (
            <Card key={d.member.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE }}>{d.member.name} {d.member.lastName}</div>
                    <Badge tone="red">{d.count} cuota(s) vencida(s)</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>
                    {d.member.sportName || "-"} · último pago {d.lastPayment ? fmtDate(d.lastPayment.date) : "sin pagos"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: RED }}>{fmtMoney(d.total)}</div>
                  <Btn variant="secondary" href={waLink(d.member.whatsapp || d.member.phone, `Hola ${d.member.name}, te escribimos del club para recordarte que tenés cuotas pendientes por ${fmtMoney(d.total)}. ¡Gracias!`)}>Recordatorio WhatsApp</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== DISCIPLINAS Y CATEGORÍAS ====================
function Sports({ data, persist, showToast }) {
  const [showSportForm, setShowSportForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(null); // sportId
  const [sportForm, setSportForm] = useState({ name: "", description: "", coach: "", price: "", slots: "", status: "Activa" });
  const [catForm, setCatForm] = useState({ name: "", minAge: "", maxAge: "", coach: "", slots: "", schedule: "" });

  const addSport = () => {
    if (!sportForm.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, sports: [{ id: uid(), ...sportForm }, ...data.sports] });
    setSportForm({ name: "", description: "", coach: "", price: "", slots: "", status: "Activa" });
    setShowSportForm(false); showToast("Disciplina agregada");
  };
  const removeSport = (id) => persist({ ...data, sports: data.sports.filter((s) => s.id !== id), categories: data.categories.filter((c) => c.sportId !== id) });
  const addCategory = (sport) => {
    if (!catForm.name) { showToast("Completá el nombre de la categoría"); return; }
    persist({ ...data, categories: [{ id: uid(), ...catForm, sportId: sport.id, sportName: sport.name }, ...data.categories] });
    setCatForm({ name: "", minAge: "", maxAge: "", coach: "", slots: "", schedule: "" });
    setShowCatForm(null); showToast("Categoría agregada");
  };
  const removeCategory = (id) => persist({ ...data, categories: data.categories.filter((c) => c.id !== id) });

  return (
    <div>
      <PageHeader title="Disciplinas" subtitle={`${data.sports.length} disciplinas · ${data.categories.length} categorías`} action={<Btn onClick={() => setShowSportForm(!showSportForm)}>{showSportForm ? "Cancelar" : "+ Nueva disciplina"}</Btn>} />
      {showSportForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={sportForm.name} onChange={(e) => setSportForm({ ...sportForm, name: e.target.value })} placeholder="Fútbol" /></Field>
            <Field label="Profesor a cargo"><Input value={sportForm.coach} onChange={(e) => setSportForm({ ...sportForm, coach: e.target.value })} /></Field>
            <Field label="Precio"><Input type="number" value={sportForm.price} onChange={(e) => setSportForm({ ...sportForm, price: e.target.value })} /></Field>
            <Field label="Cupos"><Input type="number" value={sportForm.slots} onChange={(e) => setSportForm({ ...sportForm, slots: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addSport}>Guardar disciplina</Btn></div>
        </Card>
      )}
      {data.sports.length === 0 ? <Card><EmptyState text="No hay disciplinas cargadas." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.sports.map((sp) => (
            <Card key={sp.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: OFFWHITE }}>{sp.name}</div>
                    <Badge tone="green">{sp.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{sp.coach} · {fmtMoney(sp.price)} · {sp.slots} cupos</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="secondary" onClick={() => setShowCatForm(showCatForm === sp.id ? null : sp.id)}>+ Categoría</Btn>
                  <Btn variant="danger" onClick={() => removeSport(sp.id)}>Eliminar</Btn>
                </div>
              </div>

              {showCatForm === sp.id && (
                <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Field label="Nombre"><Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="Sub 14" /></Field>
                    <Field label="Edad mín."><Input type="number" value={catForm.minAge} onChange={(e) => setCatForm({ ...catForm, minAge: e.target.value })} /></Field>
                    <Field label="Edad máx."><Input type="number" value={catForm.maxAge} onChange={(e) => setCatForm({ ...catForm, maxAge: e.target.value })} /></Field>
                    <Field label="Entrenador"><Input value={catForm.coach} onChange={(e) => setCatForm({ ...catForm, coach: e.target.value })} /></Field>
                    <Field label="Horario"><Input value={catForm.schedule} onChange={(e) => setCatForm({ ...catForm, schedule: e.target.value })} placeholder="Lun y Mié 18:00" /></Field>
                  </div>
                  <div style={{ marginTop: 10 }}><Btn onClick={() => addCategory(sp)}>Guardar categoría</Btn></div>
                </div>
              )}

              {data.categories.filter((c) => c.sportId === sp.id).length > 0 && (
                <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.categories.filter((c) => c.sportId === sp.id).map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter" }}>
                      <span style={{ color: OFFWHITE }}>{c.name} <span style={{ color: GRAY }}>({c.minAge}-{c.maxAge} años) · {c.coach} · {c.schedule}</span></span>
                      <span onClick={() => removeCategory(c.id)} style={{ color: RED, cursor: "pointer" }}>eliminar</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== JUGADORES ====================
function Players({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [sportFilter, setSportFilter] = useState("Todas");
  const [form, setForm] = useState({ memberName: "", sportName: "", categoryName: "", jerseyNumber: "", position: "", coach: "", status: "Activo" });

  const filtered = sportFilter === "Todas" ? data.players : data.players.filter((p) => p.sportName === sportFilter);

  const addPlayer = () => {
    if (!form.memberName) { showToast("Completá el nombre del jugador"); return; }
    persist({ ...data, players: [{ id: uid(), ...form }, ...data.players] });
    setForm({ memberName: "", sportName: "", categoryName: "", jerseyNumber: "", position: "", coach: "", status: "Activo" });
    setShowForm(false); showToast("Jugador agregado");
  };
  const removePlayer = (id) => persist({ ...data, players: data.players.filter((p) => p.id !== id) });

  return (
    <div>
      <PageHeader title="Jugadores / Deportistas" subtitle={`${data.players.length} jugadores`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo jugador"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.memberName} onChange={(e) => setForm({ ...form, memberName: e.target.value })} list="mem-player" /></Field>
            <datalist id="mem-player">{data.members.map((m) => <option key={m.id} value={`${m.name} ${m.lastName}`} />)}</datalist>
            <Field label="Disciplina"><Select value={form.sportName} onChange={(e) => setForm({ ...form, sportName: e.target.value })}><option value="">-</option>{data.sports.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Categoría"><Select value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}><option value="">-</option>{data.categories.filter((c) => c.sportName === form.sportName).map((c) => <option key={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="N° camiseta"><Input type="number" value={form.jerseyNumber} onChange={(e) => setForm({ ...form, jerseyNumber: e.target.value })} /></Field>
            <Field label="Posición"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addPlayer}>Guardar jugador</Btn></div>
        </Card>
      )}
      <div style={{ marginBottom: 16 }}><FilterChips options={["Todas", ...data.sports.map((s) => s.name)]} value={sportFilter} onChange={setSportFilter} /></div>
      {filtered.length === 0 ? <Card><EmptyState text="No hay jugadores para mostrar." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>#{p.jerseyNumber} {p.memberName}</div>
                    <Badge tone="gray">{p.position}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{p.sportName} · {p.categoryName}</div>
                </div>
                <Btn variant="danger" onClick={() => removePlayer(p.id)}>Eliminar</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== ENTRENAMIENTOS Y ASISTENCIA ====================
function Trainings({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [attendanceFor, setAttendanceFor] = useState(null);
  const [form, setForm] = useState({ sportName: "", categoryName: "", coach: "", date: todayStr(), time: "18:00", duration: "90", facility: "", status: "Programado", attendance: [] });

  const addTraining = () => {
    if (!form.sportName) { showToast("Completá la disciplina"); return; }
    persist({ ...data, trainings: [{ id: uid(), ...form }, ...data.trainings] });
    setForm({ sportName: "", categoryName: "", coach: "", date: todayStr(), time: "18:00", duration: "90", facility: "", status: "Programado", attendance: [] });
    setShowForm(false); showToast("Entrenamiento agendado");
  };
  const removeTraining = (id) => persist({ ...data, trainings: data.trainings.filter((t) => t.id !== id) });
  const updateStatus = (id, status) => persist({ ...data, trainings: data.trainings.map((t) => t.id === id ? { ...t, status } : t) });
  const setAttendance = (trainingId, playerName, state) => {
    persist({
      ...data, trainings: data.trainings.map((t) => {
        if (t.id !== trainingId) return t;
        const rest = (t.attendance || []).filter((a) => a.playerName !== playerName);
        return { ...t, attendance: [...rest, { playerName, state }] };
      }),
    });
  };

  return (
    <div>
      <PageHeader title="Entrenamientos" subtitle={`${data.trainings.length} programados`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo entrenamiento"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Disciplina"><Select value={form.sportName} onChange={(e) => setForm({ ...form, sportName: e.target.value })}><option value="">-</option>{data.sports.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Categoría"><Select value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}><option value="">-</option>{data.categories.filter((c) => c.sportName === form.sportName).map((c) => <option key={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Profesor"><Input value={form.coach} onChange={(e) => setForm({ ...form, coach: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
            <Field label="Instalación"><Select value={form.facility} onChange={(e) => setForm({ ...form, facility: e.target.value })}><option value="">-</option>{data.facilities.map((f) => <option key={f.id}>{f.name}</option>)}</Select></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addTraining}>Guardar entrenamiento</Btn></div>
        </Card>
      )}
      {data.trainings.length === 0 ? <Card><EmptyState text="No hay entrenamientos programados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.trainings.map((t) => {
            const roster = data.players.filter((p) => p.sportName === t.sportName && (!t.categoryName || p.categoryName === t.categoryName));
            return (
              <Card key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{t.sportName} {t.categoryName}</div>
                      <Badge tone={t.status === "Realizado" ? "green" : t.status === "Suspendido" ? "red" : "gray"}>{t.status}</Badge>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{t.coach} · {fmtDate(t.date)} {t.time} · {t.facility}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Select value={t.status} onChange={(e) => updateStatus(t.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{TRAINING_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                    <Btn variant="secondary" onClick={() => setAttendanceFor(attendanceFor === t.id ? null : t.id)}>Asistencia</Btn>
                    <Btn variant="danger" onClick={() => removeTraining(t.id)}>Eliminar</Btn>
                  </div>
                </div>
                {attendanceFor === t.id && (
                  <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {roster.length === 0 ? <EmptyState text="No hay jugadores en esta disciplina/categoría." /> : roster.map((p) => {
                      const current = (t.attendance || []).find((a) => a.playerName === p.memberName)?.state;
                      return (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE }}>{p.memberName}</span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {ATTENDANCE_STATES.map((st) => (
                              <div key={st} onClick={() => setAttendance(t.id, p.memberName, st)} style={{
                                padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "Inter", fontWeight: 600,
                                background: current === st ? (st === "Presente" ? GREEN : st === "Ausente" ? RED : AMBER) : "transparent",
                                color: current === st ? CARBON : GRAY, border: `1px solid ${current === st ? "transparent" : BORDER}`,
                              }}>{st}</div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
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

// ==================== PARTIDOS Y CONVOCATORIAS ====================
function Matches({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [callupFor, setCallupFor] = useState(null);
  const [form, setForm] = useState({ sportName: "", categoryName: "", rival: "", date: todayStr(), time: "16:00", localVisit: "Local", place: "", result: "", callups: [] });

  const addMatch = () => {
    if (!form.rival) { showToast("Completá el rival"); return; }
    persist({ ...data, matches: [{ id: uid(), ...form }, ...data.matches] });
    setForm({ sportName: "", categoryName: "", rival: "", date: todayStr(), time: "16:00", localVisit: "Local", place: "", result: "", callups: [] });
    setShowForm(false); showToast("Partido agendado");
  };
  const removeMatch = (id) => persist({ ...data, matches: data.matches.filter((m) => m.id !== id) });
  const updateResult = (id, result) => persist({ ...data, matches: data.matches.map((m) => m.id === id ? { ...m, result } : m) });
  const setCallup = (matchId, playerName, state) => {
    persist({
      ...data, matches: data.matches.map((m) => {
        if (m.id !== matchId) return m;
        const rest = (m.callups || []).filter((c) => c.playerName !== playerName);
        return { ...m, callups: [...rest, { playerName, state }] };
      }),
    });
  };

  return (
    <div>
      <PageHeader title="Partidos y Convocatorias" subtitle={`${data.matches.length} partidos`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo partido"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Disciplina"><Select value={form.sportName} onChange={(e) => setForm({ ...form, sportName: e.target.value })}><option value="">-</option>{data.sports.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Categoría"><Select value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}><option value="">-</option>{data.categories.filter((c) => c.sportName === form.sportName).map((c) => <option key={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Rival"><Input value={form.rival} onChange={(e) => setForm({ ...form, rival: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Hora"><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
            <Field label="Local/Visitante"><Select value={form.localVisit} onChange={(e) => setForm({ ...form, localVisit: e.target.value })}>{MATCH_LOCALVISIT.map((l) => <option key={l}>{l}</option>)}</Select></Field>
            <Field label="Lugar"><Input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addMatch}>Guardar partido</Btn></div>
        </Card>
      )}
      {data.matches.length === 0 ? <Card><EmptyState text="No hay partidos agendados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...data.matches].sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
            const roster = data.players.filter((p) => p.sportName === m.sportName && (!m.categoryName || p.categoryName === m.categoryName));
            return (
              <Card key={m.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>vs. {m.rival}</div>
                      <Badge tone="gray">{m.localVisit}</Badge>
                      {m.result && <Badge tone="green">{m.result}</Badge>}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{m.sportName} {m.categoryName} · {fmtDate(m.date)} {m.time} · {m.place}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Input placeholder="Resultado" value={m.result} onChange={(e) => updateResult(m.id, e.target.value)} style={{ width: 90 }} />
                    <Btn variant="secondary" onClick={() => setCallupFor(callupFor === m.id ? null : m.id)}>Convocatoria</Btn>
                    <Btn variant="danger" onClick={() => removeMatch(m.id)}>Eliminar</Btn>
                  </div>
                </div>
                {callupFor === m.id && (
                  <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    {roster.length === 0 ? <EmptyState text="No hay jugadores en esta disciplina/categoría." /> : roster.map((p) => {
                      const current = (m.callups || []).find((c) => c.playerName === p.memberName)?.state;
                      return (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE }}>{p.memberName}</span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {CALLUP_STATES.map((st) => (
                              <div key={st} onClick={() => setCallup(m.id, p.memberName, st)} style={{
                                padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontFamily: "Inter", fontWeight: 600,
                                background: current === st ? GREEN : "transparent", color: current === st ? CARBON : GRAY, border: `1px solid ${current === st ? "transparent" : BORDER}`,
                              }}>{st}</div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
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

// ==================== PROFESORES ====================
function Coaches({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", dni: "", phone: "", sports: "", fee: "", status: "Activo" });

  const addCoach = () => {
    if (!form.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, coaches: [{ id: uid(), ...form }, ...data.coaches] });
    setForm({ name: "", dni: "", phone: "", sports: "", fee: "", status: "Activo" });
    setShowForm(false); showToast("Profesor agregado");
  };
  const removeCoach = (id) => persist({ ...data, coaches: data.coaches.filter((c) => c.id !== id) });

  return (
    <div>
      <PageHeader title="Profesores y Entrenadores" subtitle={`${data.coaches.length} profesores`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo profesor"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="DNI"><Input value={form.dni} onChange={(e) => setForm({ ...form, dni: e.target.value })} /></Field>
            <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Disciplinas"><Select value={form.sports} onChange={(e) => setForm({ ...form, sports: e.target.value })}><option value="">-</option>{data.sports.map((s) => <option key={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Honorarios"><Input type="number" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addCoach}>Guardar profesor</Btn></div>
        </Card>
      )}
      {data.coaches.length === 0 ? <Card><EmptyState text="No hay profesores cargados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.coaches.map((c) => (
            <Card key={c.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{c.name}</div>
                    <Badge tone="green">{c.status}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{c.sports} · {c.phone}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(c.fee)}</div>
                  <Btn variant="danger" onClick={() => removeCoach(c.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== INSTALACIONES Y RESERVAS ====================
function Facilities({ data, persist, showToast }) {
  const [tab, setTab] = useState("Reservas");
  const [showFacForm, setShowFacForm] = useState(false);
  const [facForm, setFacForm] = useState({ name: "", type: FACILITY_TYPES[0], capacity: "", status: "Disponible", price: "" });
  const [showResForm, setShowResForm] = useState(false);
  const [resForm, setResForm] = useState({ memberName: "", facilityName: "", date: todayStr(), time: "18:00", duration: "60", people: "", price: "", status: "Pendiente" });

  const addFacility = () => {
    if (!facForm.name) { showToast("Completá el nombre"); return; }
    persist({ ...data, facilities: [{ id: uid(), ...facForm }, ...data.facilities] });
    setFacForm({ name: "", type: FACILITY_TYPES[0], capacity: "", status: "Disponible", price: "" });
    setShowFacForm(false); showToast("Instalación agregada");
  };
  const removeFacility = (id) => persist({ ...data, facilities: data.facilities.filter((f) => f.id !== id) });

  const overlaps = (a, b) => a.facilityName === b.facilityName && a.date === b.date && a.time === b.time;
  const addReservation = () => {
    if (!resForm.facilityName || !resForm.memberName) { showToast("Completá socio e instalación"); return; }
    if (data.reservations.some((r) => overlaps(r, resForm) && r.status !== "Cancelada")) { showToast("Ya hay una reserva en ese horario para esa instalación"); return; }
    persist({ ...data, reservations: [{ id: uid(), ...resForm }, ...data.reservations] });
    setResForm({ memberName: "", facilityName: "", date: todayStr(), time: "18:00", duration: "60", people: "", price: "", status: "Pendiente" });
    setShowResForm(false); showToast("Reserva creada");
  };
  const removeReservation = (id) => persist({ ...data, reservations: data.reservations.filter((r) => r.id !== id) });
  const updateResStatus = (id, status) => persist({ ...data, reservations: data.reservations.map((r) => r.id === id ? { ...r, status } : r) });

  return (
    <div>
      <PageHeader title="Instalaciones y Reservas" subtitle={`${data.facilities.length} instalaciones · ${data.reservations.length} reservas`} />
      <div style={{ marginBottom: 16 }}><FilterChips options={["Reservas", "Instalaciones"]} value={tab} onChange={setTab} /></div>

      {tab === "Instalaciones" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowFacForm(!showFacForm)}>{showFacForm ? "Cancelar" : "+ Nueva instalación"}</Btn></div>
          {showFacForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Nombre"><Input value={facForm.name} onChange={(e) => setFacForm({ ...facForm, name: e.target.value })} /></Field>
                <Field label="Tipo"><Select value={facForm.type} onChange={(e) => setFacForm({ ...facForm, type: e.target.value })}>{FACILITY_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
                <Field label="Capacidad"><Input type="number" value={facForm.capacity} onChange={(e) => setFacForm({ ...facForm, capacity: e.target.value })} /></Field>
                <Field label="Precio de reserva"><Input type="number" value={facForm.price} onChange={(e) => setFacForm({ ...facForm, price: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addFacility}>Guardar instalación</Btn></div>
            </Card>
          )}
          {data.facilities.length === 0 ? <Card><EmptyState text="No hay instalaciones cargadas." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.facilities.map((f) => (
                <Card key={f.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{f.name}</div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{f.type} · capacidad {f.capacity}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(f.price)}</div>
                      <Btn variant="danger" onClick={() => removeFacility(f.id)}>Eliminar</Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "Reservas" && (
        <>
          <div style={{ marginBottom: 14 }}><Btn onClick={() => setShowResForm(!showResForm)}>{showResForm ? "Cancelar" : "+ Nueva reserva"}</Btn></div>
          {showResForm && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Field label="Socio"><Input value={resForm.memberName} onChange={(e) => setResForm({ ...resForm, memberName: e.target.value })} list="mem-res" /></Field>
                <datalist id="mem-res">{data.members.map((m) => <option key={m.id} value={`${m.name} ${m.lastName}`} />)}</datalist>
                <Field label="Instalación"><Select value={resForm.facilityName} onChange={(e) => setResForm({ ...resForm, facilityName: e.target.value, price: data.facilities.find((f) => f.name === e.target.value)?.price || "" })}><option value="">-</option>{data.facilities.map((f) => <option key={f.id}>{f.name}</option>)}</Select></Field>
                <Field label="Fecha"><Input type="date" value={resForm.date} onChange={(e) => setResForm({ ...resForm, date: e.target.value })} /></Field>
                <Field label="Hora"><Input type="time" value={resForm.time} onChange={(e) => setResForm({ ...resForm, time: e.target.value })} /></Field>
                <Field label="Personas"><Input type="number" value={resForm.people} onChange={(e) => setResForm({ ...resForm, people: e.target.value })} /></Field>
              </div>
              <div style={{ marginTop: 14 }}><Btn onClick={addReservation}>Guardar reserva</Btn></div>
            </Card>
          )}
          {data.reservations.length === 0 ? <Card><EmptyState text="No hay reservas." /></Card> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...data.reservations].sort((a, b) => a.date.localeCompare(b.date)).map((r) => (
                <Card key={r.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{r.facilityName}</div>
                        <Badge tone={r.status === "Pagada" ? "green" : r.status === "Cancelada" ? "red" : "gray"}>{r.status}</Badge>
                      </div>
                      <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{r.memberName} · {fmtDate(r.date)} {r.time}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(r.price)}</div>
                      <Select value={r.status} onChange={(e) => updateResStatus(r.id, e.target.value)} style={{ padding: "6px 8px", fontSize: 12 }}>{RESERVATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
                      <Btn variant="danger" onClick={() => removeReservation(r.id)}>Eliminar</Btn>
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

// ==================== EVENTOS ====================
function Events({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: EVENT_TYPES[0], date: todayStr(), place: "", capacity: "", price: "", status: "Programado", participants: [] });

  const addEvent = () => {
    if (!form.name) { showToast("Completá el nombre del evento"); return; }
    persist({ ...data, events: [{ id: uid(), ...form }, ...data.events] });
    setForm({ name: "", type: EVENT_TYPES[0], date: todayStr(), place: "", capacity: "", price: "", status: "Programado", participants: [] });
    setShowForm(false); showToast("Evento creado");
  };
  const removeEvent = (id) => persist({ ...data, events: data.events.filter((e) => e.id !== id) });

  return (
    <div>
      <PageHeader title="Eventos" subtitle={`${data.events.length} eventos`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo evento"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Nombre"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Tipo"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Lugar"><Input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} /></Field>
            <Field label="Capacidad"><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
            <Field label="Precio"><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addEvent}>Guardar evento</Btn></div>
        </Card>
      )}
      {data.events.length === 0 ? <Card><EmptyState text="No hay eventos programados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.events.map((e) => (
            <Card key={e.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{e.name}</div>
                    <Badge tone="gray">{e.type}</Badge>
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{fmtDate(e.date)} · {e.place} · {(e.participants || []).length}/{e.capacity} inscriptos</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: GREEN }}>{fmtMoney(e.price)}</div>
                  <Btn variant="danger" onClick={() => removeEvent(e.id)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== INVENTARIO ====================
function Inventory({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product: "", quantity: "", minStock: "", location: "" });

  const addItem = () => {
    if (!form.product) { showToast("Completá el producto"); return; }
    persist({ ...data, inventory: [{ id: uid(), ...form }, ...data.inventory] });
    setForm({ product: "", quantity: "", minStock: "", location: "" });
    setShowForm(false); showToast("Ítem agregado");
  };
  const updateQty = (id, quantity) => persist({ ...data, inventory: data.inventory.map((i) => i.id === id ? { ...i, quantity } : i) });
  const removeItem = (id) => persist({ ...data, inventory: data.inventory.filter((i) => i.id !== id) });

  return (
    <div>
      <PageHeader title="Inventario" subtitle={`${data.inventory.length} productos`} action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo producto"}</Btn>} />
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Producto"><Input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Pelotas fútbol N°5" /></Field>
            <Field label="Cantidad"><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Stock mínimo"><Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></Field>
            <Field label="Ubicación"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Btn onClick={addItem}>Guardar producto</Btn></div>
        </Card>
      )}
      {data.inventory.length === 0 ? <Card><EmptyState text="No hay productos cargados." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.inventory.map((i) => {
            const low = Number(i.quantity) <= Number(i.minStock);
            return (
              <Card key={i.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{i.product}</div>
                      {low && <Badge tone="red">Stock bajo</Badge>}
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{i.location} · mínimo {i.minStock}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Input type="number" value={i.quantity} onChange={(e) => updateQty(i.id, e.target.value)} style={{ width: 80 }} />
                    <Btn variant="danger" onClick={() => removeItem(i.id)}>Eliminar</Btn>
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

// ==================== CAJA (incluye Gastos) ====================
function Cash({ data, persist, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Ingreso", concept: "", category: EXPENSE_CATEGORIES[0], amount: "", method: "Transferencia", date: todayStr() });

  const balance = data.cash.reduce((s, c) => s + (c.type === "Ingreso" ? Number(c.amount) : -Number(c.amount)), 0);
  const income = data.cash.filter((c) => c.type === "Ingreso").reduce((s, c) => s + Number(c.amount), 0);
  const expense = data.cash.filter((c) => c.type === "Egreso").reduce((s, c) => s + Number(c.amount), 0);

  const addEntry = () => {
    if (!form.concept || !form.amount) { showToast("Completá concepto y monto"); return; }
    persist({ ...data, cash: [{ id: uid(), ...form }, ...data.cash] });
    setForm({ type: "Ingreso", concept: "", category: EXPENSE_CATEGORIES[0], amount: "", method: "Transferencia", date: todayStr() });
    setShowForm(false); showToast("Movimiento registrado");
  };
  const removeEntry = (id) => persist({ ...data, cash: data.cash.filter((c) => c.id !== id) });

  const byCategory = {};
  data.cash.filter((c) => c.type === "Egreso").forEach((c) => { byCategory[c.category || "Otros"] = (byCategory[c.category || "Otros"] || 0) + Number(c.amount); });

  return (
    <div>
      <PageHeader title="Caja y Finanzas" subtitle="Ingresos, egresos y gastos" action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nuevo movimiento"}</Btn>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
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
            <Field label="Método"><Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option>Transferencia</option><option>Efectivo</option><option>Mercado Pago</option></Select></Field>
            <Field label="Fecha"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
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
                    <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{c.concept}</div>
                    <Badge tone={c.type === "Ingreso" ? "green" : "red"}>{c.type}</Badge>
                    {c.category && <Badge tone="gray">{c.category}</Badge>}
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 4 }}>{fmtDate(c.date)} · {c.method}</div>
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

// ==================== COMUNICACIÓN ====================
const MESSAGE_TEMPLATES = [
  { title: "Recordatorio de cuota", text: "Hola {{nombre}}, te recordamos que tenés una cuota próxima a vencer. ¡Gracias!" },
  { title: "Entrenamiento suspendido", text: "Hola {{nombre}}, el entrenamiento de hoy queda suspendido. Cualquier duda, escribinos." },
  { title: "Convocatoria", text: "Hola {{nombre}}, estás convocado/a para el partido de este fin de semana. ¡Nos vemos en la cancha!" },
  { title: "Partido del sábado", text: "Hola {{nombre}}, te recordamos que jugamos este sábado. ¡Te esperamos!" },
  { title: "Evento del club", text: "Hola {{nombre}}, te invitamos al próximo evento del club. ¡No te lo pierdas!" },
];

function Communication({ data }) {
  const [segment, setSegment] = useState("Todos los socios");
  const [templateIdx, setTemplateIdx] = useState(0);

  const segments = ["Todos los socios", ...data.sports.map((s) => s.name), "Morosos", "Profesores"];
  let recipients = data.members;
  if (segment === "Morosos") recipients = data.members.filter((m) => m.status === "Moroso");
  else if (segment !== "Todos los socios" && data.sports.some((s) => s.name === segment)) recipients = data.members.filter((m) => m.sportName === segment);
  else if (segment === "Profesores") recipients = data.coaches;

  return (
    <div>
      <PageHeader title="Comunicación" subtitle="Plantillas de mensajes y envío individual por WhatsApp" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Inter", fontSize: 12.5, color: GRAY, marginBottom: 10 }}>
          El envío masivo automático requiere WhatsApp Business API (a conectar). Por ahora, cada mensaje se abre individualmente vía WhatsApp Web/App.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Field label="Segmento"><Select value={segment} onChange={(e) => setSegment(e.target.value)}>{segments.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          <Field label="Plantilla">
            <Select value={templateIdx} onChange={(e) => setTemplateIdx(Number(e.target.value))}>
              {MESSAGE_TEMPLATES.map((t, i) => <option key={t.title} value={i}>{t.title}</option>)}
            </Select>
          </Field>
        </div>
        <div style={{ marginTop: 10, fontFamily: "Inter", fontSize: 12.5, color: OFFWHITE, background: CARD2, padding: 12, borderRadius: 8 }}>{MESSAGE_TEMPLATES[templateIdx].text}</div>
      </Card>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>Destinatarios ({recipients.length})</div>
      {recipients.length === 0 ? <Card><EmptyState text="No hay destinatarios en este segmento." /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recipients.map((r) => (
            <Card key={r.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Inter", fontSize: 13, color: OFFWHITE }}>{r.name} {r.lastName || ""}</span>
                <Btn variant="secondary" href={waLink(r.whatsapp || r.phone, MESSAGE_TEMPLATES[templateIdx].text.replace("{{nombre}}", r.name))}>Enviar WhatsApp</Btn>
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
  const activeMembers = data.members.filter((m) => m.status === "Activo").length;
  const newMembers = data.members.filter((m) => daysBetween(m.entryDate, todayStr()) <= 30).length;
  const lowMembers = data.members.filter((m) => m.status === "Baja").length;
  const overdueMembers = data.members.filter((m) => m.status === "Moroso").length;
  const income = data.cash.filter((c) => c.type === "Ingreso").reduce((s, c) => s + Number(c.amount), 0);
  const expense = data.cash.filter((c) => c.type === "Egreso").reduce((s, c) => s + Number(c.amount), 0);
  const attendanceRecords = data.trainings.flatMap((t) => t.attendance || []);
  const presentRate = attendanceRecords.length ? Math.round((attendanceRecords.filter((a) => a.state === "Presente").length / attendanceRecords.length) * 100) : 0;

  const bySport = {};
  data.members.forEach((m) => { if (m.sportName) bySport[m.sportName] = (bySport[m.sportName] || 0) + Number(data.config.quotaAmount || 0); });

  const exportMembers = () => downloadCSV("socios.csv", data.members.map((m) => ({ numero: m.memberNumber, nombre: m.name, apellido: m.lastName, estado: m.status, plan: m.planType, disciplina: m.sportName })));
  const exportCash = () => downloadCSV("caja.csv", data.cash.map((c) => ({ tipo: c.type, concepto: c.concept, categoria: c.category || "", monto: c.amount, metodo: c.method, fecha: c.date })));

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Estadísticas generales del club" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        <MiniStat label="Socios activos" value={activeMembers} />
        <MiniStat label="Nuevos socios (30 días)" value={newMembers} />
        <MiniStat label="Bajas" value={lowMembers} />
        <MiniStat label="Morosidad" value={overdueMembers} tone={overdueMembers > 0 ? "warn" : undefined} />
        <MiniStat label="Ingresos totales" value={fmtMoney(income)} tone="good" />
        <MiniStat label="Egresos totales" value={fmtMoney(expense)} />
        <MiniStat label="Asistencia promedio" value={`${presentRate}%`} />
        <MiniStat label="Jugadores" value={data.players.length} />
      </div>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Ingresos por disciplina (estimado, según socios activos)</div>
        {Object.keys(bySport).length === 0 ? <EmptyState text="Sin datos todavía." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(bySport).map(([name, amt]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontFamily: "Inter" }}>
                <span style={{ color: OFFWHITE }}>{name}</span><span style={{ color: GREEN, fontWeight: 600 }}>{fmtMoney(amt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={exportMembers}>Exportar socios (CSV)</Btn>
        <Btn variant="secondary" onClick={exportCash}>Exportar caja (CSV)</Btn>
      </div>
    </div>
  );
}

// ==================== CONFIGURACIÓN ====================
function Config({ data, persist, showToast }) {
  const [clubName, setClubName] = useState(data.config?.clubName || "");
  const [quotaAmount, setQuotaAmount] = useState(data.config?.quotaAmount || "15000");

  const saveConfig = () => { persist({ ...data, config: { ...data.config, clubName, quotaAmount } }); showToast("Configuración guardada"); };

  const roles = [
    { name: "Administrador", desc: "Acceso total al sistema." },
    { name: "Presidente / Directivo", desc: "Reportes, finanzas y gestión general." },
    { name: "Administrativo", desc: "Socios, cuotas, pagos y documentación." },
    { name: "Profesor", desc: "Jugadores, entrenamientos, asistencia y partidos." },
  ];

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Datos del club, roles y automatizaciones" />
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 12 }}>Datos del club</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Input value={clubName} onChange={(e) => setClubName(e.target.value)} placeholder="Nombre del club" style={{ flex: 1 }} />
          <Input type="number" value={quotaAmount} onChange={(e) => setQuotaAmount(e.target.value)} placeholder="Monto cuota default" style={{ width: 180 }} />
          <Btn onClick={saveConfig}>Guardar</Btn>
        </div>
        <div style={{ fontSize: 11.5, color: GRAY, marginTop: 10, fontFamily: "Inter" }}>El sistema mantiene la identidad de Enlata2 (isotipo, verde eléctrico, tipografías) como base — el nombre del club es lo único personalizable acá.</div>
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
        <div style={{ fontSize: 11.5, color: GRAY, marginTop: 10, fontFamily: "Inter" }}>Probá el selector "Ver como" en el panel lateral para simular cada rol. El Portal del Socio es un producto aparte, no incluido acá.</div>
      </Card>
      <Card>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 8 }}>Automatizaciones (n8n + WhatsApp Business API + Mercado Pago)</div>
        <div style={{ fontSize: 12.5, color: GRAY, fontFamily: "Inter", marginBottom: 10 }}>Requieren backend real — no están activas en este prototipo.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Nueva inscripción → enviar bienvenida", "Cuota próxima a vencer → recordatorio", "Cuota vencida → aviso", "Entrenamiento cancelado → notificar jugadores", "Partido próximo → recordar convocatoria", "Reserva confirmada → confirmación", "Cumpleaños → saludo automático", "Pago Mercado Pago confirmado → actualizar estado de cuota"].map((a) => (
            <div key={a} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontFamily: "Inter", color: OFFWHITE, padding: "6px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span>{a}</span><Badge tone="gray">A conectar</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
