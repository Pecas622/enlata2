// Nombre comercial y contacto de ventas que usa la landing. El nombre del producto se cambia acá o con
// NEXT_PUBLIC_PRODUCT_NAME, sin tocar las pantallas. NEXT_PUBLIC_SALES_WHATSAPP (con código de país,
// por ejemplo 5492611234567) muestra el botón "Pedí una demo"; sin él, el botón no aparece.
export const BRAND = {
  product: process.env.NEXT_PUBLIC_PRODUCT_NAME || "APPLE OPS",
  company: "Enlata2",
  salesWhatsapp: (process.env.NEXT_PUBLIC_SALES_WHATSAPP || "").replace(/[^\d]/g, ""),
};

// "APPLE OPS" → ["APPLE", "OPS"]: la última palabra va en el color de acento.
export function splitProduct(name = BRAND.product): [string, string] {
  const i = name.trim().lastIndexOf(" ");
  return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, ""];
}
