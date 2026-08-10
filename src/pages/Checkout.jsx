import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FONT_IMPORT, CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY } from "../lib/theme.js";
import { fmtARS as fmtMoneyARS } from "../lib/utils.js";
import { Btn as SharedBtn, Field as SharedField, Input as SharedInput } from "../lib/ui.jsx";
import { PRODUCTS } from "../config/products.js";

const IMPLEMENTATION_PRICE = 200; // USD, precio de lanzamiento
const IMPLEMENTATION_REGULAR = 299;
const MONTHLY_PRICE = 100000; // ARS

const STEPS = ["Solución", "Tu plan", "Tu negocio", "Medio de pago", "Confirmación"];

function uid() { return Math.random().toString(36).slice(2, 9).toUpperCase(); }

// ---------- atoms (Checkout uses a roomier size than the admin panels) ----------
function Btn(props) { return <SharedBtn size="lg" {...props} />; }
function Field(props) { return <SharedField minWidth={200} {...props} />; }
function Input(props) {
  return <SharedInput {...props} style={{ padding: "12px 12px", fontSize: 14, ...(props.style || {}) }} />;
}

// ---------- stepper ----------
function Stepper({ current }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 40, flexWrap: "wrap", gap: 4 }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12,
              background: i < current ? GREEN : i === current ? "transparent" : CARD2,
              color: i < current ? CARBON : i === current ? GREEN : GRAY,
              border: i === current ? `2px solid ${GREEN}` : "none",
            }}>{i < current ? "✓" : i + 1}</div>
            <div style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 600, color: i <= current ? OFFWHITE : GRAY, display: window.innerWidth < 700 ? "none" : "block" }}>{s}</div>
          </div>
          {i < STEPS.length - 1 && <div style={{ width: 24, height: 1, background: i < current ? GREEN : BORDER, margin: "0 6px" }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState(0);
  const [product, setProduct] = useState(null);
  const [biz, setBiz] = useState({ name: "", contact: "", phone: "", email: "" });
  const [method, setMethod] = useState(null);
  const [orderId, setOrderId] = useState(null);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const canNextFromBiz = biz.name.trim() && biz.contact.trim() && biz.phone.trim();

  const confirmOrder = () => {
    setOrderId("ENL-" + uid());
    next();
  };

  const restart = () => {
    setStep(0); setProduct(null); setBiz({ name: "", contact: "", phone: "", email: "" }); setMethod(null); setOrderId(null);
  };

  return (
    <div style={{ background: CARBON, minHeight: 640, borderRadius: 12, border: `1px solid ${BORDER}`, padding: "36px 40px" }}>
      <style>{FONT_IMPORT}</style>

      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32, textDecoration: "none", width: "fit-content" }}>
        <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
          <rect x="18" y="10" width="64" height="80" rx="20" stroke={GREEN} strokeWidth="6" />
          <rect x="34" y="34" width="32" height="6" rx="3" fill={GREEN} />
          <rect x="34" y="47" width="32" height="6" rx="3" fill={GREEN} />
          <rect x="34" y="60" width="32" height="6" rx="3" fill={GREEN} />
        </svg>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 17, color: OFFWHITE }}>ENLATA<span style={{ color: GREEN }}>2</span></div>
      </Link>

      <Stepper current={step} />

      {step === 0 && <StepProduct product={product} setProduct={setProduct} onNext={next} />}
      {step === 1 && <StepPlan product={product} onNext={next} onBack={back} />}
      {step === 2 && <StepBiz biz={biz} setBiz={setBiz} onNext={next} onBack={back} canNext={canNextFromBiz} />}
      {step === 3 && <StepPayment method={method} setMethod={setMethod} onNext={confirmOrder} onBack={back} />}
      {step === 4 && <StepConfirm product={product} biz={biz} method={method} orderId={orderId} onRestart={restart} />}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 24, color: OFFWHITE, marginBottom: 6 }}>{children}</div>
      {sub && <div style={{ fontFamily: "Inter", fontSize: 13, color: GRAY }}>{sub}</div>}
    </div>
  );
}

