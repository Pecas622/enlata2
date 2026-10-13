"use client";

import { useState, useTransition } from "react";
import { fmtDate } from "@/lib/dates";
import { generarPedidoCertificado, guardarCertificado, guardarDatosFiscales, probarArca, type FiscalInput } from "./actions";

export type FiscalInitial = FiscalInput & { certAlias: string; certVence: string | null; csr: string; hasCert: boolean; listo: boolean };

type Msg = { tone: "ok" | "error"; text: string } | null;

export function FiscalCard({ initial, secretOk }: { initial: FiscalInitial; secretOk: boolean }) {
  const [f, setF] = useState<FiscalInput>({
    razon_social: initial.razon_social, cuit: initial.cuit, condicion_iva: initial.condicion_iva, iibb: initial.iibb,
    inicio_actividades: initial.inicio_actividades, punto_venta: initial.punto_venta, alicuota_iva: initial.alicuota_iva,
    ambiente: initial.ambiente, automatica: initial.automatica,
  });
  const [csr, setCsr] = useState(initial.csr);
  const [cert, setCert] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof FiscalInput>(k: K, v: FiscalInput[K]) => setF((x) => ({ ...x, [k]: v }));

  const run = (fn: () => Promise<{ error?: string; ok?: string }>, ok: string) => {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      setMsg(r.error ? { tone: "error", text: r.error } : { tone: "ok", text: r.ok ?? ok });
    });
  };
  const pedir = () => {
    setMsg(null);
    startTransition(async () => {
      const r = await generarPedidoCertificado();
      if (r.error) setMsg({ tone: "error", text: r.error });
      else { setCsr(r.csr ?? ""); setMsg({ tone: "ok", text: "Pedido generado. Subilo en ARCA y cargá acá el certificado que te devuelve." }); }
    });
  };
  const leerArchivo = async (file: File | undefined) => file && setCert(await file.text());
  const csrHref = `data:application/pkcs10;charset=utf-8,${encodeURIComponent(csr)}`;

  return (
    <div className="card stack" data-testid="fiscal-card">
      <h2 className="card-title" style={{ margin: 0 }}>Facturación electrónica</h2>
      <p className="muted" style={{ margin: 0 }}>
        {initial.listo
          ? `Lista para facturar en ${f.ambiente === "produccion" ? "producción" : "homologación (pruebas, sin validez fiscal)"}.${initial.certVence ? ` El certificado vence el ${fmtDate(initial.certVence)}.` : ""}`
          : "Cargá los datos fiscales, generá el pedido de certificado y subí el certificado que te da ARCA."}
      </p>
      {!secretOk && <div className="error" role="alert">Falta configurar ARCA_KEY_SECRET en el servidor para guardar el certificado.</div>}

      <div className="row">
        <label className="field">Razón social<input className="input" value={f.razon_social} onChange={(e) => set("razon_social", e.target.value)} data-testid="fiscal-razon" /></label>
        <label className="field">CUIT<input className="input" value={f.cuit} onChange={(e) => set("cuit", e.target.value)} inputMode="numeric" data-testid="fiscal-cuit" /></label>
        <label className="field">
          Condición frente al IVA
          <select className="input" value={f.condicion_iva} onChange={(e) => set("condicion_iva", e.target.value)} data-testid="fiscal-condicion">
            <option>Monotributo</option>
            <option>Responsable Inscripto</option>
          </select>
          <span>{f.condicion_iva === "Monotributo" ? "Emitís factura C." : "Emitís A a inscriptos y monotributistas, B al resto."}</span>
        </label>
      </div>
      <div className="row">
        <label className="field">
          Punto de venta
          <input className="input" type="number" min={1} value={f.punto_venta} onChange={(e) => set("punto_venta", Number(e.target.value))} data-testid="fiscal-pv" />
          <span>Uno dado de alta en ARCA como &quot;Factura electrónica - Web services&quot;.</span>
        </label>
        <label className="field">Ingresos brutos<input className="input" value={f.iibb} onChange={(e) => set("iibb", e.target.value)} placeholder="Número o Convenio multilateral" /></label>
        <label className="field">Inicio de actividades<input className="input" type="date" value={f.inicio_actividades} onChange={(e) => set("inicio_actividades", e.target.value)} /></label>
        {f.condicion_iva === "Responsable Inscripto" && (
          <label className="field">
            IVA de lo que vendés
            <select className="input" value={f.alicuota_iva} onChange={(e) => set("alicuota_iva", Number(e.target.value))}>
              <option value={21}>21%</option>
              <option value={10.5}>10,5%</option>
              <option value={27}>27%</option>
            </select>
          </label>
        )}
      </div>
      <div className="row">
        <label className="field">
          Ambiente
          <select className="input" value={f.ambiente} onChange={(e) => set("ambiente", e.target.value)} data-testid="fiscal-ambiente">
            <option value="homologacion">Homologación (pruebas)</option>
            <option value="produccion">Producción</option>
          </select>
          <span>El certificado de homologación no sirve en producción: al pasar, generá un pedido nuevo.</span>
        </label>
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={f.automatica} onChange={(e) => set("automatica", e.target.checked)} data-testid="fiscal-auto" />
          Marcar &quot;Emitir factura&quot; en cada venta nueva
        </label>
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={() => run(() => guardarDatosFiscales(f), "Datos fiscales guardados.")} disabled={pending} data-testid="fiscal-save">
          {pending ? "Guardando…" : "Guardar datos fiscales"}
        </button>
      </div>

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", width: "100%" }} />
      <h3 className="card-title" style={{ margin: 0, fontSize: 15 }}>Certificado de ARCA</h3>
      <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
        <li>Generá el pedido acá y descargalo.</li>
        <li>En ARCA, con clave fiscal, entrá a &quot;Administración de certificados digitales&quot; (en pruebas, &quot;WSASS&quot;), agregá un alias y subí el pedido.</li>
        <li>Descargá el certificado (.crt) y subilo acá.</li>
        <li>En &quot;Administrador de relaciones de clave fiscal&quot;, asociá ese alias al servicio &quot;Facturación electrónica&quot;.</li>
      </ol>
      <p className="muted" style={{ margin: 0 }} data-testid="fiscal-cert-status">
        {initial.hasCert ? `Certificado cargado (${initial.certAlias})${initial.certVence ? `, vence el ${fmtDate(initial.certVence)}` : ""}.`
          : csr ? `Pedido generado (${initial.certAlias || "nuevo"}), falta el certificado.` : "Todavía no generaste el pedido."}
      </p>
      <div className="row">
        <button className="btn btn-secondary" onClick={pedir} disabled={pending || !secretOk} data-testid="fiscal-csr">
          {csr ? "Generar un pedido nuevo" : "Generar pedido de certificado"}
        </button>
        {csr && <a className="btn btn-secondary" href={csrHref} download="pedido-arca.csr" data-testid="fiscal-csr-download">Descargar pedido (.csr)</a>}
      </div>
      {csr && <textarea className="input" readOnly value={csr} rows={4} style={{ fontFamily: "monospace", fontSize: 11 }} data-testid="fiscal-csr-text" />}
      {csr && (
        <>
          <label className="field">
            Certificado que te dio ARCA
            <input className="input" type="file" accept=".crt,.pem,.cer" onChange={(e) => leerArchivo(e.target.files?.[0])} />
            <textarea className="input" value={cert} onChange={(e) => setCert(e.target.value)} rows={4} placeholder="-----BEGIN CERTIFICATE-----"
              style={{ fontFamily: "monospace", fontSize: 11 }} data-testid="fiscal-cert" />
          </label>
          <div className="row">
            <button className="btn btn-primary" onClick={() => run(() => guardarCertificado(cert), "Certificado guardado.")} disabled={pending || !cert.trim()} data-testid="fiscal-cert-save">
              Guardar certificado
            </button>
            {initial.hasCert && <button className="btn btn-secondary" onClick={() => run(probarArca, "")} disabled={pending} data-testid="fiscal-test">Probar conexión con ARCA</button>}
          </div>
        </>
      )}
      {msg && <div className={msg.tone} role={msg.tone === "error" ? "alert" : undefined} data-testid="fiscal-msg">{msg.text}</div>}
    </div>
  );
}
