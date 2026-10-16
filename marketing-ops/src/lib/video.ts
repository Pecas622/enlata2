// Editar video con IA: el plan de edición (qué tramos quedan y qué textos van en pantalla), su control y cómo se
// arma el comando para el motor de video (ffmpeg, que corre en el navegador). La IA mira fotogramas y decide el plan;
// sin IA, el plan sale de reglas con el guion de la pieza. Los textos en pantalla salen de la pieza: lo que traiga un
// precio o un porcentaje que no estaba se descarta.
import { unbackedNumbers, type Format } from "./channels";

export type Segment = { start: number; end: number };
export type Position = "arriba" | "centro" | "abajo";
export type Overlay = { start: number; end: number; text: string; position: Position };
export type VideoPlan = { segments: Segment[]; overlays: Overlay[]; summary: string };

export const OUT_W = 720;
export const OUT_H = 1280;
export const MAX_FRAMES = 12;
export const OVERLAY_MAX = 70;
const MAX_OVERLAYS = 6;
const MIN_SEGMENT = 1;

// Cuánto conviene que dure el video según el formato (segundos).
export function targetLength(format: Format): { min: number; ideal: number; max: number } {
  if (format === "Historia") return { min: 3, ideal: 12, max: 15 };
  if (format === "Anuncio") return { min: 5, ideal: 15, max: 30 };
  return { min: 5, ideal: 20, max: 30 };
}

// Momentos que se muestran a la IA: repartidos en el video, sin el primer y último cuadro (suelen estar negros).
export function frameTimes(duration: number, n = MAX_FRAMES): number[] {
  if (!(duration > 0)) return [];
  const count = Math.max(1, Math.min(n, Math.floor(duration / 1.5) || 1));
  const step = duration / count;
  return Array.from({ length: count }, (_, i) => round1(Math.min(duration - 0.1, step * i + step / 2)));
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const total = (s: Segment[]) => round1(s.reduce((a, x) => a + (x.end - x.start), 0));

export const planLength = (p: Pick<VideoPlan, "segments">) => total(p.segments);

// Corta un texto en líneas de hasta `width` caracteres, sin partir palabras.
export function wrap(text: string, width = 22): string {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= width) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4).join("\n");
}

type RawPlan = { tramos?: unknown; textos?: unknown; resumen?: unknown };

// Controla un plan (de la IA o de la persona): tramos dentro del video, en orden, sin pisarse y sin pasarse del largo
// del formato; textos dentro del video final, cortos y sin números que no estén en la pieza.
export function validatePlan(raw: RawPlan, duration: number, format: Format, source: string): VideoPlan {
  const { max } = targetLength(format);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const segs: Segment[] = (Array.isArray(raw.tramos) ? raw.tramos : [])
    .map((t) => ({ start: round1(Math.max(0, num((t as Segment)?.start ?? (t as { inicio?: unknown })?.inicio))), end: round1(Math.min(duration, num((t as Segment)?.end ?? (t as { fin?: unknown })?.fin))) }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end - s.start >= MIN_SEGMENT)
    .sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let used = 0;
  for (const s of segs) {
    const prev = segments[segments.length - 1];
    const start = prev && s.start < prev.end ? prev.end : s.start;
    if (s.end - start < MIN_SEGMENT) continue;
    const end = round1(Math.min(s.end, start + (max - used)));
    if (end - start < MIN_SEGMENT) break;
    segments.push({ start, end });
    used = round1(used + end - start);
  }
  const length = total(segments);
  const overlays: Overlay[] = (Array.isArray(raw.textos) ? raw.textos : [])
    .map((t) => {
      const o = t as { start?: unknown; end?: unknown; inicio?: unknown; fin?: unknown; text?: unknown; texto?: unknown; position?: unknown; posicion?: unknown };
      const text = String(o.text ?? o.texto ?? "").replace(/\s+/g, " ").trim().slice(0, OVERLAY_MAX);
      const pos = String(o.position ?? o.posicion ?? "abajo");
      return {
        start: round1(Math.max(0, num(o.start ?? o.inicio))),
        end: round1(Math.min(length, num(o.end ?? o.fin))),
        text,
        position: (["arriba", "centro", "abajo"].includes(pos) ? pos : "abajo") as Position,
      };
    })
    .filter((o) => o.text && Number.isFinite(o.start) && Number.isFinite(o.end) && o.end - o.start >= 0.5 && !unbackedNumbers(o.text, source).length)
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_OVERLAYS);
  return { segments, overlays, summary: typeof raw.resumen === "string" ? raw.resumen.trim().slice(0, 200) : "" };
}

