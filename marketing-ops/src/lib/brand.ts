// Nombre del producto en la interfaz. Se puede cambiar sin tocar código con NEXT_PUBLIC_PRODUCT_NAME.
export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || "MARKETING OPS";

// "MARKETING OPS" → ["MARKETING", "OPS"] para pintar la segunda palabra con el color de acento.
export function productParts(name = PRODUCT_NAME): [string, string] {
  const i = name.lastIndexOf(" ");
  return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, ""];
}
