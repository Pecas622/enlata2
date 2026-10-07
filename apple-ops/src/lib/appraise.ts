// Tasación de plan canje e ingresos: réplica exacta de appraise() del prototipo.
import { deviceShort } from "./catalog";

export type AppraisalConfig = {
  baseValues: { model: string; capacity: number; value: number }[];
  condMult: Record<string, number>;
  defectCosts: Record<string, number>;
  targetMargin: number;
};

export type AppraisalInput = {
  model: string;
  capacity: number;
  cond: string;
  battery?: number | string | null;
  defects?: string[];
  icloudFree?: boolean;
  imeiClean?: boolean;
};

export type Appraisal = {
  ok: boolean;
  blocked?: boolean;
  base: number;
  value: number;
  lines: { label: string; amount: number }[];
  reason?: string;
};

export function appraise(cfg: AppraisalConfig, d: AppraisalInput): Appraisal {
  const row = cfg.baseValues.find((r) => r.model === d.model && String(r.capacity) === String(d.capacity));
  if (!d.model) return { ok: false, base: 0, value: 0, lines: [], reason: "Elegí el modelo del equipo." };
  if (d.icloudFree === false) return { ok: false, blocked: true, base: 0, value: 0, lines: [], reason: "Equipo con bloqueo de iCloud o Buscar mi iPhone activo. No se puede tomar." };
  if (d.imeiClean === false) return { ok: false, blocked: true, base: 0, value: 0, lines: [], reason: "IMEI con denuncia o bloqueo. No se puede tomar." };
  if (!row) return { ok: false, base: 0, value: 0, lines: [], reason: "Este modelo no tiene valor de referencia. Cargalo en Configuración o ingresá el valor a mano." };

  const lines = [{ label: `Valor de referencia ${deviceShort(d)}`, amount: row.value }];
  let v = row.value;
  const m = cfg.condMult[d.cond];
  if (m !== undefined && m !== 1) {
    const adj = Math.round(v * (m - 1));
    lines.push({ label: `Condición ${d.cond}`, amount: adj });
    v += adj;
  }
  const bat = Number(d.battery) || 100;
  const pen = bat < 80 ? 0.08 : bat < 90 ? 0.03 : 0;
  if (pen) {
    const adj = -Math.round(row.value * pen);
    lines.push({ label: `Batería al ${bat}%`, amount: adj });
    v += adj;
  }
  for (const def of d.defects ?? []) {
    const c = cfg.defectCosts[def] || 0;
    lines.push({ label: def, amount: -c });
    v -= c;
  }
  v = Math.max(0, Math.round(v / 5) * 5);
  return { ok: true, base: row.value, value: v, lines };
}

// Precio de reventa sugerido: costo + margen objetivo, redondeado a 10.
export function suggestedResale(cfg: Pick<AppraisalConfig, "targetMargin">, costUSD: number) {
  return Math.max(0, Math.round(((Number(costUSD) || 0) * (1 + cfg.targetMargin)) / 10) * 10);
}
