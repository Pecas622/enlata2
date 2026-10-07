// Fotos de los equipos del catálogo: viven en el bucket público "fotos-equipos" de Supabase Storage,
// en <local>/<equipo>-<número>.<ext>. La base guarda solo la ruta.
export const PHOTO_BUCKET = "fotos-equipos";
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function photoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

// Valida tipo y tamaño. Devuelve la extensión o el mensaje de error.
export function checkPhoto(type: string, size: number): { ext: string } | { error: string } {
  const ext = TYPES[type];
  if (!ext) return { error: "La foto tiene que ser JPG, PNG o WebP." };
  if (!(size > 0)) return { error: "Elegí una foto." };
  if (size > PHOTO_MAX_BYTES) return { error: "La foto pesa más de 4 MB." };
  return { ext };
}

export function photoPath(store: string, device: string, ext: string, stamp: number) {
  return `${store}/${device}-${Math.floor(stamp)}.${ext}`;
}
