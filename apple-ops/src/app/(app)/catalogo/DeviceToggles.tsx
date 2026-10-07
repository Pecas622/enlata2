"use client";

import { useState, useTransition } from "react";
import { setDeviceFlags } from "./actions";

function Switch({ on, onClick, label, testid, disabled }: { on: boolean; onClick: () => void; label: string; testid: string; disabled: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? " on" : ""}`} onClick={onClick} disabled={disabled} data-testid={testid}><i /></button>;
}

export function DeviceToggles({ id, visible, featured }: { id: string; visible: boolean; featured: boolean }) {
  const [v, setV] = useState({ visible, featured });
  const [pending, startTransition] = useTransition();
  const save = (next: typeof v) => {
    const prev = v;
    setV(next);
    startTransition(async () => {
      if ((await setDeviceFlags(id, next.visible, next.featured)).error) setV(prev);
    });
  };
  return (
    <>
      <td><Switch on={v.featured} onClick={() => save({ ...v, featured: !v.featured })} label="Destacado" testid={`feat-${id}`} disabled={pending} /></td>
      <td><Switch on={v.visible} onClick={() => save({ ...v, visible: !v.visible })} label="Visible" testid={`vis-${id}`} disabled={pending} /></td>
    </>
  );
}