// Textos en pantalla del guion de un Reel: "3-10 s · ... Texto en pantalla: "..."".
export function scriptOverlays(body: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*s\s*·\s*(.*)$/);
    if (!m) continue;
    const [a, b] = [Number(m[1].replace(",", ".")), Number(m[2].replace(",", "."))];
    const rest = m[3];
    const quoted = rest.match(/Texto en pantalla:\s*["“]([^"”]+)["”]/i)?.[1] ?? rest.match(/^Cierre[^:]*:\s*["“]([^"”]+)["”]/i)?.[1];
    const hook = rest.match(/^Gancho:\s*(.+)$/i)?.[1];
    const text = (quoted ?? hook ?? "").trim();
    if (text && b > a) out.push({ start: a, end: b, text });
  }
  return out;
}

export const INSTRUCTION_MAX = 400;

// Lo que las reglas entienden de un pedido escrito: cuánto tiene que durar, desde qué segundo arrancar y si va sin textos.
export function readInstruction(text: string): { seconds?: number; startAt?: number; noText?: boolean } {
  const t = text.toLowerCase();
  const num = (m: RegExpMatchArray | null) => (m ? Number(m[1].replace(",", ".")) : undefined);
  const start = t.match(/(?:arranc[a-zá]*|empez[a-zá]*|desde)\s+(?:en\s+|desde\s+)?(?:el\s+)?(?:segundo\s+)?(\d+(?:[.,]\d+)?)(?:\s*(?:s\b|seg\w*))?/);
  const startAt = num(start);
  const rest = start ? t.replace(start[0], " ") : t; // "arrancá en 5 s" es desde dónde, no cuánto dura
  const seconds = num(rest.match(/(?:dure|dura|de|en|m[aá]ximo|hasta)\s+(\d+(?:[.,]\d+)?)\s*(?:s\b|seg)/)) ?? num(rest.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:s\b|seg)/));
  const noText = /sin\s+(?:ning[uú]n\s+)?textos?\b|sin\s+letras|sin\s+leyendas/.test(t);
  return { ...(seconds ? { seconds } : {}), ...(startAt !== undefined ? { startAt } : {}), ...(noText ? { noText } : {}) };
}

// Plan sin IA: el principio del video hasta el largo ideal, con el gancho al empezar y el llamado al final.
// Si la pieza es un guion de Reel, usa sus textos en pantalla con sus tiempos. Del pedido escrito toma el largo,
// desde dónde arrancar y "sin textos".
export function rulePlan(duration: number, format: Format, piece: { body: string; hook: string; cta: string }, source: string, instruction = ""): VideoPlan {
  const { ideal, max } = targetLength(format);
  const ask = readInstruction(instruction);
  const from = round1(Math.min(Math.max(0, ask.startAt ?? 0), Math.max(0, duration - 1)));
  const len = round1(Math.min(duration - from, Math.min(max, ask.seconds ?? ideal)));
  const fromScript = scriptOverlays(piece.body);
  const hook = (piece.hook || fromScript[0]?.text || piece.body.split("\n").find((l) => l.trim()) || "").replace(/^(Texto|Gancho):\s*/i, "").trim();
  const cta = piece.cta.trim();
  const ending = cta && len > 6 ? [{ inicio: len - 3, fin: len, texto: cta, posicion: "abajo" }] : [];
  const textos = fromScript.length
    ? [
        ...fromScript.map((o) => ({ inicio: o.start, fin: Math.min(o.end, len), texto: o.text, posicion: "abajo" })),
        // Si el guion no cierra con un texto, el llamado a la acción va al final.
        ...(fromScript.some((o) => o.end > len - 3 && o.start < len) ? [] : ending),
      ]
    : [
        ...(hook ? [{ inicio: 0, fin: Math.min(3, len), texto: hook, posicion: "arriba" }] : []),
        ...ending,
      ];
  const plan = validatePlan({ tramos: [{ start: from, end: from + len }], textos: ask.noText ? [] : textos }, duration, format, source);
  const what = from > 0 ? `Dejé ${fmtSec(len)} desde el segundo ${fmtSec(from).replace(" s", "")}` : len < duration ? `Dejé los primeros ${fmtSec(len)}` : "Dejé el video entero";
  return { ...plan, summary: `${what}${ask.noText ? ", sin textos" : " y sumé el gancho y el llamado a la acción"}.` };
}

