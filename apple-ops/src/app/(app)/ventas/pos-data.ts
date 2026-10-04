import { loadStoreConfig } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export type PosDevice = { id: string; kind: string; model: string; capacity: number; color: string; condition: string; battery: number | null; imei: string; price_usd: number; warranty_days: number };
export type PosAccessory = { id: string; sku: string; name: string; category: string; price_ars: number; stock: number };
export type PosClient = { id: string; name: string; phone: string };
export type PosSeller = { id: string; name: string };

// Lo que necesita el punto de venta: stock disponible, clientes, vendedores, configuración y caja.
export async function loadPosData() {
  const supabase = await createClient();
  const [cfg, devices, accessories, clients, sellers, shift] = await Promise.all([
    loadStoreConfig(supabase),
    supabase.from("devices").select("id, kind, model, capacity, color, condition, battery, imei, price_usd, warranty_days").eq("status", "Disponible").order("model"),
    supabase.from("accessories").select("id, sku, name, category, price_ars, stock").order("name"),
    supabase.from("clients").select("id, name, phone").order("name"),
    supabase.from("profiles").select("id, name").eq("active", true).in("role", ["Vendedor", "Encargado", "Administrador"]).order("name"),
    supabase.rpc("caja_abierta"),
  ]);
  return {
    cfg,
    devices: (devices.data ?? []).map((d) => ({ ...d, price_usd: Number(d.price_usd) })) as PosDevice[],
    accessories: (accessories.data ?? []).map((a) => ({ ...a, price_ars: Number(a.price_ars) })) as PosAccessory[],
    clients: (clients.data ?? []) as PosClient[],
    sellers: (sellers.data ?? []) as PosSeller[],
    shiftOpen: shift.data === true,
  };
}
