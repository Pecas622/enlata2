// Circuito de aprobación de una pieza. La misma regla vive en la base (can_move en la migración base).
import type { Role } from "./roles";

export const STATUSES = ["Idea", "Borrador", "En revisión", "Aprobado", "Publicado"] as const;
export type Status = (typeof STATUSES)[number];

export function canMove(from: Status, to: Status, role: Role): boolean {
  const creates = role === "Administrador" || role === "Creador";
  const reviews = role === "Administrador" || role === "Revisor";
  if ((from === "Idea" || from === "Borrador") && to === "En revisión") return creates;
  if (from === "En revisión" && (to === "Aprobado" || to === "Borrador")) return reviews;
  if (from === "Aprobado" && (to === "Publicado" || to === "Borrador")) return creates;
  return false;
}

export type Action = { to: Status; label: string; tone: "primary" | "secondary"; needsNote?: boolean };

// Botones que ve cada rol según el estado actual, en el orden en que se muestran.
export function actionsFor(status: Status, role: Role): Action[] {
  const all: Record<Status, Action[]> = {
    Idea: [{ to: "En revisión", label: "Mandar a revisión", tone: "primary" }],
    Borrador: [{ to: "En revisión", label: "Mandar a revisión", tone: "primary" }],
    "En revisión": [
      { to: "Aprobado", label: "Aprobar", tone: "primary" },
      { to: "Borrador", label: "Pedir cambios", tone: "secondary", needsNote: true },
    ],
    Aprobado: [
      { to: "Publicado", label: "Marcar como publicada", tone: "primary" },
      { to: "Borrador", label: "Volver a borrador", tone: "secondary" },
    ],
    Publicado: [],
  };
  return all[status].filter((a) => canMove(status, a.to, role));
}

// Solo se edita lo que no está publicado, y solo si el rol crea. Editar algo aprobado lo devuelve a borrador.
export function canEdit(status: Status, role: Role): boolean {
  return status !== "Publicado" && (role === "Administrador" || role === "Creador");
}

export function statusTone(status: Status): "gray" | "neutral" | "amber" | "blue" | "green" {
  return status === "Idea" ? "gray" : status === "Borrador" ? "neutral" : status === "En revisión" ? "amber" : status === "Aprobado" ? "blue" : "green";
}
