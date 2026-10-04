export function waLink(phone: string, text: string) {
  return `https://wa.me/${(phone || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(text || "")}`;
}
