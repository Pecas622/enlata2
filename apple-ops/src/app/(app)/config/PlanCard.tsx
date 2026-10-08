import { Badge } from "@/components/ui";
import type { Prices } from "@/lib/billing";
import { BASE_INCLUDES, MODULE_INFO, MODULES, type ModuleId } from "@/lib/modules";
import { fmtARS } from "@/lib/money";
import { PayButton } from "@/app/plan/PayButton";

// Qué incluye el plan del local y, con el cobro online configurado, el botón para sumar cada módulo.
// Un módulo se prende solo cuando Mercado Pago confirma la suscripción.
export function PlanCard({ modules, prices, canBuy, pending, paid }: {
  modules: ModuleId[]; prices: Prices | null; canBuy: boolean; pending: string[]; paid: boolean;
}) {
  const missing = MODULES.filter((m) => !modules.includes(m));
  const price = (n: number) => (prices && n ? `${fmtARS(n)}/mes` : "");
  return (
    <div className="card" id="plan" data-testid="plan-card">
      <h2 className="card-title">Tu plan</h2>
      {paid && <div className="muted" role="status" style={{ marginBottom: 8 }}>Volviste de Mercado Pago. Si el módulo no aparece activo todavía, se activa apenas se confirme el pago.</div>}
      <div className="plan-row">
        <div><b>Base</b><div className="muted">{BASE_INCLUDES}</div></div>
        <Badge tone="green">Incluido</Badge>
      </div>
      {MODULES.map((m) => (
        <div className="plan-row" key={m} data-testid={`plan-${m}`}>
          <div><b>{MODULE_INFO[m].label}</b><div className="muted">{MODULE_INFO[m].desc}</div></div>
          {modules.includes(m) ? <Badge tone="green">Incluido</Badge>
            : pending.includes(m) && !canBuy ? <Badge tone="amber">Pago pendiente</Badge>
            : canBuy && prices?.[m] && (m !== "asistente" || modules.includes("catalogo"))
              ? <PayButton item={m} label={`Sumar por ${price(prices[m])}`} testId={`plan-sumar-${m}`} className="btn" />
              : <Badge tone="amber">No incluido</Badge>}
        </div>
      ))}
      {missing.length > 0 && <p className="muted" style={{ marginBottom: 0 }}>
        {canBuy
          ? "Pagás con Mercado Pago, todos los meses. El módulo se activa apenas se confirma el pago, sin perder nada de lo cargado."
          : "Para sumar un módulo escribile a Enlata2: se activa en el día, sin perder nada de lo cargado."}
      </p>}
    </div>
  );
}
