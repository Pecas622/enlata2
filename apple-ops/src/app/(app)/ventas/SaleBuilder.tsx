"use client";

// Punto de venta: equipos, accesorios y conceptos libres en una operación, con plan canje y varios
// medios de pago. Portado de SaleBuilder del prototipo.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AppraisalBox, DeviceEvalForm, newDraft, type DeviceDraft } from "@/components/DeviceEvalForm";
import { Notice } from "@/components/ui";
import { suggestedResale } from "@/lib/appraise";
import { METHODS, deviceTitle, methodOf } from "@/lib/catalog";
import { CONDICIONES_RECEPTOR, letraFor, receptorError, type CondicionEmisor, type CondicionReceptor } from "@/lib/factura";
import { fmtARS, fmtCur, fmtUSD } from "@/lib/money";
import type { Perms } from "@/lib/roles";
import { paymentsUSD, restFor, saleProblems, saleTotals, tradeInState, type CartLine, type Payment } from "@/lib/sale";
import type { StoreConfig } from "@/lib/store";
import { imeiInStock } from "../ingresos/actions";
import { registrarVenta } from "./actions";
import type { PosAccessory, PosClient, PosDevice, PosSeller } from "./pos-data";

type Props = {
  cfg: StoreConfig;
  devices: PosDevice[];
  accessories: PosAccessory[];
  clients: PosClient[];
  sellers: PosSeller[];
  shiftOpen: boolean;
  perms: Perms;
  userId: string;
  canTradeIn: boolean;
  startWithTradeIn?: boolean;
  requireImei?: boolean;
  // Con facturación automática, la venta pide los datos del cliente para la factura.
  invoicing?: { emisor: CondicionEmisor } | null;
};

const firstPayment = (): Payment[] => [{ method: "Efectivo USD", amount: "" }];