export function fmtSec(s: number) {
  return `${String(round1(s)).replace(".", ",")} s`;
}

// "Stream #0:1(und): Audio: aac ..." en lo que imprime ffmpeg al leer el archivo.
export function hasAudio(ffmpegLog: string) {
  return /Stream #\d+:\d+.*: Audio:/.test(ffmpegLog);
}

const Y: Record<Position, string> = { arriba: "h*0.12", centro: "(h-text_h)/2", abajo: "h*0.78-text_h" };

// Argumentos para ffmpeg: corta los tramos, los junta, lleva a vertical 720×1280, escribe los textos (cada uno sale de
// su archivo /t<n>.txt, así no hay que escapar nada) y, si hay logo, lo pone arriba a la derecha.
export function ffmpegArgs(plan: VideoPlan, opts: { audio: boolean; logo: boolean; font: string; input?: string; output?: string }): string[] {
  const input = opts.input ?? "in.mp4";
  const n = plan.segments.length;
  const parts: string[] = [];
  plan.segments.forEach((s, i) => {
    parts.push(`[0:v]trim=start=${s.start}:end=${s.end},setpts=PTS-STARTPTS[v${i}]`);
    if (opts.audio) parts.push(`[0:a]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[a${i}]`);
  });
  const ins = plan.segments.map((_, i) => (opts.audio ? `[v${i}][a${i}]` : `[v${i}]`)).join("");
  parts.push(`${ins}concat=n=${n}:v=1:a=${opts.audio ? 1 : 0}${opts.audio ? "[vc][ac]" : "[vc]"}`);
  parts.push(`[vc]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},setsar=1,fps=30[s0]`);
  let last = "s0";
  plan.overlays.forEach((o, i) => {
    const next = `t${i}`;
    parts.push(
      `[${last}]drawtext=fontfile=${opts.font}:textfile=/t${i}.txt:enable='between(t,${o.start},${o.end})':x=(w-text_w)/2:y=${Y[o.position]}` +
        `:expansion=none:fontsize=46:line_spacing=10:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=18[${next}]`,
    );
    last = next;
  });
  if (opts.logo) {
    parts.push(`[1:v]scale=110:-1[lg]`);
    parts.push(`[${last}][lg]overlay=W-w-28:28[lo]`);
    last = "lo";
  }
  return [
    "-i", input,
    ...(opts.logo ? ["-i", "logo"] : []),
    "-filter_complex", parts.join(";"),
    "-map", `[${last}]`,
    ...(opts.audio ? ["-map", "[ac]", "-c:a", "aac", "-b:a", "128k"] : []),
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    opts.output ?? "out.mp4",
  ];
}

// Archivos de texto para cada leyenda, ya cortados en líneas.
export function overlayFiles(plan: VideoPlan): { name: string; text: string }[] {
  return plan.overlays.map((o, i) => ({ name: `/t${i}.txt`, text: wrap(o.text) }));
}
