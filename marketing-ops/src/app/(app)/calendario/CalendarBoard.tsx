"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { WEEKDAYS, longDate, shortDate, type CalView, type GridDay } from "@/lib/calendar";
import { formatLabel, type Channel, type Format } from "@/lib/channels";
import { statusTone, type Status } from "@/lib/workflow";
import { PieceActions } from "../contenidos/[id]/PieceActions";
import { reschedule } from "./actions";

export type CalPiece = { id: string; title: string; channel: Channel; format: Format; status: Status; publish_on: string | null; time: string; brand: string; color: string; hook: string };
type Week = { start: string; count: number; target: number; short: boolean };

export function CalendarBoard({ view, month, today, weeks, days, pieces: initial, dates, load, canMove, planHref, dayHref, back, filtered }: {
  view: CalView; month: string; today: string; weeks: GridDay[][]; days: string[]; pieces: CalPiece[]; dates: { day: string; name: string }[]; load: Week[];
  canMove: boolean; planHref?: string; dayHref: Record<string, string>; back: string; filtered: boolean;
}) {
  const [pieces, setPieces] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setPieces(initial);
  }

  const movable = (p: CalPiece) => canMove && p.status !== "Publicado";
  // Las que tienen horario primero, en orden; después las que no.
  const onDay = (day: string) => pieces.filter((p) => p.publish_on === day).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const unscheduled = pieces.filter((p) => !p.publish_on && p.status !== "Publicado");
  const inMonth = pieces.filter((p) => p.publish_on?.startsWith(month));
  const inRange = view === "mes" ? inMonth : pieces.filter((p) => p.publish_on && days.includes(p.publish_on));
  const monthDates = dates.filter((d) => d.day.startsWith(month));

  function move(id: string, day: string | null) {
    const before = pieces;
    const piece = pieces.find((p) => p.id === id);
    if (!piece || piece.publish_on === day) return;
    setError("");
    setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, publish_on: day } : p)));
    start(async () => {
      const r = await reschedule(id, day);
      if (r.error) {
        setPieces(before);
        setError(r.error);
      }
    });
  }

  function drop(day: string) {
    if (dragging) move(dragging, day);
    setDragging(null);
    setOver(null);
  }

  const dropZone = (day: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragging) { e.preventDefault(); setOver(day); } },
    onDragLeave: () => setOver((o) => (o === day ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); drop(day); },
  });

  const chip = (p: CalPiece) => (
    <Link
      key={p.id}
      href={`/contenidos/${p.id}`}
      className={`cal-piece st-${statusTone(p.status)}${dragging === p.id ? " dragging" : ""}`}
      style={{ borderLeftColor: p.color }}
      draggable={movable(p)}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); e.dataTransfer.effectAllowed = "move"; setDragging(p.id); }}
      onDragEnd={() => { setDragging(null); setOver(null); }}
      title={`${p.title} · ${p.brand} · ${p.channel} ${formatLabel(p.format, p.channel)} · ${p.status}`}
      data-testid="cal-piece"
      data-status={p.status}
    >
      <b>{p.title}</b>
      <small>{p.time ? `${p.time} · ` : ""}{p.channel} · {formatLabel(p.format, p.channel)}</small>
    </Link>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="cal-legend" aria-label="Referencias">
        <span><i className="legend-swatch idea" /> Idea</span>
        <span><span className="dot" style={{ background: "var(--amber)", width: 7, height: 7 }} /> En revisión</span>
        <span><span className="dot" style={{ background: "var(--accent)", width: 7, height: 7 }} /> Aprobada</span>
        <span><span className="dot" style={{ background: "var(--success)", width: 7, height: 7 }} /> Publicada</span>
        <span>El borde de color es la marca.</span>
      </div>
      {view === "semana" && (
        <div className="card cal-weekview" aria-busy={pending} data-testid="calendar">
          {days.map((day, i) => {
            const cd = dates.find((d) => d.day === day);
            return (
              <div key={day} className={`cal-day tall${day < today ? " past" : ""}${day === today ? " today" : ""}${over === day ? " over" : ""}`} {...dropZone(day)} data-testid={`cal-day-${day}`}>
                <Link className="cal-dayhead" href={dayHref[day]} data-testid="cal-dayhead">
                  <span>{WEEKDAYS[i]}</span><span className="cal-num">{Number(day.slice(8, 10))}</span>
                </Link>
                {cd && <div className="cal-date" data-testid="cal-date">{cd.name}</div>}
                {onDay(day).map(chip)}
                {onDay(day).length === 0 && <span className="cal-empty">Sin piezas</span>}
              </div>
            );
          })}
        </div>
      )}

      {view === "dia" && (
        <div className="card stack" aria-busy={pending} data-testid="calendar">
          {dates.find((d) => d.day === days[0]) && <div className="cal-date">{dates.find((d) => d.day === days[0])!.name}</div>}
          {onDay(days[0]).length === 0 ? (
            <div className="empty" data-testid="cal-day-empty">
              No hay piezas {filtered ? "con estos filtros " : ""}para este día.{planHref && !filtered && days[0] >= today && <> <Link href={planHref}>Armá el plan del mes</Link></>}
            </div>
          ) : (
            onDay(days[0]).map((p) => (
              <div key={p.id} className="day-piece" style={{ borderLeftColor: p.color }} data-testid="day-piece" data-status={p.status}>
                <div className="day-piece-head">
                  <span className="day-time">{p.time || "Sin horario"}</span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <Link href={`/contenidos/${p.id}`}><b>{p.title}</b></Link>
                    <div className="sub">{p.brand} · {p.channel} · {formatLabel(p.format, p.channel)}</div>
                  </div>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </div>
                {p.hook && <p className="plan-why"><b>Gancho:</b> {p.hook}</p>}
                {canMove && (
                  <PieceActions id={p.id} channel={p.channel} format={p.format} canRegen={p.status === "Borrador" || p.status === "Aprobado"} canDelete={p.status !== "Publicado"} back={back} compact />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {view === "mes" && <div className="card cal" aria-busy={pending} data-testid="calendar">
        <div className="cal-head">{WEEKDAYS.map((d) => <div key={d}>{d}</div>)}</div>
        {weeks.map((week, wi) => {
          const w = load[wi];
          return (
            <div key={week[0].day}>
              <div className="cal-week">
                {week.map(({ day, inMonth: inside }) => {
                  const cd = dates.find((d) => d.day === day);
                  const past = day < today;
                  return (
                    <div
                      key={day}
                      className={`cal-day${inside ? "" : " out"}${past ? " past" : ""}${day === today ? " today" : ""}${over === day ? " over" : ""}`}
                      {...dropZone(day)}
                      data-testid={`cal-day-${day}`}
                    >
                      <Link className="cal-num" href={dayHref[day]} aria-label={`Ver ${longDate(day)}`}>{Number(day.slice(8, 10))}</Link>
                      {cd && <div className="cal-date" data-testid="cal-date">{cd.name}</div>}
                      {onDay(day).map(chip)}
                    </div>
                  );
                })}
              </div>
              {w?.short && (
                <div className="cal-gap" data-testid="cal-gap">
                  Semana del {shortDate(w.start)}: {w.count === 0 ? "sin piezas" : `${w.count} de ${w.target} piezas`}.
                  {planHref && <> <Link href={planHref}>Completala con el plan del mes</Link></>}
                </div>
              )}
            </div>
          );
        })}
      </div>}

      {/* En el celular, la grilla del mes se cambia por una agenda. */}
      {view === "mes" && <div className="card cal-agenda" data-testid="agenda">
        {inMonth.length === 0 && monthDates.length === 0 ? (
          <div className="empty">No hay piezas programadas este mes.</div>
        ) : (
          [...new Set([...inMonth.map((p) => p.publish_on!), ...monthDates.map((d) => d.day)])].sort().map((day) => (
            <div key={day} className={`agenda-day${day === today ? " today" : ""}`}>
              <div className="agenda-label">{longDate(day)}{dates.find((d) => d.day === day) && <span className="cal-date">{dates.find((d) => d.day === day)!.name}</span>}</div>
              {onDay(day).map(chip)}
            </div>
          ))
        )}
        {load.filter((w) => w.short).map((w) => (
          <div key={w.start} className="cal-gap">Semana del {shortDate(w.start)}: {w.count === 0 ? "sin piezas" : `${w.count} de ${w.target} piezas`}.</div>
        ))}
      </div>}

      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Sin fecha</h2>
          {unscheduled.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Todas las piezas tienen día.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }} data-testid="unscheduled">
              {unscheduled.map((p) => (
                <div key={p.id} className="unsched">
                  {chip(p)}
                  {movable(p) && (
                    <input
                      type="date"
                      className="input"
                      min={today}
                      aria-label={`Programar ${p.title}`}
                      onChange={(e) => e.target.value && move(p.id, e.target.value)}
                      data-testid="unscheduled-date"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="card-title">{view === "mes" ? "Este mes" : view === "semana" ? "Esta semana" : "Este día"}{filtered ? " (con filtros)" : ""}</h2>
          <div className="facts" style={{ margin: 0 }}>
            <span>Programadas</span><b data-testid="cal-count">{inRange.length}</b>
            <span>Aprobadas o publicadas</span><b>{inRange.filter((p) => p.status === "Aprobado" || p.status === "Publicado").length}</b>
            <span>Falta escribir o aprobar</span><b>{inRange.filter((p) => p.status === "Idea" || p.status === "Borrador" || p.status === "En revisión").length}</b>
            <span>Fechas comerciales</span><b>{monthDates.length ? monthDates.map((d) => `${d.name} (${shortDate(d.day)})`).join(", ") : "Ninguna"}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
