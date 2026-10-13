import { productParts } from "@/lib/brand";

export function BrandName() {
  const [a, b] = productParts();
  return <span className="brand">{a}{b && <span>{b}</span>}</span>;
}
