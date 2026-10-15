// Publicar en Instagram: qué se puede publicar y cómo se arma, y una vuelta del publicador.
// Las reglas de Instagram (octubre de 2026): fotos solo en JPG; un video publicado va como Reel; el carrusel lleva
// de 2 a 10 archivos; la historia, uno. El texto llega a 2200 caracteres y la historia no lleva texto.
import type { Format } from "./channels";
import { IgError, containerStatus, createContainer, mediaPermalink, publishContainer, type ContainerParams } from "./instagram";

export type MediaRef = { path: string; mime: string };
export type IgKind = "IMAGE" | "REELS" | "CAROUSEL" | "STORIES";
export type IgPlan = { ok: true; kind: IgKind; items: MediaRef[] } | { ok: false; error: string };

const isVideo = (m: MediaRef) => m.mime.startsWith("video/");
const isJpeg = (m: MediaRef) => m.mime === "image/jpeg";
const NOT_JPEG = "Instagram publica las fotos solo en JPG: subí la foto en JPG (desde el celular, exportala o sacale captura).";

export function igPlan(format: Format, media: MediaRef[]): IgPlan {
  if (format === "Anuncio") return { ok: false, error: "Los anuncios se cargan en Meta Ads, no se publican desde acá." };
  if (format === "Mensaje") return { ok: false, error: "Los mensajes no se publican en Instagram." };
  if (media.length === 0) return { ok: false, error: "Subí las fotos o el video de la pieza antes de publicarla." };
  if (media.some((m) => !isVideo(m) && !isJpeg(m))) return { ok: false, error: NOT_JPEG };
  if (format === "Reel") {
    if (media.length !== 1 || !isVideo(media[0])) return { ok: false, error: "Un Reel lleva un solo video." };
    return { ok: true, kind: "REELS", items: media };
  }
  if (format === "Historia") {
    if (media.length !== 1) return { ok: false, error: "Una historia lleva un solo archivo: dejá una foto o un video." };
    return { ok: true, kind: "STORIES", items: media };
  }
  if (format === "Carrusel") {
    if (media.length < 2) return { ok: false, error: "Un carrusel lleva de 2 a 10 archivos." };
    if (media.length > 10) return { ok: false, error: "Un carrusel lleva hasta 10 archivos: sacá los que sobran." };
    return { ok: true, kind: "CAROUSEL", items: media };
  }
  if (media.length !== 1) return { ok: false, error: "Un post lleva un solo archivo. Para varios, cambiá la pieza a Carrusel." };
  return { ok: true, kind: isVideo(media[0]) ? "REELS" : "IMAGE", items: media };
}

export const PUBLISH_FORMATS: readonly Format[] = ["Post", "Carrusel", "Reel", "Historia"];

// Día y hora de Argentina (UTC−3, sin horario de verano) → instante.
export function scheduleAt(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${day}T${time}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const PUB_TONE: Record<string, "blue" | "amber" | "green" | "red"> = { Programada: "blue", Publicando: "amber", Publicada: "green", Error: "red" };

// ---------- una vuelta del publicador ----------

export type Job = { id: string; format: Format; caption: string; container_id: string; ig_user_id: string; media: MediaRef[] };

export type Outcome = { ok: true; external_id: string; permalink: string } | { retry: true } | { error: string; expired?: boolean };

export type Deps = {
  token: string;
  sign: (path: string) => Promise<string>;       // link firmado que Instagram pueda bajar
  saveContainer: (id: string) => Promise<void>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  waitMs?: number;                                // cuánto esperar a que procese un video en esta vuelta
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mediaParams(m: MediaRef, url: string): ContainerParams {
  return isVideo(m) ? { media_type: "VIDEO", video_url: url } : { image_url: url };
}

// Espera a que un contenedor quede listo. Devuelve el último estado.
async function settle(token: string, id: string, d: Deps, budget: number): Promise<string> {
  const sleep = d.sleep ?? wait;
  let left = budget;
  for (;;) {
    const { code, detail } = await containerStatus(token, id, d.fetch);
    if (code === "ERROR") throw new IgError(`Instagram no pudo procesar el archivo${detail ? ` (${detail})` : ""}. Revisá el formato y el tamaño.`);
    if (code === "EXPIRED") throw new IgError("El archivo venció antes de publicarse. Programala de nuevo.");
    if (code !== "IN_PROGRESS" || left <= 0) return code;
    await sleep(Math.min(3000, left));
    left -= 3000;
  }
}

async function buildContainer(job: Job, plan: Extract<IgPlan, { ok: true }>, d: Deps, budget: number): Promise<string> {
  const f = d.fetch;
  const caption: ContainerParams = plan.kind !== "STORIES" && job.caption ? { caption: job.caption } : {};
  if (plan.kind === "CAROUSEL") {
    const children: string[] = [];
    for (const m of plan.items) {
      const url = await d.sign(m.path);
      const child = await createContainer(d.token, job.ig_user_id, { ...mediaParams(m, url), is_carousel_item: "true" }, f);
      if (isVideo(m) && (await settle(d.token, child, d, budget)) === "IN_PROGRESS") {
        throw new IgError("Instagram tardó en procesar un video del carrusel. Probá de nuevo en un rato.");
      }
      children.push(child);
    }
    return createContainer(d.token, job.ig_user_id, { media_type: "CAROUSEL", children: children.join(","), ...caption }, f);
  }
  const m = plan.items[0];
  const url = await d.sign(m.path);
  const params: ContainerParams =
    plan.kind === "REELS" ? { media_type: "REELS", video_url: url } :
    plan.kind === "STORIES" ? { media_type: "STORIES", ...(isVideo(m) ? { video_url: url } : { image_url: url }) } :
    { image_url: url };
  return createContainer(d.token, job.ig_user_id, { ...params, ...caption }, f);
}

export async function processJob(job: Job, d: Deps): Promise<Outcome> {
  const budget = d.waitMs ?? 20000;
  let container = job.container_id;
  try {
    if (!container) {
      const plan = igPlan(job.format, job.media);
      if (!plan.ok) return { error: plan.error };
      container = await buildContainer(job, plan, d, budget);
      await d.saveContainer(container);
    }
    const code = await settle(d.token, container, d, budget);
    // Ya estaba publicada (una vuelta anterior publicó y se cortó antes de guardar): Instagram lo confirma igual.
    if (code === "PUBLISHED") return { ok: true, external_id: "", permalink: "" };
    if (code === "IN_PROGRESS") return { retry: true };
    const mediaId = await publishContainer(d.token, job.ig_user_id, container, d.fetch);
    const permalink = await mediaPermalink(d.token, mediaId, d.fetch).catch(() => "");
    return { ok: true, external_id: mediaId, permalink };
  } catch (e) {
    if (e instanceof IgError) return { error: e.message, expired: e.expired };
    // Se cortó la comunicación con el contenedor ya armado: puede que haya salido. La próxima vuelta lo mira.
    if (container) return { retry: true };
    return { error: e instanceof Error ? `No se pudo hablar con Instagram: ${e.message}` : "No se pudo hablar con Instagram." };
  }
}
