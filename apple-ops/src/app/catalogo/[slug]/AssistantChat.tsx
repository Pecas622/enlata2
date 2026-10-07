"use client";

import { useEffect, useRef, useState } from "react";
import { DeviceArt } from "@/components/DeviceArt";
import { chipText, defaultGreeting, emptyState, handoffSummary, START_CHIPS, type BotMsg, type ChatState } from "@/lib/assistant";
import { deviceShort } from "@/lib/catalog";
import { fmtUSD } from "@/lib/money";
import type { PublicConfig, PublicDevice } from "@/lib/public-catalog";

type Msg = ({ role: "bot" } & BotMsg) | { role: "user"; text: string };
const FALLBACK: BotMsg = { text: "Ahora no puedo responder. Escribinos por WhatsApp y te atiende una persona del equipo.", handoff: true };

function ChatIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export function AssistantChat({ cfg, devices, hasWa, waHref, onOpenDevice }: {
  cfg: PublicConfig;
  devices: PublicDevice[];
  hasWa: boolean;
  waHref: (text: string, item?: string, label?: string) => string;
  onOpenDevice: (d: PublicDevice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [st, setSt] = useState<ChatState>(emptyState);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [sid] = useState(() => crypto.randomUUID());
  const endRef = useRef<HTMLDivElement>(null);
  const name = cfg.assistant_name || "Asistente";

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs([{ role: "bot", text: cfg.greeting || defaultGreeting(cfg.store_name), chips: START_CHIPS }]);
  }, [open, msgs.length, cfg.greeting, cfg.store_name]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, typing, open]);

  const send = async (raw?: string) => {
    const input = (raw ?? text).trim();
    if (!input || typing) return;
    setText("");
    const history: Msg[] = [...msgs, { role: "user", text: input }];
    setMsgs(history);
    setTyping(true);
    let reply: BotMsg[] = [FALLBACK];
    let next = st;
    try {
      const res = await fetch(`/catalogo/${cfg.slug}/asistente`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sid, state: st, messages: history.map((m) => ({ role: m.role, text: m.text, cards: m.role === "bot" ? m.cards?.map((c) => c.id) : undefined })) }),
      });
      if (res.ok) {
        const j = (await res.json()) as { msgs: BotMsg[]; state: ChatState };
        if (j.msgs?.length) { reply = j.msgs; next = j.state; }
      }
    } catch {
      // sin conexión: queda el mensaje de respaldo con WhatsApp
    }
    setTyping(false);
    setSt(next);
    setMsgs([...history, ...reply.map((m) => ({ role: "bot" as const, ...m }))]);
  };

  const lastBot = [...msgs].reverse().find((m) => m.role === "bot");
  const showChips = !typing && lastBot && msgs[msgs.length - 1] === lastBot && lastBot.chips?.length;

  return (
    <>
      {!open && (
        <button className="pc-chat-fab" onClick={() => setOpen(true)} data-testid="chat-open">
          <ChatIcon />Preguntanos
        </button>
      )}
      {open && (
        <div className="pc-chat" role="dialog" aria-label={name} data-testid="chat-panel">
          <div className="pc-chat-head">
            <div>
              <div className="pc-chat-name">{name}</div>
              <div className="pc-chat-live">● Responde al instante</div>
            </div>
            <button className="pc-close" onClick={() => setOpen(false)} aria-label="Cerrar chat" data-testid="chat-close">×</button>
          </div>
          <div className="pc-chat-body">
            {msgs.map((m, i) => (
              <div key={i} className="pc-chat-group">
                <div className={`pc-bubble ${m.role === "user" ? "me" : "bot"}`} data-testid={m.role === "bot" ? "chat-bot-msg" : "chat-user-msg"}>{m.text}</div>
                {m.role === "bot" && m.cards?.map((c) => {
                  const d = devices.find((x) => x.id === c.id);
                  if (!d) return null;
                  return (
                    <div key={c.id} className="pc-chat-card" data-testid="chat-card">
                      <div className="pc-chat-art"><DeviceArt kind={d.kind} color={d.color} photo={d.photo_path} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pc-chat-card-name">{deviceShort(d)}</div>
                        <div className="pc-sub">{d.condition}{d.battery && d.condition !== "Nuevo sellado" ? ` · batería ${d.battery}%` : ""}</div>
                        <div className="pc-chat-card-price">{fmtUSD(d.price_usd)}</div>
                        {c.note && <div className="pc-chat-note">{c.note}</div>}
                      </div>
                      <button className="pc-chat-see" onClick={() => { setOpen(false); onOpenDevice(d); }}>Ver</button>
                    </div>
                  );
                })}
                {m.role === "bot" && m.handoff && hasWa && (
                  <a className="pc-pill pc-blue pc-chat-wa" href={waHref(handoffSummary(st), undefined, "Chat del asistente")} target="_blank" rel="noreferrer" data-testid="chat-handoff">
                    Continuar por WhatsApp
                  </a>
                )}
                {m.role === "bot" && m.handoff && !hasWa && cfg.phone && <div className="pc-sub">Llamanos o escribinos al {cfg.phone}.</div>}
              </div>
            ))}
            {typing && <div className="pc-bubble bot typing" data-testid="chat-typing">escribiendo…</div>}
            {showChips && (
              <div className="pc-chat-chips">
                {lastBot.chips!.map((c) => <button key={c} className="pc-chat-chip" onClick={() => send(chipText(c))} data-testid="chat-chip">{c}</button>)}
              </div>
            )}
            <div ref={endRef} />
          </div>
          <form className="pc-chat-foot" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <div className="pc-chat-row">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí tu consulta" maxLength={500} aria-label="Tu consulta" data-testid="chat-input" />
              <button type="submit" className={text.trim() ? "on" : ""} aria-label="Enviar" data-testid="chat-send">↑</button>
            </div>
            <div className="pc-chat-legal">Asistente automático. Precios y tasaciones son orientativos y se confirman en el local.</div>
          </form>
        </div>
      )}
    </>
  );
}
