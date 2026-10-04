"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AppraisalBox, DeviceEvalForm, newDraft, type DeviceDraft } from "@/components/DeviceEvalForm";
import { Notice } from "@/components/ui";
import { appraise, suggestedResale, type AppraisalConfig } from "@/lib/appraise";
import { METHODS, ORIGINS, deviceShort, idLooksOk, methodOf } from "@/lib/catalog";
import { fmtUSD } from "@/lib/money";
import { imeiInStock, registrarIngreso } from "./actions";

type Props = { cfg: AppraisalConfig & { fx: number }; shiftOpen: boolean; seeCost: boolean };

export function IngresoForm({ cfg, shiftOpen, seeCost }: Props) {
  const [origin, setOrigin] = useState<string>("Compra a particular");
  const [person, setPerson] = useState({ name: "", dni: "", phone: "" });
  const [draft, setDraft] = useState<DeviceDraft>(newDraft("Usado A"));
  const [costStr, setCostStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [payMethod, setPayMethod] = useState<string>("Efectivo USD");
  const [payStr, setPayStr] = useState("");
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState<{ purchaseId: string; number: string; desc: string; cost: number; paid: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const dup = await imeiInStock(draft.imei);
      if (alive) setDuplicate(dup);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [draft.imei]);

  const sealed = origin === "Proveedor";
  const ap = appraise(cfg, draft);
  const cost = costStr === "" ? (ap.ok ? ap.value : 0) : Number(costStr) || 0;
  const price = priceStr === "" ? suggestedResale(cfg, cost) : Number(priceStr) || 0;
  const payCur = methodOf(payMethod).cur;
  const payAmount = payStr === "" ? (shiftOpen ? (payCur === "USD" ? cost : Math.round(cost * cfg.fx)) : 0) : Number(payStr) || 0;

  const errors: string[] = [];
  if (!draft.model) errors.push("Elegí el modelo.");
  if (!idLooksOk(draft.kind, draft.imei)) errors.push("Ingresá un IMEI / serie válido.");
  if (duplicate) errors.push("El IMEI ya está en stock.");
  if (!sealed && ap.blocked) errors.push(ap.reason!);
  if (origin === "Compra a particular" && (!person.name.trim() || !person.dni.trim())) errors.push("Cargá nombre y DNI de quien vende (queda en el boleto de compra).");
  if (cost <= 0) errors.push("Ingresá el valor de compra.");
  if (price <= 0) errors.push("Ingresá el precio de venta.");
  if (payAmount > 0 && !shiftOpen) errors.push("Abrí la caja para registrar el pago, o dejá el monto en 0.");
  const valid = errors.length === 0;

  const changeOrigin = (o: string) => {
    setOrigin(o);
    setDraft({ ...draft, cond: o === "Proveedor" ? "Nuevo sellado" : "Usado A" });
  };

  const submit = () => {
    setServerError(null);
    startTransition(async () => {
      const res = await registrarIngreso({
        ...draft, origin, costUSD: cost, priceUSD: price,
        personName: person.name, personDni: person.dni, personPhone: person.phone,
        payMethod, payAmount,
      });
      if (res.error) return setServerError(res.error);
      setDone({ purchaseId: res.purchaseId!, number: res.number!, desc: deviceShort(draft), cost, paid: payAmount > 0 });
      setDraft(newDraft(sealed ? "Nuevo sellado" : "Usado A"));
      setPerson({ name: "", dni: "", phone: "" });
      setCostStr(""); setPriceStr(""); setPayStr("");
    });
  };

  return (
    <div className="grid-2">
      <div className="card stack">
        <label className="field">
          Origen
          <select className="input" value={origin} onChange={(e) => changeOrigin(e.target.value)} data-testid="ing-origin">
            {ORIGINS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        {origin === "Compra a particular" && (
          <div className="row">
            <label className="field">Nombre de quien vende<input className="input" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} data-testid="ing-person" /></label>
            <label className="field">DNI<input className="input" value={person.dni} onChange={(e) => setPerson({ ...person, dni: e.target.value })} data-testid="ing-dni" /></label>
            <label className="field">Teléfono<input className="input" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} /></label>
          </div>
        )}
        <DeviceEvalForm draft={draft} onChange={setDraft} allowSealed={sealed || origin === "Otro"} duplicate={duplicate} />
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <div className="card">
          <h2 className="card-title">Valuación</h2>
          {!sealed && <AppraisalBox ap={ap} />}
          <div className="row" style={{ marginTop: 12 }}>
            <label className="field">Valor de compra (USD)<input className="input" type="number" value={costStr === "" ? cost || "" : costStr} onChange={(e) => setCostStr(e.target.value)} data-testid="ing-cost" /></label>
            <label className="field">Precio de venta (USD)<input className="input" type="number" value={priceStr === "" ? price || "" : priceStr} onChange={(e) => setPriceStr(e.target.value)} data-testid="ing-price" /></label>
          </div>
          {seeCost && cost > 0 && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Margen proyectado: <b style={{ color: price - cost > 0 ? "var(--success)" : "var(--red)" }}>{fmtUSD(price - cost)}</b> ({price ? Math.round(((price - cost) / price) * 100) : 0}%)
            </p>
          )}
        </div>
        <div className="card stack">
          <h2 className="card-title" style={{ margin: 0 }}>Pago desde caja</h2>
          {!shiftOpen && <Notice tone="blue">No hay caja abierta: el ingreso se registra sin pago por caja.</Notice>}
          <div className="row">
            <label className="field">
              Medio
              <select className="input" value={payMethod} onChange={(e) => { setPayMethod(e.target.value); setPayStr(""); }} data-testid="ing-pay-method">
                {METHODS.map((m) => <option key={m.id}>{m.id}</option>)}
              </select>
            </label>
            <label className="field">Monto ({payCur})<input className="input" type="number" min={0} value={payStr === "" ? payAmount : payStr} onChange={(e) => setPayStr(e.target.value)} data-testid="ing-pay" /></label>
          </div>
          {errors.length > 0 && (draft.model || person.name) && <Notice>{errors[0]}</Notice>}
          {serverError && <div className="error" role="alert" data-testid="form-error">{serverError}</div>}
          <button className="btn btn-primary" style={{ padding: 13 }} disabled={!valid || pending} onClick={submit} data-testid="ing-submit">
            {pending ? "Registrando…" : "Confirmar ingreso"}
          </button>
          {done && (
            <div className="notice notice-blue" data-testid="ing-done">
              {done.number}: {done.desc} ingresó al stock a {fmtUSD(done.cost)}. {done.paid ? "El pago quedó registrado en la caja. " : ""}
              <Link href={`/ingresos/${done.purchaseId}/boleto`} target="_blank" style={{ fontWeight: 600, textDecoration: "underline" }}>Imprimir boleto de compra</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
