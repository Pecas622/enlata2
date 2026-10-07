import { PERIODS, type Period } from "@/lib/reports";

export const PERIOD_IDS: Record<string, Period> = { hoy: "Hoy", "7": "7 días", "30": "30 días", todo: "Todo" };
export const periodOf = (id?: string): Period => PERIOD_IDS[id ?? "30"] ?? "30 días";
export const idOf = (p: Period) => Object.keys(PERIOD_IDS).find((k) => PERIOD_IDS[k] === p) ?? "30";
export { PERIODS };
