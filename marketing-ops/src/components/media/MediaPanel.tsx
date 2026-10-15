"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteMedia, registerMedia } from "@/app/(app)/archivos/actions";
import { ACCEPT, checkFile, fmtSize, MEDIA_BUCKET, mediaPath } from "@/lib/media";
import type { MediaItem } from "@/lib/media-server";
import { createClient } from "@/lib/supabase/browser";

type Props = {
  workspaceId: string;
  brandId: string;
  contentId?: string;
  items: MediaItem[];
  canEdit: boolean;
  back: string;
  title: string;
  hint: string;
  withLogo?: boolean;
};

export function MediaPanel({ workspaceId, brandId, contentId, items, canEdit, back, title, hint, withLogo }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"logo" | "foto">("foto");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [, start] = useTransition();
  const logo = items.find((i) => i.kind === "logo");
  const rest = items.filter((i) => i.kind !== "logo");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const supabase = createClient();
    for (const file of Array.from(files)) {
      const bad = checkFile(file);
      if (bad) { setError(`${file.name}: ${bad}`); continue; }
      if (kind === "logo" && !file.type.startsWith("image/")) { setError("El logo tiene que ser una imagen."); continue; }
      setBusy(`Subiendo ${file.name}…`);
      const path = mediaPath(workspaceId, brandId, file.name, crypto.randomUUID());
      const { error: up } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up) { setError(`${file.name}: no se pudo subir (${up.message}).`); continue; }
      const r = await registerMedia({ path, name: file.name, kind, contentId, back });
      if (r.error) setError(`${file.name}: ${r.error}`);
    }
    setBusy("");
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function remove(id: string) {
    start(async () => {
      const r = await deleteMedia(id, back);
      if (r.error) setError(r.error);
      router.refresh();
    });
  }

  const tile = (m: MediaItem) => (
    <figure key={m.id} className="media-tile" data-testid="media-item">
      {/* Links firmados de un bucket privado: next/image no los puede optimizar. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.url ? (m.mime.startsWith("video/") ? <video src={m.url} controls preload="metadata" /> : <img src={m.url} alt={m.name} loading="lazy" />) : <div className="media-missing">Sin vista previa</div>}
      <figcaption>
        <span title={m.name}>{m.name}</span>
        <small>{fmtSize(m.size_bytes)}{m.url && <> · <a href={m.url} target="_blank" rel="noreferrer" download={m.name}>Bajar</a></>}</small>
        {canEdit && <button className="btn btn-ghost btn-sm danger" onClick={() => remove(m.id)} data-testid="media-delete">Borrar</button>}
      </figcaption>
    </figure>
  );

  return (
    <section className="card" data-testid="media-panel">
      <h2 className="card-title">{title}</h2>
      <p className="hint" style={{ marginTop: 0 }}>{hint}</p>
      {withLogo && (
        <div className="media-logo" data-testid="brand-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo?.url ? <img src={logo.url} alt="Logo" /> : <div className="media-missing">Sin logo</div>}
          <span className="muted" style={{ fontSize: 13 }}>{logo ? "Logo de la marca" : "Subí el logo para tenerlo a mano en cada pieza."}</span>
        </div>
      )}
      {canEdit && (
        <div className="row" style={{ gap: 8, alignItems: "center", margin: "10px 0" }}>
          {withLogo && (
            <select className="input input-sm" value={kind} onChange={(e) => setKind(e.target.value as "logo" | "foto")} data-testid="media-kind">
              <option value="foto">Foto o video</option>
              <option value="logo">Logo</option>
            </select>
          )}
          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            {busy ? "Subiendo…" : "Subir archivos"}
            <input ref={input} type="file" accept={ACCEPT.join(",")} multiple={kind !== "logo"} hidden disabled={Boolean(busy)} onChange={(e) => upload(e.target.files)} data-testid="media-input" />
          </label>
          <span className="muted" style={{ fontSize: 12 }}>JPG, PNG, WebP, MP4 o MOV, hasta 50 MB.</span>
        </div>
      )}
      {busy && <div className="muted" style={{ fontSize: 13 }}>{busy}</div>}
      {error && <div className="error" role="alert" data-testid="media-error">{error}</div>}
      {rest.length ? <div className="media-grid">{rest.map(tile)}</div> : <div className="empty" style={{ padding: 16 }}>Todavía no hay archivos.</div>}
    </section>
  );
}
