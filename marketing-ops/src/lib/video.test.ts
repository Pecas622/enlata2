import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AiUnavailable } from "./generator-ai";
import { ffmpegArgs, frameTimes, hasAudio, overlayFiles, planLength, readInstruction, rulePlan, scriptOverlays, targetLength, validatePlan, wrap } from "./video";
import { planWithClaude, videoUserPrompt, type VideoPiece } from "./video-ai";

const src = "Medialunas recién salidas. Con masa madre. Pedí por WhatsApp.";

describe("plan de edición", () => {
  it("los tramos quedan dentro del video, en orden, sin pisarse y sin pasarse del largo del formato", () => {
    const p = validatePlan({ tramos: [{ inicio: 50, fin: 70 }, { inicio: -2, fin: 6 }, { inicio: 4, fin: 12 }, { inicio: 20, fin: 20.5 }, { inicio: 30, fin: 999 }] }, 60, "Reel", src);
    expect(p.segments).toEqual([{ start: 0, end: 6 }, { start: 6, end: 12 }, { start: 30, end: 48 }]);
    expect(planLength(p)).toBe(30);
    const story = validatePlan({ tramos: [{ start: 0, end: 40 }] }, 40, "Historia", src);
    expect(planLength(story)).toBe(targetLength("Historia").max);
  });

  it("los textos van dentro del video editado, cortos y sin números inventados", () => {
    const p = validatePlan({
      tramos: [{ inicio: 0, fin: 10 }],
      textos: [
        { inicio: 7, fin: 30, texto: "Pedí por WhatsApp", posicion: "abajo" },
        { inicio: 0, fin: 3, texto: "Medialunas recién salidas", posicion: "arriba" },
        { inicio: 3, fin: 6, texto: "Hoy 30% off", posicion: "centro" },
        { inicio: 4, fin: 4.2, texto: "Muy corto", posicion: "centro" },
        { inicio: 5, fin: 7, texto: "x".repeat(200), posicion: "costado" },
      ],
    }, 20, "Reel", src);
    expect(p.overlays.map((o) => [o.text.slice(0, 20), o.start, o.end, o.position])).toEqual([
      ["Medialunas recién sa", 0, 3, "arriba"],
      ["xxxxxxxxxxxxxxxxxxxx", 5, 7, "abajo"],
      ["Pedí por WhatsApp", 7, 10, "abajo"],
    ]);
    expect(p.overlays[1].text).toHaveLength(70);
  });

  it("reglas: con el guion del Reel usa sus textos y tiempos", () => {
    const body = "0-3 s · Gancho: Medialunas recién salidas\n3-10 s · Mostrá el horno. Texto en pantalla: \"Con masa madre\"\n10-20 s · Mostrá el lugar.\n\nTexto del posteo: Pedí por WhatsApp.";
    expect(scriptOverlays(body)).toEqual([{ start: 0, end: 3, text: "Medialunas recién salidas" }, { start: 3, end: 10, text: "Con masa madre" }]);
    const p = rulePlan(8, "Reel", { body, hook: "", cta: "Pedí por WhatsApp" }, src);
    expect(p.segments).toEqual([{ start: 0, end: 8 }]);
    expect(p.overlays.map((o) => [o.text, o.start, o.end])).toEqual([["Medialunas recién salidas", 0, 3], ["Con masa madre", 3, 8]]);
    expect(p.summary).toContain("entero");
    // Un cierre entre comillas también va; si el guion no cierra con texto, va el llamado a la acción.
    expect(scriptOverlays("10-14 s · Cierre con La Espiga: \"Pedí por WhatsApp\"")).toEqual([{ start: 10, end: 14, text: "Pedí por WhatsApp" }]);
    const long = rulePlan(14, "Reel", { body: "0-3 s · Gancho: Medialunas recién salidas", hook: "", cta: "Pedí por WhatsApp" }, src);
    expect(long.overlays.map((o) => [o.text, o.start, o.end])).toEqual([["Medialunas recién salidas", 0, 3], ["Pedí por WhatsApp", 11, 14]]);
  });

  it("reglas: sin guion, el gancho arriba al empezar y el llamado abajo al final", () => {
    const p = rulePlan(60, "Post", { body: "Medialunas recién salidas.\n\nPedí por WhatsApp.", hook: "", cta: "Pedí por WhatsApp" }, src);
    expect(p.segments).toEqual([{ start: 0, end: 20 }]);
    expect(p.overlays).toEqual([
      { start: 0, end: 3, text: "Medialunas recién salidas.", position: "arriba" },
      { start: 17, end: 20, text: "Pedí por WhatsApp", position: "abajo" },
    ]);
    expect(p.summary).toContain("primeros 20 s");
  });

  it("reglas: del pedido escrito toman cuánto dura, desde dónde arranca y si va sin textos", () => {
    expect(readInstruction("que dure 15 segundos")).toEqual({ seconds: 15 });
    expect(readInstruction("Arrancá en el segundo 5")).toEqual({ startAt: 5 });
    expect(readInstruction("arrancá en 4 s y que dure 10 seg, sin textos")).toEqual({ startAt: 4, seconds: 10, noText: true });
    expect(readInstruction("más dinámico, con el horno primero")).toEqual({});
    const piece = { body: "Medialunas recién salidas.", hook: "", cta: "Pedí por WhatsApp" };
    const p = rulePlan(60, "Reel", piece, src, "desde el segundo 8, que dure 12 segundos");
    expect(p.segments).toEqual([{ start: 8, end: 20 }]);
    expect(p.overlays.map((o) => [o.text, o.start, o.end])).toEqual([["Medialunas recién salidas.", 0, 3], ["Pedí por WhatsApp", 9, 12]]);
    expect(p.summary).toBe("Dejé 12 s desde el segundo 8 y sumé el gancho y el llamado a la acción.");
    const bare = rulePlan(60, "Historia", piece, src, "que dure 90 segundos, sin textos");
    expect(bare.segments).toEqual([{ start: 0, end: 15 }]); // nunca más que el máximo del formato
    expect(bare.overlays).toEqual([]);
    expect(bare.summary).toBe("Dejé los primeros 15 s, sin textos.");
  });

  it("fotogramas repartidos y sin pasarse del video", () => {
    expect(frameTimes(24)).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]);
    expect(frameTimes(3)).toEqual([0.8, 2.3]);
    expect(frameTimes(0)).toEqual([]);
  });
});