export function SaleBuilder({ cfg, devices, accessories, clients, sellers, shiftOpen, perms, userId, canTradeIn, startWithTradeIn = false, requireImei = true, invoicing = null }: Props) {
  const router = useRouter();
  const fx = cfg.fx;
  const [tab, setTab] = useState<"equipos" | "accesorios" | "libre">("equipos");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [seller, setSeller] = useState(sellers.some((s) => s.id === userId) ? userId : sellers[0]?.id ?? "");
  const [useTI, setUseTI] = useState(startWithTradeIn && canTradeIn);
  const [draft, setDraft] = useState<DeviceDraft>(newDraft("Usado B"));
  const [tiValue, setTiValue] = useState("");
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>(firstPayment);
  const [notes, setNotes] = useState("");
  const [freeDesc, setFreeDesc] = useState("");
  const [freePrice, setFreePrice] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [recCond, setRecCond] = useState<CondicionReceptor>(5);
  const [recDoc, setRecDoc] = useState("");
  const [recName, setRecName] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!useTI) return;
    let alive = true;
    const t = setTimeout(async () => {
      const dup = await imeiInStock(draft.imei);
      if (alive) setDuplicate(dup);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [draft.imei, useTI]);

  const totals = saleTotals(lines, discountPct, fx);
  const ti = useTI ? tradeInState(draft, cfg, tiValue, perms.overTradeIn, Boolean(duplicate), requireImei) : null;
  const tiUSD = ti && ti.valid ? ti.value : 0;
  const due = totals.revenue - tiUSD;
  const paid = paymentsUSD(payments, fx);
  const problems = saleProblems({ shiftOpen, lines, discountPct, maxDiscount: cfg.maxDiscountSeller, editPrice: perms.editPrice, tradeIn: ti, due, paid, seller });
  const selectedClient = clients.find((c) => c.id === clientId);
  const receptor = { condicion: recCond, doc: recDoc, nombre: recName || (recCond === 5 ? "" : selectedClient?.name ?? clientName) };
  const invoiceProblem = invoicing ? receptorError(invoicing.emisor, receptor) : null;
  if (invoiceProblem) problems.push(invoiceProblem);
  const canConfirm = problems.length === 0 && !pending;

  const inCart = (id: string) => lines.find((l) => l.refId === id);
  const addDevice = (d: PosDevice) => {
    if (inCart(d.id)) return;
    setLines([...lines, { kind: "device", refId: d.id, desc: deviceTitle(d), qty: 1, unit: d.price_usd, currency: "USD", maxQty: 1 }]);
  };
  const addAcc = (a: PosAccessory) => {
    const ex = inCart(a.id);
    if (ex) {
      if (ex.qty < a.stock) setLines(lines.map((l) => (l.refId === a.id ? { ...l, qty: l.qty + 1 } : l)));
      return;
    }
    if (a.stock <= 0) return;
    setLines([...lines, { kind: "acc", refId: a.id, desc: a.name, qty: 1, unit: a.price_ars, currency: "ARS", maxQty: a.stock }]);
  };
  const addFree = () => {
    if (!freeDesc.trim() || !Number(freePrice)) return;
    setLines([...lines, { kind: "service", refId: `svc-${Date.now()}`, desc: freeDesc.trim(), qty: 1, unit: Number(freePrice), currency: "ARS", maxQty: 1 }]);
    setFreeDesc("");
    setFreePrice("");
  };
  const setLine = (i: number, patch: Partial<CartLine>) => setLines(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const setPay = (i: number, patch: Partial<Payment>) => setPayments(payments.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  const needle = q.trim().toLowerCase();
  const availDevices = useMemo(
    () => devices.filter((d) => !needle || `${deviceTitle(d)} ${d.imei} ${d.condition}`.toLowerCase().includes(needle)),
    [devices, needle],
  );
  const availAcc = useMemo(
    () => accessories.filter((a) => !needle || `${a.name} ${a.sku} ${a.category}`.toLowerCase().includes(needle)),
    [accessories, needle],
  );

  const confirm = () => {
    if (!canConfirm) return;
    setServerError(null);
    startTransition(async () => {
      const res = await registrarVenta({
        lines, discountPct: Number(discountPct) || 0, sellerId: seller, clientId,
        clientName: clientId ? "" : clientName, clientPhone: clientId ? "" : clientPhone, notes,
        payments: payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 })),
        tradeIn: useTI ? { ...draft, valueStr: tiValue } : null,
        receptor: invoicing ? { ...receptor, nombre: receptor.nombre || (selectedClient?.name ?? clientName) } : null,
      });
      if (res.error) return setServerError(res.error);
      router.push(`/ventas/${res.saleId}?nueva=1`);
    });
  };

  return (
    <div className="grid-2">
      <div className="card">
        <div className="pills">
          {(["equipos", "accesorios", "libre"] as const).map((t) => (
            <button key={t} className={`pill${tab === t ? " active" : ""}`} onClick={() => setTab(t)} data-testid={`pos-tab-${t}`}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        {tab !== "libre" && (
          <input className="input" style={{ marginBottom: 12 }} data-testid="pos-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "equipos" ? "Buscar modelo, IMEI, condición..." : "Buscar accesorio o SKU..."} />
        )}
        {tab === "equipos" && (
          <div className="pos-list">
            {availDevices.length === 0 && <div className="empty">No hay equipos disponibles con ese filtro.</div>}
            {availDevices.map((d) => (
              <button key={d.id} type="button" className={`pos-item${inCart(d.id) ? " on" : ""}`} onClick={() => addDevice(d)} data-testid="pos-device">
                <div>
                  <b>{deviceTitle(d)}</b>
                  <small>{d.condition}{d.battery && d.condition !== "Nuevo sellado" ? ` · batería ${d.battery}%` : ""}{d.imei ? ` · IMEI …${d.imei.slice(-4)}` : ""}</small>
                </div>
                <span className="price">{fmtUSD(d.price_usd)}</span>
              </button>
            ))}
          </div>
        )}
        {tab === "accesorios" && (
          <div className="pos-list">
            {availAcc.map((a) => (
              <button key={a.id} type="button" className="pos-item" disabled={a.stock <= 0} onClick={() => addAcc(a)} data-testid="pos-acc">
                <div>
                  <b>{a.name}</b>
                  <small>{a.sku} · {a.stock > 0 ? `${a.stock} en stock` : "Sin stock"}</small>
                </div>
                <span className="price" style={{ color: "var(--text)" }}>{fmtARS(a.price_ars)}</span>
              </button>
            ))}
          </div>
        )}
        {tab === "libre" && (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Servicios o conceptos sin stock: instalación de vidrio, configuración, limpieza.</p>
            <label className="field">Concepto<input className="input" value={freeDesc} onChange={(e) => setFreeDesc(e.target.value)} placeholder="Ej: Colocación de vidrio" data-testid="pos-free-desc" /></label>
            <label className="field">Precio (ARS)<input className="input" type="number" value={freePrice} onChange={(e) => setFreePrice(e.target.value)} data-testid="pos-free-price" /></label>
            <button className="btn btn-secondary" onClick={addFree} data-testid="pos-free-add">Agregar al carrito</button>
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card" data-testid="cart">
          <h2 className="card-title">Carrito</h2>
          {lines.length === 0 && <div className="empty">Tocá un producto para agregarlo.</div>}
          {lines.map((l, i) => (
            <div key={l.refId} className="cart-line">
              <div style={{ flex: 1 }}>{l.desc}</div>
              {l.kind === "acc" && (
                <div className="qty">
                  <button type="button" onClick={() => setLine(i, { qty: Math.max(1, l.qty - 1) })} aria-label="Uno menos">−</button>
                  <span data-testid="cart-qty">{l.qty}</span>
                  <button type="button" onClick={() => setLine(i, { qty: Math.min(l.maxQty, l.qty + 1) })} aria-label="Uno más">+</button>
                </div>
              )}
              {perms.editPrice ? (
                <div className="qty"><small>{l.currency}</small><input className="input" type="number" value={l.unit} onChange={(e) => setLine(i, { unit: Number(e.target.value) || 0 })} style={{ width: 96 }} data-testid="cart-price" /></div>
              ) : (
                <div style={{ minWidth: 80, textAlign: "right" }}>{fmtCur(l.unit * l.qty, l.currency)}</div>
              )}
              <button type="button" className="remove" onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label="Quitar">×</button>
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <label className="field">
              Cliente
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} data-testid="pos-client">
                <option value="">Cliente nuevo / mostrador</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">
              Vendedor
              <select className="input" value={seller} onChange={(e) => setSeller(e.target.value)} data-testid="pos-seller">
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          {!clientId && (
            <div className="row" style={{ marginTop: 10 }}>
              <label className="field">Nombre<input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Opcional" data-testid="pos-client-name" /></label>
              <label className="field">WhatsApp<input className="input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Opcional" /></label>
            </div>
          )}
          {invoicing && (
            <div className="row" style={{ marginTop: 10 }} data-testid="pos-invoice">
              <label className="field">
                Factura {letraFor(invoicing.emisor, recCond)}
                <select className="input" value={recCond} onChange={(e) => setRecCond(Number(e.target.value) as CondicionReceptor)} data-testid="pos-inv-cond">
                  {CONDICIONES_RECEPTOR.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label className="field">
                {recCond === 5 ? "DNI o CUIT" : "CUIT"}
                <input className="input" value={recDoc} onChange={(e) => setRecDoc(e.target.value)} inputMode="numeric" placeholder={recCond === 5 ? "Opcional" : ""} data-testid="pos-inv-doc" />
              </label>
              {recCond !== 5 && (
                <label className="field">Razón social<input className="input" value={recName} onChange={(e) => setRecName(e.target.value)} placeholder={selectedClient?.name ?? clientName} data-testid="pos-inv-name" /></label>
              )}
            </div>
          )}
          <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
            <label className="field">Descuento (%)<input className="input" type="number" min={0} max={100} value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} data-testid="pos-discount" /></label>
            {canTradeIn && (
              <label className="check" style={{ paddingBottom: 10, fontWeight: 600, color: useTI ? "var(--accent)" : undefined }}>
                <input type="checkbox" checked={useTI} onChange={(e) => setUseTI(e.target.checked)} data-testid="pos-use-tradein" />Plan canje
              </label>
            )}
          </div>
        </div>

        {useTI && ti && (
          <div className="card tradein" data-testid="tradein-block">
            <h2 className="card-title" style={{ color: "var(--accent)" }}>Equipo que entrega el cliente</h2>
            <div className="stack">
              <DeviceEvalForm draft={draft} onChange={setDraft} kinds={["iPhone", "iPad", "Mac"]} duplicate={duplicate} imeiOptional={!requireImei} />
              <AppraisalBox ap={draft.model ? ti.ap : null} />
              <div className="row">
                <label className="field">
                  Valor tomado (USD)
                  <input className="input" type="number" value={tiValue === "" ? (ti.ap.ok ? ti.ap.value : "") : tiValue} onChange={(e) => setTiValue(e.target.value)} data-testid="ti-value" />
                  <span>{perms.overTradeIn ? "Podés ajustar el valor sugerido." : "Máximo: el valor sugerido."}</span>
                </label>
                {perms.seeCost && (
                  <label className="field">Precio de reventa sugerido<input className="input" readOnly value={fmtUSD(suggestedResale(cfg, ti.value))} /></label>
                )}
              </div>
              {ti.errors.length > 0 && draft.model && <Notice>{ti.errors[0]}</Notice>}
            </div>
          </div>
        )}

        <div className="card">
          <h2 className="card-title">Cobro</h2>
          <div className="lines" style={{ background: "transparent", border: 0, padding: 0 }}>
            <div><span>Subtotal</span><span>{fmtUSD(totals.sub)}</span></div>
            {totals.discount > 0 && <div className="neg"><span>Descuento {discountPct}%</span><span>−{fmtUSD(totals.discount)}</span></div>}
            {tiUSD > 0 && <div className="ok"><span>Plan canje (equipo recibido)</span><span>−{fmtUSD(tiUSD)}</span></div>}
            <div className="total" style={{ fontSize: 16 }}>
              <span>{tiUSD > 0 ? "Diferencia a pagar" : "Total a pagar"}</span>
              <b data-testid="pos-due">{fmtUSD(Math.max(0, due))}</b>
            </div>
            <div className="muted" style={{ justifyContent: "flex-end", fontSize: 11.5 }}>≈ {fmtARS(Math.max(0, due) * fx)} · cotización {fmtARS(fx)}</div>
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 14 }}>
            {payments.map((p, i) => (
              <div key={i} className="row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
                <select className="input" style={{ flex: 1 }} value={p.method} onChange={(e) => setPay(i, { method: e.target.value })} data-testid={`pay-method-${i}`}>
                  {METHODS.map((m) => <option key={m.id}>{m.id}</option>)}
                </select>
                <input className="input" style={{ width: 120 }} type="number" placeholder={methodOf(p.method).cur} value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} data-testid={`pay-amount-${i}`} />
                <button type="button" className="link" onClick={() => setPay(i, { amount: String(restFor(payments, i, due, fx)) })} title="Completar con el saldo" data-testid={`pay-rest-${i}`}>Saldo</button>
                {payments.length > 1 && <button type="button" className="remove" onClick={() => setPayments(payments.filter((_, k) => k !== i))} aria-label="Quitar pago">×</button>}
              </div>
            ))}
            <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={() => setPayments([...payments, { method: "Transferencia ARS", amount: "" }])} data-testid="pay-add">+ Agregar medio de pago</button>
          </div>
          <label className="field" style={{ marginTop: 10 }}>Notas<input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" /></label>
          {(lines.length > 0 || !shiftOpen) && problems.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Notice>
                {problems[0]}
                {!shiftOpen && (perms.seeAllShifts || perms.blindCount) && <> <Link href="/caja" style={{ textDecoration: "underline" }}>Ir a Caja</Link></>}
              </Notice>
            </div>
          )}
          {serverError && <div className="error" role="alert" data-testid="form-error" style={{ marginTop: 12 }}>{serverError}</div>}
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={!canConfirm} onClick={confirm} data-testid="pos-confirm">
            {pending ? "Registrando…" : "Confirmar venta"}
          </button>
        </div>
      </div>
    </div>
  );
}
