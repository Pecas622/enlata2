"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { parseBulk } from "@/lib/accessories";
import { ACC_CATEGORIES } from "@/lib/catalog";
import { bulkLoad } from "../actions";

export function BulkForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { parsed, valid } = parseBulk(text);
  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await bulkLoad(valid);
      if (res.error) return setError(res.error);
      router.push(`/accesorios?cargados=${res.count}`);
    });
  };
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Pegá una línea por accesorio con este formato: <b style={{ color: "var(--text)" }}>nombre; categoría; costo; precio; stock</b>. Categorías: {ACC_CATEGORIES.join(", ")}. Si la categoría no existe, va a Otros.
      </p>
      <textarea className="input" style={{ minHeight: 160, resize: "vertical" }} value={text} onChange={(e) => setText(e.target.value)} data-testid="bulk-text"
        placeholder={"Funda silicona iPhone 16; Fundas; 3800; 12500; 10\nVidrio templado iPhone 16; Vidrios; 1300; 6800; 20"} />
      <div className={valid.length ? "ok" : "muted"} style={{ fontSize: 12.5 }} data-testid="bulk-count">{valid.length} líneas válidas de {parsed.length}.</div>
      {error && <div className="error" role="alert" data-testid="form-error">{error}</div>}
      <div><button className="btn btn-primary" disabled={!valid.length || pending} onClick={submit} data-testid="bulk-save">{pending ? "Cargando…" : `Cargar ${valid.length || ""}`}</button></div>
    </div>
  );
}
