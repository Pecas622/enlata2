import { Badge } from "@/components/ui";
import { BASE_INCLUDES, MODULE_INFO, MODULES, type ModuleId } from "@/lib/modules";

// Qué incluye el plan del local. Los módulos los suma o saca Enlata2, no el local.
export function PlanCard({ modules }: { modules: ModuleId[] }) {
  const missing = MODULES.filter((m) => !modules.includes(m));
  return (
    <div className="card" id="plan" data-testid="plan-card">
      <h2 className="card-title">Tu plan</h2>
      <div className="plan-row">
        <div><b>Base</b><div className="muted">{BASE_INCLUDES}</div></div>
        <Badge tone="green">Incluido</Badge>
      </div>
      {MODULES.map((m) => (
        <div className="plan-row" key={m} data-testid={`plan-${m}`}>
          <div><b>{MODULE_INFO[m].label}</b><div className="muted">{MODULE_INFO[m].desc}</div></div>
          {modules.includes(m) ? <Badge tone="green">Incluido</Badge> : <Badge tone="amber">No incluido</Badge>}
        </div>
      ))}
      {missing.length > 0 && <p className="muted" style={{ marginBottom: 0 }}>Para sumar un módulo escribile a Enlata2: se activa en el día, sin perder nada de lo cargado.</p>}
    </div>
  );
}
