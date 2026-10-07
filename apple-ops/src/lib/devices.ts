import type { DeviceStatus, Kind } from "./catalog";

export type DeviceRow = {
  id: string;
  kind: Kind;
  model: string;
  capacity: number;
  color: string;
  condition: string;
  imei: string;
  battery: number | null;
  price_usd: number;
  status: DeviceStatus;
  origin: string;
  entry_date: string;
  warranty_days: number;
  notes: string;
  cost_usd?: number | null;
};

export const DEVICE_COLUMNS = "id, kind, model, capacity, color, condition, imei, battery, price_usd, status, origin, entry_date, warranty_days, notes";

type Raw = Omit<DeviceRow, "cost_usd"> & { device_costs?: { cost_usd: number } | null };

// Los costos llegan de device_costs solo si el rol puede verlos (RLS devuelve null si no).
export function withCost(rows: Raw[]): DeviceRow[] {
  return rows.map(({ device_costs, ...d }) => ({
    ...d,
    price_usd: Number(d.price_usd),
    cost_usd: device_costs ? Number(device_costs.cost_usd) : null,
  }));
}