// ---------- Step 0: elegir producto ----------
function StepProduct({ product, setProduct, onNext }) {
  return (
    <div>
      <SectionTitle sub="Elegí la lata pensada para tu tipo de negocio.">¿Qué solución necesitás?</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {PRODUCTS.map((p) => {
          const selected = product?.id === p.id;
          return (
            <div key={p.id} onClick={() => setProduct(p)} style={{
              background: selected ? "rgba(184,255,61,0.08)" : CARD, border: `1.5px solid ${selected ? GREEN : BORDER}`,
              borderRadius: 12, padding: "18px 16px", cursor: "pointer", transition: "border-color .15s",
            }}>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 11, color: GRAY, marginBottom: 10 }}>{p.num}</div>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 15, color: OFFWHITE, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY }}>{p.rubro}</div>
            </div>
          );
        })}
      </div>
      <Btn onClick={onNext} disabled={!product}>Continuar</Btn>
    </div>
  );
}

// ---------- Step 1: plan ----------
function StepPlan({ product, onNext, onBack }) {
  return (
    <div>
      <SectionTitle sub={`Precio de lanzamiento para ${product?.name}.`}>Tu plan</SectionTitle>

      <div style={{ maxWidth: 480, background: CARD2, border: `2px solid ${GREEN}`, borderRadius: 16, padding: "28px 26px", marginBottom: 20, position: "relative" }}>
        <div style={{ position: "absolute", top: -13, left: 26, background: GREEN, color: CARBON, fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 999 }}>Precio de lanzamiento</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: GRAY, textTransform: "uppercase", marginBottom: 4 }}>Implementación</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 22, color: OFFWHITE }}>
              USD {IMPLEMENTATION_PRICE} <span style={{ fontSize: 13, fontWeight: 500, color: GRAY, textDecoration: "line-through" }}>USD {IMPLEMENTATION_REGULAR}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: GRAY, textTransform: "uppercase", marginBottom: 4 }}>Mensualidad</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 22, color: OFFWHITE }}>{fmtMoneyARS(MONTHLY_PRICE)}<span style={{ fontSize: 13, color: GRAY }}>/mes</span></div>
          </div>
        </div>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          {["Todos los módulos base de " + product?.name, "Soporte por WhatsApp", "Onboarding guiado incluido"].map((f) => (
            <li key={f} style={{ fontSize: 13, color: OFFWHITE, display: "flex", gap: 8 }}><span style={{ color: GREEN }}>✓</span>{f}</li>
          ))}
        </ul>
        <div style={{ fontSize: 12, color: GRAY, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
          <span style={{ color: GREEN }}>＋</span> Si más adelante sumás funciones nuevas, se cotizan aparte.
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={onBack}>Atrás</Btn>
        <Btn onClick={onNext}>Continuar</Btn>
      </div>
    </div>
  );
}

// ---------- Step 2: datos del negocio ----------
function StepBiz({ biz, setBiz, onNext, onBack, canNext }) {
  return (
    <div>
      <SectionTitle sub="Los usamos para configurar tu sistema y coordinar la puesta en marcha.">Datos de tu negocio</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 520, marginBottom: 26 }}>
        <Field label="Nombre del negocio" required>
          <Input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} placeholder="Inmobiliaria Del Valle" />
        </Field>
        <Field label="Nombre de contacto" required>
          <Input value={biz.contact} onChange={(e) => setBiz({ ...biz, contact: e.target.value })} placeholder="Juan Pérez" />
        </Field>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Field label="Teléfono / WhatsApp" required>
            <Input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="+54 9 261 555 0100" />
          </Field>
          <Field label="Email (opcional)">
            <Input value={biz.email} onChange={(e) => setBiz({ ...biz, email: e.target.value })} placeholder="juan@delvalle.com" />
          </Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={onBack}>Atrás</Btn>
        <Btn onClick={onNext} disabled={!canNext}>Continuar</Btn>
      </div>
    </div>
  );
}

