import { describe, expect, it } from "vitest";
import { checkPhoto, photoPath, photoUrl } from "./photos";

describe("fotos de equipos", () => {
  it("acepta JPG, PNG y WebP de hasta 4 MB", () => {
    expect(checkPhoto("image/jpeg", 300_000)).toEqual({ ext: "jpg" });
    expect(checkPhoto("image/webp", 4 * 1024 * 1024)).toEqual({ ext: "webp" });
    expect(checkPhoto("image/gif", 1000)).toEqual({ error: "La foto tiene que ser JPG, PNG o WebP." });
    expect(checkPhoto("image/png", 4 * 1024 * 1024 + 1)).toEqual({ error: "La foto pesa más de 4 MB." });
    expect(checkPhoto("image/png", 0)).toEqual({ error: "Elegí una foto." });
  });
  it("arma la ruta por local y equipo, y la URL pública", () => {
    expect(photoPath("s1", "d1", "jpg", 1700000000123.4)).toBe("s1/d1-1700000000123.jpg");
    expect(photoUrl("s1/d1-1.jpg")).toBe(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/fotos-equipos/s1/d1-1.jpg`);
  });
});
