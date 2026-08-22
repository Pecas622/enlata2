import React, { useState } from "react";
import { CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "./theme.js";
import { Badge, Btn, Field, Input, Select, Card, EmptyState, PageHeader, FilterChips, StatCard } from "./ui.jsx";
import { uid, fmtDate, todayStr } from "./utils.js";
import { TIPOS_COMPROBANTE, CONDICIONES_IVA, PUNTO_VENTA_DEMO, proximoNumero, emitirComprobante } from "./arca.js";

const EMPTY_FORM = { cliente: "", cuitCliente: "", condicionIVA: CONDICIONES_IVA[0], tipo: "B", detalle: "", total: "" };

function TipoBox({ tipo }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 6, border: `1.5px solid ${OFFWHITE}`, flex: "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 16, color: OFFWHITE,
    }}>{tipo}</div>
  );
}

// Código de barras puramente decorativo (simula el que llevan las facturas reales).
function BarraSimulada() {
  const bars = React.useMemo(
    () => Array.from({ length: 46 }, () => 1 + Math.round(Math.random() * 2)),
    []
  );
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 30 }}>
      {bars.map((w, i) => (
        <div key={i} style={{ width: w, height: "100%", background: OFFWHITE }} />
      ))}
    </div>
  );
}

function ComprobanteView({ factura, negocio }) {
  const tipoInfo = TIPOS_COMPROBANTE.find((t) => t.id === factura.tipo);
  return (
    <div className="factura-print" style={{ background: "#fff", color: "#111", borderRadius: 8, padding: "22px 24px", marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 16 }}>{negocio?.nombre || "Tu negocio"}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>CUIT: {negocio?.cuit || "20-00000000-9 (demo)"}</div>
          <div style={{ fontSize: 12 }}>Punto de venta: {PUNTO_VENTA_DEMO}</div>
        </div>
        <div style={{ textAlign: "center", border: "2px solid #111", borderRadius: 6, padding: "4px 14px" }}>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 22 }}>{factura.tipo}</div>
          <div style={{ fontSize: 10 }}>{tipoInfo?.label}</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div>Comprobante N°</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700 }}>{factura.numeroFormateado}</div>
          <div style={{ marginTop: 6 }}>Fecha: {fmtDate(factura.fecha)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, fontSize: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div><strong>Cliente:</strong> {factura.cliente}</div>
          {factura.cuitCliente && <div><strong>CUIT/DNI:</strong> {factura.cuitCliente}</div>}
          <div><strong>Condición IVA:</strong> {factura.condicionIVA}</div>
        </div>
      </div>

      <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>Detalle</div>
        <div style={{ fontSize: 13 }}>{factura.detalle}</div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#555" }}>Total</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 800, fontSize: 20 }}>{factura.totalFormateado}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: "1px solid #ccc", paddingTop: 12 }}>
        <div style={{ fontSize: 11 }}>
          <div><strong>CAE:</strong> {factura.cae}</div>
          <div><strong>Vto. CAE:</strong> {fmtDate(factura.caeVencimiento)}</div>
        </div>
        <BarraSimulada />
      </div>

      <div style={{ marginTop: 16, textAlign: "center", fontSize: 10.5, color: "#999" }}>
        Comprobante generado en modo simulado por Enlata2 — no es válido ante ARCA.
      </div>
    </div>
  );
}

