// Accesorios: carga masiva y alertas de reposición, como en el prototipo.
import { ACC_CATEGORIES, type AccCategory } from "./catalog";

export type BulkRow = { name: string; category: AccCategory; cost: number; price: number; stock: number };

// Una línea por accesorio: "nombre; categoría; costo; precio; stock". Categoría desconocida → Otros.
export function parseBulk(text: string) {
  const parsed: BulkRow[] = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name = "", category = "", cost, price, stock] = l.split(";").map((x) => x.trim());
      return {
        name,
        category: (ACC_CATEGORIES as readonly string[]).includes(category) ? (category as AccCategory) : "Otros",
        cost: Number(cost) || 0,
        price: Number(price) || 0,
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
      };
    });
  return { parsed, valid: parsed.filter((p) => p.name && p.price > 0) };
}

export function isLow(a: { stock: number; min_stock: number }) {
  return a.min_stock > 0 && a.stock <= a.min_stock;
}

export function stockTone(a: { stock: number; min_stock: number }) {
  return a.stock === 0 ? "red" : isLow(a) ? "amber" : "green";
}