describe("comando del motor de video", () => {
  const plan = { segments: [{ start: 1, end: 4 }, { start: 6, end: 9 }], overlays: [{ start: 0, end: 3, text: "Medialunas recién salidas del horno de La Espiga", position: "arriba" as const }], summary: "" };

  it("corta, junta, pasa a vertical, escribe los textos y pone el logo", () => {
    const args = ffmpegArgs(plan, { audio: true, logo: true, font: "/font.ttf" });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("[0:v]trim=start=1:end=4,setpts=PTS-STARTPTS[v0]");
    expect(fc).toContain("[0:a]atrim=start=6:end=9,asetpts=PTS-STARTPTS[a1]");
    expect(fc).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[vc][ac]");
    expect(fc).toContain("crop=720:1280");
    expect(fc).toContain("textfile=/t0.txt:enable='between(t,0,3)'");
    expect(fc).toContain("expansion=none");
    expect(fc).toContain("[t0][lg]overlay=W-w-28:28[lo]");
    expect(args).toEqual(expect.arrayContaining(["-i", "logo", "-map", "[lo]", "-map", "[ac]", "libx264"]));
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("sin audio no toca el sonido", () => {
    const args = ffmpegArgs({ ...plan, overlays: [] }, { audio: false, logo: false, font: "/font.ttf" });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).not.toContain("atrim");
    expect(fc).toContain("[v0][v1]concat=n=2:v=1:a=0[vc]");
    expect(args).toContain("[s0]");
    expect(args).not.toContain("-c:a");
  });

  it("textos en líneas cortas y detección de audio", () => {
    expect(wrap("Medialunas recién salidas del horno de La Espiga")).toBe("Medialunas recién\nsalidas del horno de\nLa Espiga");
    expect(overlayFiles(plan)).toEqual([{ name: "/t0.txt", text: "Medialunas recién\nsalidas del horno de\nLa Espiga" }]);
    expect(hasAudio("  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz")).toBe(true);
    expect(hasAudio("  Stream #0:0[0x1](und): Video: h264")).toBe(false);
  });
});

describe("plan con IA", () => {
  const piece: VideoPiece = { channel: "Instagram", format: "Reel", goal: "Vender", body: "Medialunas recién salidas.", hook: "Medialunas recién salidas", cta: "Pedí por WhatsApp", brand: "La Espiga", wordsAvoid: "barato" };
  const fake = (json: unknown) => {
    const calls: unknown[] = [];
    const client = { beta: { messages: { create: async (req: unknown) => { calls.push(req); return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }] }; } } } } as unknown as Anthropic;
    return { client, calls };
  };

  it("manda los fotogramas con su momento y controla la respuesta", async () => {
    const { client, calls } = fake({ tramos: [{ inicio: 2, fin: 9 }], textos: [{ inicio: 0, fin: 2, texto: "Medialunas recién salidas", posicion: "arriba" }, { inicio: 3, fin: 5, texto: "2x1 hoy", posicion: "abajo" }], resumen: "Arranqué en el horno." });
    const plan = await planWithClaude(piece, 12, [{ t: 1, data: "AAAA" }, { t: 6, data: "BBBB" }], src, client);
    expect(plan).toEqual({ segments: [{ start: 2, end: 9 }], overlays: [{ start: 0, end: 2, text: "Medialunas recién salidas", position: "arriba" }], summary: "Arranqué en el horno." });
    const content = (calls[0] as { messages: { content: { type: string; text?: string }[] }[] }).messages[0].content;
    expect(content.filter((b) => b.type === "image")).toHaveLength(2);
    expect(content[0]).toEqual({ type: "text", text: "Segundo 1.0:" });
  });

  it("sin tramos válidos, falla para que usen las reglas", async () => {
    await expect(planWithClaude(piece, 12, [], src, fake({ tramos: [{ inicio: 20, fin: 30 }], textos: [], resumen: "" }).client)).rejects.toThrow(AiUnavailable);
  });

  it("el pedido dice cuánto tiene que durar", () => {
    expect(videoUserPrompt({ ...piece, format: "Historia" }, 40)).toContain("entre 3 y 15 s");
  });

  it("con pedido y edición anterior, los manda para cambiar solo lo pedido", async () => {
    const previous = { segments: [{ start: 0, end: 10 }], overlays: [{ start: 0, end: 3, text: "Medialunas recién salidas", position: "arriba" as const }], summary: "" };
    const prompt = videoUserPrompt({ ...piece, instruction: "poné \"Abrimos 7 am\" al final", previous }, 20);
    expect(prompt).toContain('Pedido de la persona: poné "Abrimos 7 am" al final');
    expect(prompt).toContain('Edición anterior (JSON, tiempos en segundos):\n{"tramos":[{"start":0,"end":10}]');
    expect(videoUserPrompt(piece, 20)).not.toContain("Pedido de la persona");
    // El número del pedido es de la persona: pasa el control.
    const { client } = fake({ tramos: [{ inicio: 0, fin: 10 }], textos: [{ inicio: 7, fin: 10, texto: "Abrimos 7 am", posicion: "abajo" }], resumen: "Sumé el horario." });
    const plan = await planWithClaude({ ...piece, instruction: "poné \"Abrimos 7 am\" al final" }, 20, [], src + " poné \"Abrimos 7 am\" al final", client);
    expect(plan.overlays.map((o) => o.text)).toEqual(["Abrimos 7 am"]);
  });
});
