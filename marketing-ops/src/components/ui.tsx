import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title" data-testid="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </div>
  );
}

type Tone = "neutral" | "green" | "red" | "amber" | "blue" | "gray";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Notice({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "red" | "blue" }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export function statusTone(status: string): Tone {
  return status === "Disponible" ? "green" : status === "Vendido" ? "gray" : status === "Retirado" ? "red" : "amber";
}
