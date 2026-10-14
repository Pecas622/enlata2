// Archivos de las marcas: logo, fotos y videos en el bucket privado "media", en <espacio>/<marca>/<archivo>.
export const MEDIA_BUCKET = "media";
export const MAX_FILE_MB = 50;
export const ACCEPT = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"] as const;

export type MediaKind = "logo" | "foto" | "video";
export type MediaRow = { id: string; brand_id: string; content_id: string | null; path: string; name: string; mime: string; size_bytes: number; kind: MediaKind; created_at: string };
export const MEDIA_COLS = "id, brand_id, content_id, path, name, mime, size_bytes, kind, created_at";

// Nombre seguro para la ruta: sin tildes, espacios ni símbolos, con la extensión.
export function safeName(full: string): string {
  const name = full.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "archivo";
  return ext ? `${base}.${ext}` : base;
}

export function mediaPath(workspaceId: string, brandId: string, name: string, id: string): string {
  return `${workspaceId}/${brandId}/${id}-${safeName(name)}`;
}

// Lo que se chequea antes de subir; la base y el bucket lo vuelven a chequear.
export function checkFile(f: { type: string; size: number }): string | null {
  if (!(ACCEPT as readonly string[]).includes(f.type)) return "Ese tipo de archivo no va: subí JPG, PNG, WebP, MP4 o MOV.";
  if (f.size > MAX_FILE_MB * 1048576) return `El archivo pesa más de ${MAX_FILE_MB} MB.`;
  return null;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
}
