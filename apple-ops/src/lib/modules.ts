// Módulos que se venden aparte de la base. La lista y el orden son los mismos que en la base
// (stores.modules y set_modulos).
export const MODULES = ["canje", "accesorios", "reportes", "catalogo", "asistente", "alertas"] as const;
export type ModuleId = (typeof MODULES)[number];

export const MODULE_INFO: Record<ModuleId, { label: string; desc: string }> = {
  canje: { label: "Plan canje", desc: "Tasación del usado con la fórmula del local, canje dentro de la venta y cotizador web." },
  accesorios: { label: "Accesorios", desc: "Stock en pesos con mínimos, carga masiva y venta junto con los equipos." },
  reportes: { label: "Reportes", desc: "Ventas, márgenes por vendedor y por producto, y exportación para Excel." },
  catalogo: { label: "Catálogo online", desc: "Página pública con el stock al día, fotos, destacados y botón de WhatsApp." },
  asistente: { label: "Asistente de chat", desc: "Responde stock, precios y canje en el catálogo y deriva a una persona. Necesita el catálogo." },
  alertas: { label: "Alertas y dólar automático", desc: "Equipos parados, precios bajo el margen, reposición y cotización oficial, blue o MEP sola." },
};

export const BASE_INCLUDES = "Ventas, stock con IMEI, ingresos, clientes, caja, usuarios y configuración.";

export function parseModules(raw: unknown): ModuleId[] {
  const list = Array.isArray(raw) ? raw : [];
  return MODULES.filter((m) => list.includes(m));
}

export const hasModule = (modules: readonly ModuleId[], m: ModuleId) => modules.includes(m);
