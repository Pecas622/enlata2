"use client";

import Link from "next/link";
import { useState } from "react";
import { COLOR_HEX, DeviceArt } from "@/components/DeviceArt";
import { deviceShort, deviceTitle, KINDS } from "@/lib/catalog";
import { fmtARS, fmtUSD } from "@/lib/money";
import { AssistantChat } from "./AssistantChat";
import { waHref, waNumber, type PublicAccessory, type PublicConfig, type PublicDevice } from "@/lib/public-catalog";

type Sel = { type: "device"; item: PublicDevice } | { type: "acc"; item: PublicAccessory } | null;

export function PublicCatalogView({ cfg, devices, accessories }: { cfg: PublicConfig; devices: PublicDevice[]; accessories: PublicAccessory[] }) {
  const [kind, setKind] = useState("Todos");
  const [cond, setCond] = useState("Todos");
  const [sort, setSort] = useState("destacados");
  const [sel, setSel] = useState<Sel>(null);
  const hasWa = waNumber(cfg).length >= 8;
  const wa = (text: string, item?: string, label?: string) => waHref(cfg.slug, text, item, label);

  const kinds = KINDS.filter((k) => devices.some((d) => d.kind === k));
  const chips = ["Todos", ...kinds, ...(accessories.length ? ["Accesorios"] : [])];
  const list = devices
    .filter((d) => (kind === "Todos" || kind === d.kind) && (cond === "Todos" || (cond === "Nuevos" ? d.condition === "Nuevo sellado" : d.condition !== "Nuevo sellado")))
    .sort((a, b) => {
      if (sort === "menor") return a.price_usd - b.price_usd;
      if (sort === "mayor") return b.price_usd - a.price_usd;
      return Number(b.featured) - Number(a.featured) || b.entry_date.localeCompare(a.entry_date);
    });
  const showDevices = kind !== "Accesorios";
  const showAcc = kind === "Todos" || kind === "Accesorios";
  const sub = (d: PublicDevice) => (d.condition === "Nuevo sellado" ? "Nuevo sellado" : `${d.condition}${d.battery ? ` · Batería ${d.battery}%` : ""}`);
  const askDevice = (d: PublicDevice) => `Hola! Vi el ${deviceTitle(d)} (${d.condition}) a ${fmtUSD(d.price_usd)} en el catálogo de ${cfg.store_name}. ¿Sigue disponible?`;
  const askTrade = (d?: PublicDevice) => `Hola! Quiero cotizar mi equipo en plan canje${d ? ` para llevarme el ${deviceTitle(d)}` : ""}. Mi equipo es: `;

  return (
    <div className="pc" data-testid="public-catalog">
      <header className="pc-head">
        <div className="pc-wrap pc-head-in">
          <div className="pc-store">{cfg.store_name}</div>
          {hasWa && <a className="pc-link" href={wa("Hola! Quiero hacer una consulta.", undefined, "Consulta general")} target="_blank" rel="noreferrer">Escribinos</a>}
        </div>
      </header>

      <section className="pc-hero">
        <h1>{cfg.headline}</h1>
        <p>{cfg.tagline}</p>
        <div className="pc-actions">
          <a href="#catalogo-lista" className="pc-pill pc-blue">Ver equipos</a>
          <Link href={`/catalogo/${cfg.slug}/cotizar`} className="pc-pill pc-ghost" data-testid="cat-quote-hero">Cotizá tu iPhone ›</Link>
        </div>
      </section>

      <section className="pc-wrap">
        <div className="pc-band">
          <div>
            <div className="pc-band-title">Plan canje</div>
            <div className="pc-sub">Entregá tu iPhone usado y pagá solo la diferencia. Mirá cuánto vale en segundos.</div>
          </div>
          <Link href={`/catalogo/${cfg.slug}/cotizar`} className="pc-pill pc-blue" data-testid="cat-quote">Cotizá tu iPhone</Link>
        </div>
      </section>

      <section id="catalogo-lista" className="pc-wrap" style={{ paddingTop: 36 }}>
        <div className="pc-chips">
          {chips.map((c) => <button key={c} className={`pc-chip${kind === c ? " on" : ""}`} onClick={() => setKind(c)} data-testid={`cat-chip-${c}`}>{c}</button>)}
        </div>
        {showDevices && (
          <div className="pc-filters">
            <div className="pc-seg">
              {["Todos", "Nuevos", "Usados"].map((c) => <button key={c} className={cond === c ? "on" : ""} onClick={() => setCond(c)} data-testid={`cat-cond-${c}`}>{c}</button>)}
            </div>
            <select className="pc-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar" data-testid="cat-sort">
              <option value="destacados">Destacados</option><option value="menor">Menor precio</option><option value="mayor">Mayor precio</option>
            </select>
          </div>
        )}
        {showDevices && (
          <div className="pc-grid">
            {list.map((d) => (
              <button key={d.id} className="pc-card" onClick={() => setSel({ type: "device", item: d })} data-testid="cat-item">
                <div className="pc-art">
                  <DeviceArt kind={d.kind} color={d.color} photo={d.photo_path} />
                  {d.featured && <span className="pc-badge">Destacado</span>}
                </div>
                <div className="pc-card-body">
                  <div className="pc-name">{deviceShort(d)}</div>
                  <div className="pc-sub"><span className="pc-dot" style={{ background: COLOR_HEX[d.color] || "#ccc" }} />{d.color}</div>
                  <div className={d.condition === "Nuevo sellado" ? "pc-new" : "pc-sub"}>{sub(d)}</div>
                  <div className="pc-price">
                    <b data-testid="cat-price">{fmtUSD(d.price_usd)}</b>
                    <span>≈ {fmtARS(d.price_usd * cfg.fx)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {showDevices && list.length === 0 && <div className="pc-empty">No hay equipos con ese filtro por ahora. Escribinos y te avisamos cuando entre uno.</div>}

        {showAcc && accessories.length > 0 && (
          <div style={{ marginTop: 44 }}>
            <h2 className="pc-h2">Accesorios</h2>
            <div className="pc-grid pc-grid-acc">
              {accessories.map((a) => (
                <button key={a.id} className="pc-card pc-acc" onClick={() => setSel({ type: "acc", item: a })} data-testid="cat-acc">
                  <div><div className="pc-acc-name">{a.name}</div><div className="pc-sub">{a.category}</div></div>
                  <b>{fmtARS(a.price_ars)}</b>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <footer className="pc-foot">
        <div className="pc-wrap">
          <div className="pc-foot-name">{cfg.store_name}</div>
          <div>{cfg.address}</div>
          <p>
            Precios de equipos en dólares, con equivalente en pesos a la cotización del día (US$ 1 = {fmtARS(cfg.fx)}). Sujetos a cambios y disponibilidad.
            Garantía: {cfg.warranty_new_days} días en equipos nuevos y {cfg.warranty_used_days} días en usados. Los equipos usados fueron revisados y tienen iCloud libre.
          </p>
        </div>
      </footer>

      {cfg.assistant_on && <AssistantChat cfg={cfg} devices={devices} hasWa={hasWa} waHref={wa} onOpenDevice={(d) => setSel({ type: "device", item: d })} />}

      {sel && (
        <div className="pc-overlay" onClick={() => setSel(null)}>
          <div className="pc-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" data-testid="cat-sheet">
            <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="pc-close" onClick={() => setSel(null)} aria-label="Cerrar">×</button></div>
            {sel.type === "device" ? (
              <div>
                <div className="pc-art pc-art-big"><DeviceArt kind={sel.item.kind} color={sel.item.color} photo={sel.item.photo_path} /></div>
                <h2 className="pc-sheet-title">{deviceShort(sel.item)}</h2>
                <div className="pc-sub" style={{ fontSize: 15 }}>{sel.item.color} · {sel.item.condition}</div>
                <div className="pc-sheet-price">{fmtUSD(sel.item.price_usd)} <span>≈ {fmtARS(sel.item.price_usd * cfg.fx)}</span></div>
                <div className="pc-specs">
                  {([["Condición", sel.item.condition], ...(sel.item.condition !== "Nuevo sellado" && sel.item.battery ? [["Salud de batería", `${sel.item.battery}%`]] : []), ["Garantía", `${sel.item.warranty_days} días`], ["iCloud", "Libre, listo para usar"]] as [string, string][]).map(([k, v]) => (
                    <div key={k}><span>{k}</span><span>{v}</span></div>
                  ))}
                </div>
                {hasWa ? (
                  <div className="pc-sheet-actions">
                    <a className="pc-pill pc-blue" href={wa(askDevice(sel.item), sel.item.id, deviceShort(sel.item))} target="_blank" rel="noreferrer" data-testid="cat-ask">Consultar por WhatsApp</a>
                    <a className="pc-pill pc-soft" href={wa(askTrade(sel.item), sel.item.id, `${deviceShort(sel.item)} (canje)`)} target="_blank" rel="noreferrer">Pagarlo con plan canje</a>
                  </div>
                ) : <p className="pc-sub">Escribinos al {cfg.phone}.</p>}
              </div>
            ) : (
              <div>
                <h2 className="pc-sheet-title">{sel.item.name}</h2>
                <div className="pc-sub" style={{ fontSize: 15 }}>{sel.item.category}</div>
                <div className="pc-sheet-price">{fmtARS(sel.item.price_ars)}</div>
                {hasWa && (
                  <div className="pc-sheet-actions">
                    <a className="pc-pill pc-blue" href={wa(`Hola! Quiero consultar por: ${sel.item.name} (${fmtARS(sel.item.price_ars)}).`, sel.item.id, sel.item.name)} target="_blank" rel="noreferrer">Consultar por WhatsApp</a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
