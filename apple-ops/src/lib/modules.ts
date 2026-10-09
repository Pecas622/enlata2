// Módulos que se venden aparte de la base. La lista y el orden son los mismos que en la base
// (stores.modules y set_modulos).
export const MODULES = ["imei", "reportes", "catalogo", "asistente", "alertas", "facturacion"] as const;
export type ModuleId = (typeof MODULES)[number];

export const MODULE_INFO: Record<ModuleId, { label: string; desc: string }> = {
  imei: { label: "Stock con IMEI", desc: "Cada equipo con IMEI o serie obligatorio, sin repetidos en stock y en el boleto y el comprobante." },
  reportes: { label: "Reportes", desc: "Ventas, márgenes por vendedor y por producto, y exportación para Excel." },
  catalogo: { label: "Catálogo online", desc: "Página pública con el stock al día, fotos, destacados, cotizador de canje y botón de WhatsApp." },
  asistente: { label: "Asistente de chat con IA", desc: "Responde stock, precios y canje en el catálogo y deriva a una persona. Necesita el catálogo." },
  alertas: { label: "Alertas y dólar automático", desc: "Equipos parados, precios bajo el margen, reposición y cotización oficial, blue o MEP sola." },
  facturacion: { label: "Facturación electrónica", desc: "Factura A, B o C con CAE de ARCA en cada venta, y nota de crédito si la anulás. Con tu certificado y punto de venta." },
};

// Módulos que vienen con la base: el local los tiene desde el alta y no se cobran aparte.
export const BASE_MODULES: readonly ModuleId[] = ["imei", "alertas"];
// Los que se suman pagando aparte.
export const EXTRA_MODULES = MODULES.filter((m) => !BASE_MODULES.includes(m));

export const BASE_INCLUDES = "Ventas, stock con IMEI, ingresos, plan canje, accesorios, clientes, caja, alertas y dólar automático, usuarios y configuración.";

export function parseModules(raw: unknown): ModuleId[] {
  const list = Array.isArray(raw) ? raw : [];
  return MODULES.filter((m) => list.includes(m));
}

export const hasModule = (modules: readonly ModuleId[], m: ModuleId) => modules.includes(m);
