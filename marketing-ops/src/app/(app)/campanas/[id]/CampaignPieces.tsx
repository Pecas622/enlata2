"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { formatLabel, type Channel, type Format } from "@/lib/channels";
import { fmtDate } from "@/lib/dates";
import { statusTone, type Status } from "@/lib/workflow";
import { setPieceCampaign } from "../actions";

type Piece = { id: string; title: string; channel: Channel; format: Format; status: Status; publish_on: string | null };
type Candidate = { id: string; title: string; status: Status; other: boolean };

export function CampaignPieces({ campaignId, canEdit, pieces, candidates }: { campaignId: string; canEdit: boolean; pieces: Piece[]; candidates: Candidate[] }) {
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (contentId: string, to: string | null) =>
    start(async () => {
      setError("");
      const r = await setPieceCampaign(contentId, to);
      if (r.error) setError(r.error);
      else setPick("");
    });

  return (
    <div className="card stack" data-testid="camp-pieces">
      <h2 className="card-title" style={{ margin: 0 }}>Piezas</h2>
      {pieces.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Todavía no tiene piezas.</p>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {pieces.map((p) => (
            <div key={p.id} className="camp-piece" data-testid="camp-piece">
              <Link href={`/contenidos/${p.id}`}>
                <b>{p.title}</b>
                <small>{p.channel} · {formatLabel(p.format, p.channel)} · {p.publish_on ? fmtDate(p.publish_on) : "Sin fecha"}</small>
              </Link>
              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
              {canEdit && <button className="btn btn-ghost" style={{ padding: "4px 8px" }} disabled={pending} onClick={() => run(p.id, null)} aria-label={`Sacar ${p.title} de la campaña`}>Sacar</button>}
            </div>
          ))}
        </div>
      )}
      {canEdit && candidates.length > 0 && (
        <div className="row" style={{ alignItems: "center" }}>
          <select className="input" style={{ flex: 1 }} value={pick} onChange={(e) => setPick(e.target.value)} data-testid="camp-add-select">
            <option value="">Sumar una pieza de la marca…</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.title} · {c.status}{c.other ? " (está en otra campaña)" : ""}</option>)}
          </select>
          <button className="btn btn-secondary" disabled={!pick || pending} onClick={() => run(pick, campaignId)} data-testid="camp-add">Sumar</button>
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
