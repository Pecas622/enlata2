"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtUSD } from "@/lib/money";
import { waHref, waNumber, type PublicConfig } from "@/lib/public-catalog";
import {
  BATTERY_RANGES, GENERATIONS, capLabel, capacitiesFor, modelName, quote, quoteMessage, versionsFor,
  type BatteryRange, type Generation, type PublicValue, type Version,
} from "@/lib/quote";

export function QuoteForm({ cfg, values }: { cfg: PublicConfig; values: PublicValue[] }) {
  const [gen, setGen] = useState<Generation | null>(null);
  const [version, setVersion] = useState<Version | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [battery, setBattery] = useState<BatteryRange | null>(null);
  const hasWa = waNumber(cfg).length >= 8;

  const pickGen = (g: Generation) => { setGen(g); setVersion(null); setCapacity(null); };
  const pickVersion = (v: Version) => { setVersion(v); setCapacity(null); };
  const q = gen && version && capacity && battery ? quote(values, gen, version, capacity, battery) : null;

  return (
    <div className="pq">
      <h1>Cotizá tu iPhone</h1>
      <p>Contanos qué iPhone tenés y te decimos cuánto vale en plan canje.</p>

      <div className="pq-step">
        <h2>Modelo</h2>
        <div className="pq-opts">{GENERATIONS.map((g) => <button key={g} className={`pq-opt${gen === g ? " on" : ""}`} onClick={() => pickGen(g)} data-testid={`q-gen-${g}`}>iPhone {g}</button>)}</div>
      </div>
      {gen && (
        <div className="pq-step">
          <h2>Versión</h2>
          <div className="pq-opts">{versionsFor(gen).map((v) => <button key={v} className={`pq-opt${version === v ? " on" : ""}`} onClick={() => pickVersion(v)} data-testid={`q-ver-${v}`}>{v}</button>)}</div>
        </div>
      )}
      {gen && version && (
        <div className="pq-step">
          <h2>Capacidad</h2>
          <div className="pq-opts">{capacitiesFor(gen, version).map((c) => <button key={c} className={`pq-opt${capacity === c ? " on" : ""}`} onClick={() => setCapacity(c)} data-testid={`q-cap-${c}`}>{capLabel(c)}</button>)}</div>
        </div>
      )}
      {gen && version && capacity && (
        <div className="pq-step">
          <h2>Salud de la batería</h2>
          <div className="pq-opts">{BATTERY_RANGES.map((b) => <button key={b.id} className={`pq-opt${battery === b.id ? " on" : ""}`} onClick={() => setBattery(b.id)} data-testid={`q-bat-${b.id}`}>{b.label}</button>)}</div>
          <p className="pq-note" style={{ marginTop: 8 }}>La ves en Ajustes › Batería › Estado de la batería.</p>
        </div>
      )}

      {q && (
        <div className="pq-result" data-testid="quote-result">
          <div className="pc-sub" style={{ fontSize: 15 }}>{modelName(gen!, version!)} · {capLabel(capacity!)} · batería {q.battery.toLowerCase()}</div>
          {q.ok ? (
            <>
              <div className="pq-value" data-testid="quote-value">Vale hasta {fmtUSD(q.value)}</div>
              <p className="pq-note">
                Valor orientativo para un equipo en muy buen estado, sin fallas y con iCloud libre. Lo confirmamos al revisarlo en el local; golpes, fallas o
                piezas cambiadas pueden bajarlo. Lo descontamos del precio de tu próximo equipo.
              </p>
            </>
          ) : (
            <>
              <div className="pq-value" style={{ fontSize: 26 }} data-testid="quote-handoff">Este modelo lo cotiza un asesor</div>
              <p className="pq-note">Todavía no tenemos un valor de referencia para este equipo. Escribinos y te pasamos la cotización.</p>
            </>
          )}
          <div className="pc-sheet-actions">
            {hasWa ? (
              <a className="pc-pill pc-blue" href={waHref(cfg.slug, quoteMessage(q), undefined, `Cotizador: ${q.model} ${capLabel(q.capacity)}`)} target="_blank" rel="noreferrer" data-testid="quote-wa">
                {q.ok ? "Quiero entregarlo" : "Hablar con un asesor"} por WhatsApp
              </a>
            ) : <p className="pc-sub">Escribinos al {cfg.phone}.</p>}
            <Link href={`/catalogo/${cfg.slug}`} className="pc-pill pc-soft">Ver equipos disponibles</Link>
          </div>
        </div>
      )}
    </div>
  );
}
