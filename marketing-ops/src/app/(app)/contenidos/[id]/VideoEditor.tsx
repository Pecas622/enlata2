"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteMedia, registerMedia } from "@/app/(app)/archivos/actions";
import { MAX_FILE_MB, MEDIA_BUCKET, fmtSize, mediaPath } from "@/lib/media";
import type { Format } from "@/lib/channels";
import { createClient } from "@/lib/supabase/browser";
import { INSTRUCTION_MAX, OVERLAY_MAX, ffmpegArgs, fmtSec, frameTimes, hasAudio, overlayFiles, planLength, validatePlan, type Position, type VideoPlan } from "@/lib/video";
import type { Frame } from "@/lib/video-ai";
import { proposeVideoPlan, type VideoProposal } from "./video-actions";

type Video = { id: string; name: string; url: string | null };
type FFmpegLike = import("@ffmpeg/ffmpeg").FFmpeg;

const FONT = "/fonts/PlusJakartaSans-ExtraBold.ttf";
let engine: Promise<FFmpegLike> | null = null;

// El motor de video (ffmpeg.wasm) se carga una sola vez, la primera vez que se usa, desde la misma app.
function loadEngine(): Promise<FFmpegLike> {
  engine ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
      wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
    });
    await ff.writeFile("/font.ttf", new Uint8Array(await (await fetch(FONT)).arrayBuffer()));
    return ff;
  })().catch((e) => { engine = null; throw e; });
  return engine;
}

async function bytes(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("No pude bajar el video.");
  return new Uint8Array(await r.arrayBuffer());
}

// Fotogramas con el reproductor del navegador; si no puede leer el archivo (un .mov raro), los saca el motor.
async function sampleFrames(data: Uint8Array, mime: string): Promise<{ duration: number; frames: Frame[] }> {
  try {
    return await sampleWithVideoTag(data, mime);
  } catch {
    return sampleWithEngine(data);
  }
}

function sampleWithVideoTag(data: Uint8Array, mime: string): Promise<{ duration: number; frames: Frame[] }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime || "video/mp4" }));
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    const done = (err?: unknown, out?: { duration: number; frames: Frame[] }) => { URL.revokeObjectURL(url); if (err || !out) reject(err ?? new Error("sin fotogramas")); else resolve(out); };
    v.onerror = () => done(new Error("el navegador no lee el video"));
    v.onloadedmetadata = async () => {
      try {
        const duration = v.duration;
        if (!(duration > 0) || !v.videoWidth) throw new Error("sin duración");
        const canvas = document.createElement("canvas");
        const w = 384;
        canvas.width = w; canvas.height = Math.round((v.videoHeight / v.videoWidth) * w);
        const ctx = canvas.getContext("2d")!;
        const frames: Frame[] = [];
        for (const t of frameTimes(duration)) {
          await new Promise<void>((ok, bad) => { v.onseeked = () => ok(); v.onerror = () => bad(new Error("no se pudo mover el video")); v.currentTime = t; });
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          frames.push({ t, data: canvas.toDataURL("image/jpeg", 0.7).split(",")[1] });
        }
        done(undefined, { duration, frames });
      } catch (e) { done(e); }
    };
  });
}

async function sampleWithEngine(data: Uint8Array): Promise<{ duration: number; frames: Frame[] }> {
  const ff = await loadEngine();
  let log = "";
  const onLog = ({ message }: { message: string }) => { log += message + "\n"; };
  ff.on("log", onLog);
  await ff.writeFile("probe.mp4", data.slice()); // el motor se queda con el buffer: se le pasa una copia
  await ff.exec(["-i", "probe.mp4"]);
  const m = log.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  const frames: Frame[] = [];
  for (const [i, t] of frameTimes(duration).entries()) {
    await ff.exec(["-ss", String(t), "-i", "probe.mp4", "-frames:v", "1", "-vf", "scale=384:-2", "-q:v", "6", `f${i}.jpg`]);
    const img = (await ff.readFile(`f${i}.jpg`)) as Uint8Array;
    frames.push({ t, data: btoa(Array.from(img, (b) => String.fromCharCode(b)).join("")) });
    await ff.deleteFile(`f${i}.jpg`);
  }
  ff.off("log", onLog);
  await ff.deleteFile("probe.mp4");
  if (!duration) throw new Error("No pude leer el video: subilo en MP4.");
  return { duration, frames };
}