// ---------- Step 3: medio de pago ----------
function StepPayment({ method, setMethod, onNext, onBack }) {
  const options = [
    { id: "transferencia", name: "Transferencia bancaria", desc: "Te enviamos el CBU/alias. Sin comisión.", icon: "⇄" },
    { id: "tarjeta", name: "Tarjeta (Mercado Pago)", desc: "Débito automático mensual. Puede tener comisión.", icon: "▭" },
  ];
  return (
    <div>
      <SectionTitle sub="Elegí cómo vas a pagar la implementación y la mensualidad.">Medio de pago</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480, marginBottom: 26 }}>
        {options.map((o) => {
          const selected = method === o.id;
          return (
            <div key={o.id} onClick={() => setMethod(o.id)} style={{
              display: "flex", alignItems: "center", gap: 16, background: selected ? "rgba(184,255,61,0.08)" : CARD,
              border: `1.5px solid ${selected ? GREEN : BORDER}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer",
            }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: CARD2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: GREEN, flex: "none" }}>{o.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{o.name}</div>
                <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 2 }}>{o.desc}</div>
              </div>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selected ? GREEN : BORDER}`, background: selected ? GREEN : "transparent", flex: "none" }} />
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: GRAY, maxWidth: 480, marginBottom: 24 }}>
        Ningún dato de pago se procesa acá todavía — un asesor de Enlata2 te va a contactar para coordinar el cobro por el medio que elijas.
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="secondary" onClick={onBack}>Atrás</Btn>
        <Btn onClick={onNext} disabled={!method}>Confirmar pedido</Btn>
      </div>
    </div>
  );
}

// ---------- Step 4: confirmación ----------
function StepConfirm({ product, biz, method, orderId, onRestart }) {
  const methodLabel = method === "transferencia" ? "Transferencia bancaria" : "Tarjeta (Mercado Pago)";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(184,255,61,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: GREEN }}>✓</div>
        <div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 22, color: OFFWHITE }}>¡Pedido confirmado!</div>
          <div style={{ fontFamily: "Inter", fontSize: 13, color: GRAY }}>N° de pedido {orderId}</div>
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", maxWidth: 520, marginBottom: 22 }}>
        <Row label="Solución" value={`${product?.name} · ${product?.rubro}`} />
        <Row label="Negocio" value={biz.name} />
        <Row label="Contacto" value={`${biz.contact} · ${biz.phone}`} />
        <Row label="Medio de pago" value={methodLabel} />
        <div style={{ height: 1, background: BORDER, margin: "14px 0" }} />
        <Row label="Implementación (única vez)" value={`USD ${IMPLEMENTATION_PRICE}`} strong />
        <Row label="Mensualidad" value={`${fmtMoneyARS(MONTHLY_PRICE)}/mes`} strong />
      </div>

      <div style={{ maxWidth: 520, background: "rgba(184,255,61,0.06)", border: `1px solid rgba(184,255,61,0.25)`, borderRadius: 12, padding: "18px 20px", marginBottom: 28 }}>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE, marginBottom: 10 }}>¿Qué sigue?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "Un asesor de Enlata2 te contacta por WhatsApp en las próximas horas.",
            "Coordinamos el pago de la implementación por " + methodLabel.toLowerCase() + ".",
            "Configuramos " + (product?.name || "tu sistema") + " con tu logo, usuarios y datos.",
            "Tu sistema queda funcionando y arranca la mensualidad.",
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#D8D8D2" }}>
              <span style={{ color: GREEN, fontFamily: "Space Grotesk", fontWeight: 700 }}>{i + 1}.</span>{t}
            </div>
          ))}
        </div>
      </div>

      <Btn variant="secondary" onClick={onRestart}>Simular otro pedido</Btn>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
      <div style={{ fontFamily: "Inter", fontSize: 13, color: GRAY }}>{label}</div>
      <div style={{ fontFamily: strong ? "Space Grotesk" : "Inter", fontWeight: strong ? 700 : 500, fontSize: strong ? 14 : 13, color: OFFWHITE }}>{value}</div>
    </div>
  );
}
