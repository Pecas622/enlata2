import { describe, expect, it } from "vitest";
import { igPlan, processJob, scheduleAt, type Deps, type Job } from "./publish";

const jpg = (n = 1) => ({ path: `ws/b/${n}.jpg`, mime: "image/jpeg" });
const mp4 = { path: "ws/b/v.mp4", mime: "video/mp4" };
const png = { path: "ws/b/x.png", mime: "image/png" };

// Instagram de mentira: responde según la ruta y anota cada pedido. Los estados del contenedor salen en orden.
function fakeIg(opts: { statuses?: string[]; publishError?: { message: string; code?: number } } = {}) {
  const seen: string[] = [];
  const statuses = [...(opts.statuses ?? ["FINISHED"])];
  let n = 0;
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    seen.push(`${init?.method ?? "GET"} ${u.replace(/^https:\/\/graph\.instagram\.com\/v[\d.]+/, "")}${init?.body ? ` ${init.body}` : ""}`);
    let body: unknown;
    if (u.includes("/media_publish")) body = opts.publishError ? { error: opts.publishError } : { id: "media-1" };
    else if (u.includes("fields=permalink")) body = { permalink: "https://www.instagram.com/p/abc/" };
    else if (u.includes("fields=status_code")) body = { status_code: statuses.length > 1 ? statuses.shift() : statuses[0] };
    else if (u.endsWith("/media")) body = { id: `cont-${++n}` };
    const status = (body as { error?: unknown }).error ? 400 : 200;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { f, seen };
}

function deps(f: typeof fetch, saved: string[] = []): Deps {
  return { token: "tok", fetch: f, sign: async (p) => `https://files.test/${p}`, saveContainer: async (id) => void saved.push(id), sleep: async () => {}, waitMs: 6000 };
}

const job = (extra: Partial<Job> = {}): Job => ({ id: "p1", format: "Post", caption: "Medialunas recién salidas\n\n#laespiga", container_id: "", ig_user_id: "1784", media: [jpg()], ...extra });

describe("qué se puede publicar en Instagram", () => {
  it("cada formato con sus archivos", () => {
    expect(igPlan("Post", [jpg()])).toMatchObject({ ok: true, kind: "IMAGE" });
    expect(igPlan("Post", [mp4])).toMatchObject({ ok: true, kind: "REELS" });
    expect(igPlan("Reel", [mp4])).toMatchObject({ ok: true, kind: "REELS" });
    expect(igPlan("Historia", [jpg()])).toMatchObject({ ok: true, kind: "STORIES" });
    expect(igPlan("Carrusel", [jpg(1), mp4, jpg(2)])).toMatchObject({ ok: true, kind: "CAROUSEL" });
  });

  it("explica por qué no", () => {
    expect(igPlan("Post", [])).toMatchObject({ ok: false, error: expect.stringContaining("Subí las fotos") });
    expect(igPlan("Post", [png])).toMatchObject({ ok: false, error: expect.stringContaining("JPG") });
    expect(igPlan("Post", [jpg(1), jpg(2)])).toMatchObject({ ok: false, error: expect.stringContaining("Carrusel") });
    expect(igPlan("Reel", [jpg()])).toMatchObject({ ok: false, error: "Un Reel lleva un solo video." });
    expect(igPlan("Carrusel", [jpg()])).toMatchObject({ ok: false });
    expect(igPlan("Carrusel", Array.from({ length: 11 }, (_, i) => jpg(i)))).toMatchObject({ ok: false, error: expect.stringContaining("hasta 10") });
    expect(igPlan("Anuncio", [jpg()])).toMatchObject({ ok: false, error: expect.stringContaining("Meta Ads") });
  });

  it("el horario se toma en Argentina", () => {
    expect(scheduleAt("2026-10-20", "19:30")).toBe("2026-10-20T22:30:00.000Z");
    expect(scheduleAt("2026-10-20", "")).toBeNull();
    expect(scheduleAt("20/10/2026", "19:30")).toBeNull();
  });
});

describe("una vuelta del publicador", () => {
  it("foto: arma el contenedor con el link y el texto, publica y trae el link", async () => {
    const { f, seen } = fakeIg();
    const saved: string[] = [];
    const out = await processJob(job(), deps(f, saved));
    expect(out).toEqual({ ok: true, external_id: "media-1", permalink: "https://www.instagram.com/p/abc/" });
    expect(saved).toEqual(["cont-1"]);
    expect(seen[0]).toContain("POST /1784/media");
    expect(seen[0]).toContain("image_url=https%3A%2F%2Ffiles.test%2Fws%2Fb%2F1.jpg");
    expect(seen[0]).toContain("caption=Medialunas");
    expect(seen.some((s) => s.startsWith("POST /1784/media_publish") && s.includes("creation_id=cont-1"))).toBe(true);
  });

  it("carrusel: un contenedor por archivo y uno que los junta", async () => {
    const { f, seen } = fakeIg();
    const out = await processJob(job({ format: "Carrusel", media: [jpg(1), jpg(2)] }), deps(f));
    expect(out).toMatchObject({ ok: true });
    const creates = seen.filter((s) => s.startsWith("POST /1784/media "));
    expect(creates).toHaveLength(3);
    expect(creates[0]).toContain("is_carousel_item=true");
    expect(creates[2]).toContain("media_type=CAROUSEL");
    expect(creates[2]).toContain("children=cont-1%2Ccont-2");
  });

  it("historia: sin texto", async () => {
    const { f, seen } = fakeIg();
    await processJob(job({ format: "Historia" }), deps(f));
    expect(seen[0]).toContain("media_type=STORIES");
    expect(seen[0]).not.toContain("caption=");
  });

  it("un video que sigue procesándose se deja para la próxima vuelta, y la próxima vuelta sigue con el mismo contenedor", async () => {
    const first = fakeIg({ statuses: ["IN_PROGRESS"] });
    expect(await processJob(job({ format: "Reel", media: [mp4] }), deps(first.f))).toEqual({ retry: true });
    expect(first.seen[0]).toContain("media_type=REELS");
    expect(first.seen.some((s) => s.includes("media_publish"))).toBe(false);
    const second = fakeIg({ statuses: ["FINISHED"] });
    expect(await processJob(job({ format: "Reel", media: [mp4], container_id: "cont-9" }), deps(second.f))).toMatchObject({ ok: true });
    expect(second.seen.some((s) => s.startsWith("POST /1784/media "))).toBe(false);
  });

  it("si Instagram ya lo había publicado, lo da por publicado; si falla, devuelve el motivo", async () => {
    expect(await processJob(job({ container_id: "cont-9" }), deps(fakeIg({ statuses: ["PUBLISHED"] }).f))).toEqual({ ok: true, external_id: "", permalink: "" });
    expect(await processJob(job(), deps(fakeIg({ statuses: ["ERROR"] }).f))).toMatchObject({ error: expect.stringContaining("no pudo procesar") });
    const dead = await processJob(job(), deps(fakeIg({ publishError: { message: "Session has expired", code: 190 } }).f));
    expect(dead).toEqual({ error: "Session has expired", expired: true });
    expect(await processJob(job({ media: [png] }), deps(fakeIg().f))).toMatchObject({ error: expect.stringContaining("JPG") });
  });

  it("si se corta la comunicación con el contenedor ya armado, reintenta en vez de duplicar", async () => {
    const broken = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await processJob(job({ container_id: "cont-9" }), deps(broken))).toEqual({ retry: true });
    expect(await processJob(job(), deps(broken))).toMatchObject({ error: expect.stringContaining("No se pudo hablar con Instagram") });
  });
});