async function render(data: Uint8Array, plan: VideoPlan, logo: Uint8Array | null, onProgress: (p: number) => void): Promise<Blob> {
  const ff = await loadEngine();
  let log = "";
  const onLog = ({ message }: { message: string }) => { log += message + "\n"; };
  const onProg = ({ progress }: { progress: number }) => onProgress(Math.max(0, Math.min(1, progress)));
  ff.on("log", onLog);
  try {
    await ff.writeFile("in.mp4", data.slice());
    await ff.exec(["-i", "in.mp4"]);
    const audio = hasAudio(log);
    for (const f of overlayFiles(plan)) await ff.writeFile(f.name, f.text);
    if (logo) await ff.writeFile("logo", logo);
    ff.on("progress", onProg);
    const code = await ff.exec(ffmpegArgs(plan, { audio, logo: Boolean(logo), font: "/font.ttf" }));
    if (code !== 0) throw new Error("El motor de video no pudo armar el video.");
    const out = (await ff.readFile("out.mp4")) as Uint8Array;
    await ff.deleteFile("out.mp4");
    return new Blob([out as BlobPart], { type: "video/mp4" });
  } finally {
    ff.off("log", onLog);
    ff.off("progress", onProg);
    await ff.deleteFile("in.mp4").catch(() => {});
  }
}

const POSITIONS: Position[] = ["arriba", "centro", "abajo"];

