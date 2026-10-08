"use server";

import { revalidatePath } from "next/cache";
import { cifradoConfigurado, cifrar, descifrar, generarClaveYCsr, leerCertificado } from "@/lib/arca-cert";
import { probarConexion } from "@/lib/arca-server";
import { cuitValido } from "@/lib/factura";
import type { FxSource } from "@/lib/fx";
import { hasModule } from "@/lib/modules";
import { refreshFx } from "@/lib/fx-server";
import { PHOTO_BUCKET } from "@/lib/photos";
import { getCurrentUser } from "@/lib/session";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type ConfigInput = {
  name: string; cuit: string; address: string; phone: string; fx: number; target_margin: number; max_discount_seller: number;
  warranty_new_days: number; warranty_used_days: number; cond_mult: Record<string, number>; defect_costs: Record<string, number>;
  base_values: { model: string; capacity: number; value: number }[];
};

export async function guardarConfig(input: ConfigInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  // Con cotización automática, se guarda la vigente y no la que quedó en el formulario.
  const { data: cur } = await supabase.from("stores").select("fx, fx_source").eq("id", (await getCurrentUser()).storeId).single();
  if (cur && cur.fx_source !== "manual") input = { ...input, fx: Number(cur.fx) };
  const { error } = await supabase.rpc("guardar_config", { p: input });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

export async function cargarDemo(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cargar_demo");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

// Deja el local en cero para entregarlo. También borra de Storage las fotos de los equipos borrados.
export async function borrarDemo(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("borrar_demo");
  if (error) return { error: error.message };
  const photos = (data as string[] | null) ?? [];
  if (photos.length) await createServiceClient().storage.from(PHOTO_BUCKET).remove(photos);
  revalidatePath("/", "layout");
  return {};
}

export async function guardarDolarYAlertas(input: { source: FxSource; extra: number; staleDays: number }): Promise<{ error?: string; warning?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_cotizacion_y_alertas", { p_source: input.source, p_extra: input.extra, p_stale_days: input.staleDays });
  if (error) return { error: error.message };
  let warning: string | undefined;
  if (input.source !== "manual") {
    const r = await refreshFx({ storeId: (await getCurrentUser()).storeId, force: true });
    if (r.failed) warning = "Se guardó, pero no se pudo consultar la cotización ahora. Se reintenta sola.";
  }
  revalidatePath("/", "layout");
  return { warning };
}

export async function actualizarCotizacion(): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (user.role !== "Administrador") return { error: "Solo el administrador cambia la configuración." };
  const r = await refreshFx({ storeId: user.storeId, force: true });
  if (r.checked === 0) return { error: "La cotización está en manual." };
  if (r.failed) return { error: "No se pudo consultar la cotización. Queda la última que había." };
  revalidatePath("/", "layout");
  return {};
}

// ---------- facturación electrónica ----------

export type FiscalInput = {
  razon_social: string; cuit: string; condicion_iva: string; iibb: string; inicio_actividades: string;
  punto_venta: number; alicuota_iva: number; ambiente: string; automatica: boolean;
};

export async function guardarDatosFiscales(input: FiscalInput): Promise<{ error?: string }> {
  const supabase = await createClient();
  if (!cuitValido(input.cuit)) return { error: "El CUIT no es válido." };
  const { error } = await supabase.rpc("guardar_datos_fiscales", { p: input });
  if (error) return { error: error.message };
  revalidatePath("/config");
  return {};
}

async function adminFacturacion() {
  const user = await getCurrentUser();
  if (user.role !== "Administrador") throw new Error("Solo el Administrador configura la facturación.");
  if (!hasModule(user.modules, "facturacion")) throw new Error("El local no tiene el módulo de facturación.");
  if (!cifradoConfigurado()) throw new Error("Falta configurar ARCA_KEY_SECRET en el servidor (ver DEPLOY.md).");
  return user;
}

const logFiscal = (storeId: string, user: { id: string; name: string }, detail: string) =>
  createServiceClient().from("audit_log").insert({ store_id: storeId, profile_id: user.id, user_name: user.name, action: "Configuración", detail });

// Genera la clave privada del local (queda cifrada en la base) y el pedido de certificado para ARCA.
// Un pedido nuevo reemplaza al certificado anterior.
export async function generarPedidoCertificado(): Promise<{ error?: string; csr?: string }> {
  try {
    const user = await adminFacturacion();
    const db = createServiceClient();
    const [{ data: f }, { data: s }] = await Promise.all([
      db.from("fiscal_settings").select("razon_social").eq("store_id", user.storeId).maybeSingle(),
      db.from("stores").select("cuit").eq("id", user.storeId).single(),
    ]);
    if (!f?.razon_social || !s || !cuitValido(s.cuit)) return { error: "Primero guardá la razón social y el CUIT." };
    const alias = `appleops${s.cuit.slice(-4)}${Date.now().toString(36).slice(-4)}`;
    const { keyPem, csrPem } = generarClaveYCsr({ cuit: s.cuit, razonSocial: f.razon_social, alias });
    const now = new Date().toISOString();
    const { error: e1 } = await db.from("fiscal_credentials").upsert({ store_id: user.storeId, key_enc: cifrar(keyPem), cert_pem: "", token: "", sign: "", token_vence: null, updated_at: now });
    if (e1) return { error: e1.message };
    const { error: e2 } = await db.from("fiscal_settings").update({ csr_pem: csrPem, cert_alias: alias, cert_vence: null, updated_at: now }).eq("store_id", user.storeId);
    if (e2) return { error: e2.message };
    await logFiscal(user.storeId, user, `facturación: nuevo pedido de certificado (${alias})`);
    revalidatePath("/config");
    return { csr: csrPem };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Guarda el certificado que devolvió ARCA, si corresponde a la clave del local y a su CUIT.
export async function guardarCertificado(pem: string): Promise<{ error?: string }> {
  try {
    const user = await adminFacturacion();
    const db = createServiceClient();
    const [{ data: c }, { data: s }] = await Promise.all([
      db.from("fiscal_credentials").select("key_enc").eq("store_id", user.storeId).maybeSingle(),
      db.from("stores").select("cuit").eq("id", user.storeId).single(),
    ]);
    if (!c?.key_enc) return { error: "Primero generá el pedido de certificado." };
    const info = leerCertificado(pem, descifrar(c.key_enc));
    if (!info.coincide) return { error: "Ese certificado no es del último pedido generado acá. Subí el que ARCA te dio para ese pedido." };
    if (info.cuit && s && info.cuit !== s.cuit) return { error: `El certificado es del CUIT ${info.cuit} y el local tiene ${s.cuit}.` };
    if (info.vence <= new Date()) return { error: "El certificado está vencido." };
    const now = new Date().toISOString();
    const { error: e1 } = await db.from("fiscal_credentials").update({ cert_pem: pem.trim(), token: "", sign: "", token_vence: null, updated_at: now }).eq("store_id", user.storeId);
    if (e1) return { error: e1.message };
    await db.from("fiscal_settings").update({ cert_vence: info.vence.toISOString(), updated_at: now }).eq("store_id", user.storeId);
    await logFiscal(user.storeId, user, `facturación: certificado cargado, vence ${info.vence.toISOString().slice(0, 10)}`);
    revalidatePath("/config");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function probarArca(): Promise<{ error?: string; ok?: string }> {
  try {
    const user = await adminFacturacion();
    const r = await probarConexion(user.storeId);
    if (!r.ok) return { error: r.error };
    return { ok: `Conectado con ARCA. Última factura ${r.letra} autorizada en el punto de venta: ${r.ultimo}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
