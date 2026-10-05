// "Cotizá tu iPhone": cotizador público. Usa appraise() con la tabla de tasación del local y
// supone el mejor caso (estado Usado A, sin fallas, iCloud libre), por eso dice "vale hasta".
import { appraise } from "./appraise";

export const GENERATIONS = ["11", "12", "13", "14", "15", "16"] as const;
export type Generation = (typeof GENERATIONS)[number];

export const VERSIONS = ["Base", "Mini", "Plus", "Pro", "Pro Max"] as const;
export type Version = (typeof VERSIONS)[number];

// Versiones que existieron en cada generación.
export function versionsFor(gen: Generation): Version[] {
  if (gen === "11") return ["Base", "Pro", "Pro Max"];
  if (gen === "12" || gen === "13") return ["Mini", "Base", "Pro", "Pro Max"];
  return ["Base", "Plus", "Pro", "Pro Max"];
}

export function capacitiesFor(gen: Generation, version: Version): number[] {
  if (gen === "11" || gen === "12") return version.startsWith("Pro") ? [64, 128, 256, 512] : [64, 128, 256];
  if (gen === "13" || gen === "14") return version.startsWith("Pro") ? [128, 256, 512, 1024] : [128, 256, 512];
  if (gen === "15" && version === "Pro Max") return [256, 512, 1024];
  return version.startsWith("Pro") ? [128, 256, 512, 1024] : [128, 256, 512];
}

export function modelName(gen: Generation, version: Version) {
  return `iPhone ${gen}${version === "Base" ? "" : version === "Mini" ? " mini" : ` ${version}`}`;
}

// Rangos de batería: el valor usado es el mejor de cada rango (appraise penaliza por debajo de 90 y de 80).
export const BATTERY_RANGES = [
  { id: "90", label: "90% o más", value: 100 },
  { id: "80", label: "80 a 89%", value: 89 },
  { id: "79", label: "Menos de 80%", value: 79 },
] as const;
export type BatteryRange = (typeof BATTERY_RANGES)[number]["id"];

export type PublicValue = { model: string; capacity: number; value_usd: number; mult_usado_a: number };

export type Quote = { model: string; capacity: number; battery: string } & ({ ok: true; value: number } | { ok: false; reason: "sin-valor" });

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function quote(values: PublicValue[], gen: Generation, version: Version, capacity: number, battery: BatteryRange): Quote {
  const model = modelName(gen, version);
  const range = BATTERY_RANGES.find((b) => b.id === battery) ?? BATTERY_RANGES[0];
  const row = values.find((v) => norm(v.model) === norm(model) && Number(v.capacity) === capacity);
  const base = { model, capacity, battery: range.label };
  if (!row || !(Number(row.value_usd) > 0)) return { ...base, ok: false, reason: "sin-valor" };
  const ap = appraise(
    { baseValues: [{ model: row.model, capacity, value: Number(row.value_usd) }], condMult: { "Usado A": Number(row.mult_usado_a) || 1 }, defectCosts: {}, targetMargin: 0 },
    { model: row.model, capacity, cond: "Usado A", battery: range.value, defects: [], icloudFree: true, imeiClean: true },
  );
  return { ...base, ok: true, value: ap.value };
}

export function capLabel(gb: number) {
  return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`;
}

export function quoteMessage(q: Quote) {
  const eq = `${q.model} de ${capLabel(q.capacity)} con batería ${q.battery.toLowerCase()}`;
  return q.ok
    ? `Hola! Coticé mi ${eq} en la web: vale hasta US$ ${q.value}. Quiero entregarlo en plan canje, ¿cuándo lo puedo llevar a revisar?`
    : `Hola! Quiero cotizar mi ${eq} para plan canje.`;
}