// "Editar video con IA": la IA mira el video y arma la edición (tramos y textos en pantalla); la persona la revisa,
// el navegador arma el video nuevo y queda como un archivo más de la pieza.
export function VideoEditor({ id, workspaceId, brandId, format, videos, logoUrl, oneVideo }: {
  id: string; workspaceId: string; brandId: string; format: Format; videos: Video[]; logoUrl: string | null; oneVideo: boolean;
}) {
  const router = useRouter();
  const [pick, setPick] = useState(videos[0]?.id ?? "");
  const [step, setStep] = useState<"" | "analizando" | "plan" | "armando" | "listo" | "guardando" | "guardado">("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [res, setRes] = useState<VideoProposal | null>(null);
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [duration, setDuration] = useState(0);
  const [withLogo, setWithLogo] = useState(Boolean(logoUrl));
  const [progress, setProgress] = useState(0);
  const [out, setOut] = useState<{ blob: Blob; url: string } | null>(null);
  const [instruction, setInstruction] = useState("");
  const source = useRef<Uint8Array | null>(null);
  const sampled = useRef<{ pick: string; duration: number; frames: Frame[] } | null>(null);
  const original = videos.find((v) => v.id === pick);

  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);

  // Con `previous`, la IA cambia la edición que ya está según el pedido; los fotogramas se reusan.
  async function analyze(previous?: VideoPlan) {
    if (!original?.url) return;
    const back = step === "plan" ? "plan" : "";
    setError(""); setStep("analizando"); setMsg("Mirando el video…");
    try {
      let s = sampled.current?.pick === original.id && source.current ? sampled.current : null;
      if (!s) {
        const data = await bytes(original.url);
        source.current = data;
        const mime = /\.mov$/i.test(original.name) ? "video/quicktime" : "video/mp4";
        s = { pick: original.id, ...(await sampleFrames(data, mime)) };
        sampled.current = s;
      }
      setDuration(s.duration);
      setMsg(instruction.trim() ? "Armando la edición con tu pedido…" : "Armando la edición…");
      const r = await proposeVideoPlan(id, { duration: s.duration, frames: s.frames, instruction, previous });
      if (r.error || !r.plan) throw new Error(r.error ?? "No se pudo armar la edición.");
      setRes(r); setPlan(r.plan); setStep("plan");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el video."); setStep(plan ? back : "");
    }
  }

  async function build() {
    if (!plan || !source.current) return;
    // Lo que la persona cambió se vuelve a controlar (los textos son suyos: pueden traer sus números).
    const checked = validatePlan(
      { tramos: plan.segments, textos: plan.overlays.map((o) => ({ ...o })), resumen: plan.summary },
      duration, format, plan.overlays.map((o) => o.text).join(" "),
    );
    if (!checked.segments.length) { setError("La edición no tiene ningún tramo."); return; }
    setError(""); setProgress(0); setStep("armando"); setMsg("Cargando el editor de video (la primera vez tarda un poco)…");
    try {
      const logo = withLogo && logoUrl ? await bytes(logoUrl) : null;
      setMsg("Armando el video…");
      const blob = await render(source.current, checked, logo, setProgress);
      setOut({ blob, url: URL.createObjectURL(blob) }); setStep("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el video."); setStep("plan");
    }
  }

  async function save() {
    if (!out) return;
    if (out.blob.size > MAX_FILE_MB * 1048576) { setError(`El video quedó de ${fmtSize(out.blob.size)} y el máximo es ${MAX_FILE_MB} MB: acortalo.`); return; }
    setError(""); setStep("guardando");
    const name = `${(original?.name ?? "video").replace(/\.[a-z0-9]+$/i, "")}-editado.mp4`;
    const path = mediaPath(workspaceId, brandId, name, crypto.randomUUID());
    const { error: up } = await createClient().storage.from(MEDIA_BUCKET).upload(path, out.blob, { contentType: "video/mp4", upsert: false });
    if (up) { setError(`No se pudo subir (${up.message}).`); setStep("listo"); return; }
    const r = await registerMedia({ path, name, kind: "foto", contentId: id, back: `/contenidos/${id}` });
    if (r.error) { setError(r.error); setStep("listo"); return; }
    setStep("guardado");
    router.refresh();
  }

  async function removeOriginal() {
    if (!original) return;
    const r = await deleteMedia(original.id, `/contenidos/${id}`);
    if (r.error) setError(r.error);
    else { setMsg("Listo: quedó solo el video editado."); setStep(""); setOut(null); router.refresh(); }
  }

  const setOverlay = (i: number, patch: Partial<VideoPlan["overlays"][number]>) =>
    plan && setPlan({ ...plan, overlays: plan.overlays.map((o, n) => (n === i ? { ...o, ...patch } : o)) });
  const busy = step === "analizando" || step === "armando" || step === "guardando";

  return (
    <section className="card stack" data-testid="video-editor">
      <div>
        <h2 className="card-title" style={{ marginBottom: 2 }}>Editar video con IA</h2>
        <span className="hint">La IA mira el video, elige los mejores momentos, lo deja vertical y le suma los textos de la pieza{logoUrl ? " y el logo" : ""}. Vos revisás antes de guardarlo.</span>
      </div>
      {videos.length > 1 && (
        <label className="field">
          Video
          <select className="input" value={pick} onChange={(e) => { setPick(e.target.value); setStep(""); setPlan(null); setOut(null); sampled.current = null; }} disabled={busy} data-testid="video-pick">
            {videos.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}
      {(step === "" || step === "plan" || (step === "analizando" && !plan)) && (
        <label className="field">
          Cómo lo querés (opcional)
          <textarea className="input textarea" rows={2} value={instruction} maxLength={INSTRUCTION_MAX} onChange={(e) => setInstruction(e.target.value)} disabled={busy}
            placeholder="Ej.: que dure 15 segundos, arrancá con el horno y al final poné &quot;Pedí por WhatsApp&quot;" data-testid="video-instruction" />
        </label>
      )}
      {(step === "" || (step === "analizando" && !plan)) && (
        <div>
          <button className="btn btn-primary" onClick={() => analyze()} disabled={busy || !original?.url} data-testid="video-analyze">
            {step === "analizando" ? "Mirando el video…" : "Armar la edición"}
          </button>
        </div>
      )}
      {busy && (
        <div className="stack" style={{ gap: 6 }} role="status">
          <span className="hint" data-testid="video-status">{msg}</span>
          {step === "armando" && <div className="bar" aria-label="Avance"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        </div>
      )}
      {plan && (step === "plan" || step === "armando" || step === "analizando") && (
        <div className="stack" data-testid="video-plan">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <b>Edición · {fmtSec(planLength(plan))} de {fmtSec(duration)}</b>
            <span className="hint" data-testid="video-source">{res?.source === "ia" ? "Con IA" : "Con reglas"}</span>
          </div>
          {res?.notice && <span className="hint">{res.notice}</span>}
          {plan.summary && <span className="muted" data-testid="video-summary">{plan.summary}</span>}
          <div className="hint" data-testid="video-segments">Tramos: {plan.segments.map((s) => `${fmtSec(s.start)} a ${fmtSec(s.end)}`).join(" · ")}</div>
          {plan.overlays.map((o, i) => (
            <div key={i} className="row" style={{ gap: 6, alignItems: "flex-end" }} data-testid="video-overlay">
              <label className="field">
                Texto {fmtSec(o.start)} a {fmtSec(o.end)}
                <input className="input" value={o.text} maxLength={OVERLAY_MAX} onChange={(e) => setOverlay(i, { text: e.target.value })} disabled={busy} />
              </label>
              <label className="field" style={{ flex: "0 0 110px" }}>
                Dónde
                <select className="input" value={o.position} onChange={(e) => setOverlay(i, { position: e.target.value as Position })} disabled={busy}>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select>
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlan({ ...plan, overlays: plan.overlays.filter((_, n) => n !== i) })} disabled={busy}>Sacar</button>
            </div>
          ))}
          {logoUrl && <label className="check"><input type="checkbox" checked={withLogo} onChange={(e) => setWithLogo(e.target.checked)} disabled={busy} /> Poner el logo de la marca</label>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={build} disabled={busy} data-testid="video-build">{step === "armando" ? `Armando… ${Math.round(progress * 100)}%` : "Crear el video"}</button>
            <button className="btn btn-ghost" onClick={() => analyze(instruction.trim() ? plan : undefined)} disabled={busy} data-testid="video-reask">
              {instruction.trim() ? "Cambiar con este pedido" : "Volver a armar"}
            </button>
          </div>
        </div>
      )}
      {out && (step === "listo" || step === "guardando" || step === "guardado") && (
        <div className="stack" data-testid="video-result">
          <video className="video-out" src={out.url} controls playsInline data-testid="video-out" />
          <span className="hint">{fmtSize(out.blob.size)} · vertical 720×1280</span>
          {step !== "guardado" ? (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" onClick={save} disabled={busy} data-testid="video-save">{step === "guardando" ? "Guardando…" : "Guardar en la pieza"}</button>
              <button className="btn btn-ghost" onClick={() => { setOut(null); setStep("plan"); }} disabled={busy}>Cambiar la edición</button>
            </div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <div className="ok" role="status" data-testid="video-saved">Guardado en la pieza, junto al original.</div>
              {oneVideo && original && (
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="muted">Para publicar va un solo video. ¿Borro el original?</span>
                  <button className="btn btn-sm danger-solid" onClick={removeOriginal} data-testid="video-remove-original">Sí, borrar el original</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!busy && step === "" && msg && <div className="ok" role="status">{msg}</div>}
      {error && <div className="error" role="alert" data-testid="video-error">{error}</div>}
    </section>
  );
}
