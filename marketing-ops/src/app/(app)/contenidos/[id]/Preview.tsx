import type { Channel, Format } from "@/lib/channels";

// Vista previa aproximada de cómo se ve la pieza en la red. La imagen es un placeholder con el color de la marca.
export function Preview({ channel, format, brand, color, instagram, title, body, hashtags }: {
  channel: Channel; format: Format; brand: string; color: string; instagram: string; title: string; body: string; hashtags: string;
}) {
  const initial = brand.trim()[0]?.toUpperCase() ?? "?";
  if (channel === "WhatsApp" && format === "Mensaje") {
    return (
      <div className="preview wa" data-testid="preview">
        <div className="preview-head" style={{ background: "#075E54", color: "#fff" }}>
          <span className="avatar" style={{ background: color }}>{initial}</span>
          <div>{brand}<small style={{ color: "#cfe" }}>Lista de difusión</small></div>
        </div>
        <div className="bubble">{body || "Sin texto todavía."}</div>
      </div>
    );
  }
  if (channel === "Email") {
    const subject = body.match(/Asunto:\s*(.*)/i)?.[1] ?? title;
    const rest = body.replace(/^Asunto:.*\n?/i, "").trim();
    return (
      <div className="preview" data-testid="preview">
        <div className="preview-head" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="avatar" style={{ background: color }}>{initial}</span>
          <div>{subject || "Sin asunto"}<small>{brand}</small></div>
        </div>
        <div className="preview-body">{rest || "Sin texto todavía."}</div>
      </div>
    );
  }
  const tall = format === "Reel" || format === "Historia";
  const caption = body.match(/Texto del posteo:\s*([\s\S]*)/i)?.[1] ?? body;
  const handle = instagram.replace(/^@/, "") || brand.toLowerCase().replace(/\s+/g, "");
  return (
    <div className="preview" data-testid="preview">
      <div className="preview-head">
        <span className="avatar" style={{ background: color }}>{initial}</span>
        <div>{handle}<small>{channel} · {format}</small></div>
      </div>
      <div className={`preview-media${tall ? " tall" : ""}`} style={{ background: color }}>{title || brand}</div>
      <div className="preview-body"><b>{handle}</b>{caption || "Sin texto todavía."}{hashtags && <><br /><span style={{ color: "#00376B" }}>{hashtags}</span></>}</div>
    </div>
  );
}