export default function FacturacionModule({ data, persist, showToast, fmtMoney, negocio }) {
  const [showForm, setShowForm] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filter, setFilter] = useState("Todas");
  const [viewingId, setViewingId] = useState(null);

  const facturas = data.facturas || [];
  const autorizadas = facturas.filter((f) => f.estado !== "Anulada");
  const totalFacturado = autorizadas.reduce((s, f) => s + Number(f.total || 0), 0);

  const filtered = filter === "Todas" ? facturas : facturas.filter((f) => f.tipo === filter);

  const emitir = async () => {
    if (!form.cliente.trim() || !form.detalle.trim() || !form.total) {
      showToast("Completá cliente, detalle y monto");
      return;
    }
    setEmitting(true);
    try {
      const numero = proximoNumero(facturas, form.tipo);
      const resultado = await emitirComprobante({
        tipo: form.tipo,
        numero,
        cliente: form.cliente.trim(),
        cuitCliente: form.cuitCliente.trim(),
        condicionIVA: form.condicionIVA,
        detalle: form.detalle.trim(),
        total: form.total,
      });
      const entry = {
        id: uid(),
        ...resultado,
        totalFormateado: fmtMoney(form.total),
        estado: "Autorizada",
      };
      await persist({ ...data, facturas: [entry, ...facturas] });
      setForm(EMPTY_FORM);
      setShowForm(false);
      showToast(`Factura ${entry.tipo} autorizada (simulado) · CAE ${entry.cae}`);
    } finally {
      setEmitting(false);
    }
  };

  const anular = (id) => {
    persist({
      ...data,
      facturas: facturas.map((f) => (f.id === id ? { ...f, estado: "Anulada" } : f)),
    });
    showToast("Comprobante anulado");
  };

  return (
    <div>
      <PageHeader
        title="Facturación"
        subtitle={`${autorizadas.length} comprobantes emitidos · ${fmtMoney(totalFacturado)} facturado`}
        action={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? "Cancelar" : "+ Nueva factura"}</Btn>}
      />

      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(255,201,61,0.08)",
        border: `1px solid rgba(255,201,61,0.3)`, borderRadius: 10, padding: "12px 14px", marginBottom: 18,
      }}>
        <span style={{ color: AMBER, fontSize: 14, lineHeight: "18px" }}>⚠</span>
        <div style={{ fontFamily: "Inter", fontSize: 12, color: "#D8D8D2" }}>
          <strong style={{ color: AMBER }}>Modo simulado.</strong> Este módulo genera número de comprobante y CAE de prueba
          con el mismo formato que ARCA, para mostrar el flujo completo. Ningún comprobante emitido acá es válido
          fiscalmente. La integración real (WSAA/WSFEv1 con tu certificado y CUIT) se activa en una próxima etapa.
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Cliente" required minWidth={200}>
              <Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} placeholder="Juan Pérez" />
            </Field>
            <Field label="CUIT / DNI (opcional)" minWidth={160}>
              <Input value={form.cuitCliente} onChange={(e) => setForm({ ...form, cuitCliente: e.target.value })} placeholder="20-12345678-9" />
            </Field>
            <Field label="Condición IVA" minWidth={170}>
              <Select value={form.condicionIVA} onChange={(e) => setForm({ ...form, condicionIVA: e.target.value })}>
                {CONDICIONES_IVA.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Tipo de comprobante" minWidth={170}>
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS_COMPROBANTE.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>)}
              </Select>
            </Field>
            <Field label="Detalle / concepto" required minWidth={220}>
              <Input value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} placeholder="Venta iPhone 13, cuota de socio, comisión..." />
            </Field>
            <Field label="Monto total" required minWidth={140}>
              <Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} placeholder="15000" />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Btn onClick={emitir} disabled={emitting}>{emitting ? "Emitiendo ante ARCA (simulado)..." : "Emitir comprobante"}</Btn>
          </div>
        </Card>
      )}

      <FilterChips
        options={["Todas", ...TIPOS_COMPROBANTE.map((t) => t.id)]}
        value={filter}
        onChange={setFilter}
        counts={{
          Todas: facturas.length,
          ...Object.fromEntries(TIPOS_COMPROBANTE.map((t) => [t.id, facturas.filter((f) => f.tipo === t.id).length])),
        }}
      />

      {filtered.length === 0 ? (
        <Card><EmptyState text="Todavía no emitiste comprobantes." /></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((f) => (
            <Card key={f.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 220 }}>
                  <TipoBox tipo={f.tipo} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 14, color: OFFWHITE }}>{f.cliente}</div>
                      <Badge tone={f.estado === "Anulada" ? "red" : "green"}>{f.estado}</Badge>
                    </div>
                    <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginTop: 3 }}>
                      N° {f.numeroFormateado} · CAE {f.cae} · vto. {fmtDate(f.caeVencimiento)} · {fmtDate(f.fecha)}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 16, color: GREEN }}>{f.totalFormateado}</div>
                  <Btn variant="secondary" onClick={() => setViewingId(viewingId === f.id ? null : f.id)}>
                    {viewingId === f.id ? "Ocultar" : "Ver comprobante"}
                  </Btn>
                  {f.estado !== "Anulada" && <Btn variant="danger" onClick={() => anular(f.id)}>Anular</Btn>}
                </div>
              </div>

              {viewingId === f.id && (
                <>
                  <ComprobanteView factura={f} negocio={negocio} />
                  <div style={{ marginTop: 10 }}>
                    <Btn variant="secondary" onClick={() => window.print()}>Imprimir</Btn>
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
