"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setPieceCampaign } from "../../campanas/actions";

export function CampaignPicker({ contentId, current, options, canEdit }: { contentId: string; current: string | null; options: { id: string; name: string }[]; canEdit: boolean }) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const name = options.find((o) => o.id === value)?.name;
  if (!canEdit) {
    return value && name ? <Link href={`/campanas/${value}`} style={{ color: "var(--accent)" }}>{name}</Link> : <span className="muted">No está en ninguna campaña.</span>;
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <select
        className="input"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const prev = value;
          const next = e.target.value;
          setValue(next);
          start(async () => {
            setError("");
            const r = await setPieceCampaign(contentId, next || null);
            if (r.error) { setError(r.error); setValue(prev); }
          });
        }}
        data-testid="content-campaign"
      >
        <option value="">Sin campaña</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {value && name && <Link href={`/campanas/${value}`} className="hint" style={{ color: "var(--accent)" }}>Ver la campaña</Link>}
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
