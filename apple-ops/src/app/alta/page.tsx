import Link from "next/link";
import { Logo } from "@/components/icons";
import { loadPrices } from "@/lib/billing-server";
import { mpConfigured } from "@/lib/mercadopago";
import { BASE_INCLUDES, EXTRA_MODULES, MODULE_INFO } from "@/lib/modules";
import { fmtARS } from "@/lib/money";
import { AltaForm } from "./AltaForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empezá con APPLE OPS" };

// Alta pública: precios del plan y de los módulos, y el formulario para crear la cuenta y pagar.
export default async function AltaPage() {
  const prices = await loadPrices();
  return (
    <main className="center">
      <div className="card auth-card" style={{ padding: "28px 26px", maxWidth: 460 }}>
        <div className="auth-head">
          <Logo size={46} />
          <div className="brand">APPLE<span>OPS</span></div>
          <p className="muted">Creá la cuenta de tu local y empezá hoy.</p>
        </div>
        <div data-testid="alta-precios">
          <div className="plan-row">
            <div><b>Plan base</b><div className="muted">{BASE_INCLUDES}</div></div>
            <b>{fmtARS(prices.base)}/mes</b>
          </div>
          {EXTRA_MODULES.map((m) => (
            <div className="plan-row" key={m}>
              <div><b>{MODULE_INFO[m].label}</b><div className="muted">{MODULE_INFO[m].desc}</div></div>
              <span>+{fmtARS(prices[m])}/mes</span>
            </div>
          ))}
          <p className="muted" style={{ marginBottom: 0 }}>Los módulos los sumás después desde Configuración → Tu plan, cuando los necesites.</p>
        </div>
        {mpConfigured()
          ? <AltaForm price={fmtARS(prices.base)} />
          : <div className="error" role="alert" data-testid="alta-sin-mp">El cobro online todavía no está configurado. Escribile a Enlata2 para darte de alta.</div>}
        <p className="muted" style={{ margin: 0, textAlign: "center" }}>¿Ya tenés cuenta? <Link href="/login">Ingresá</Link></p>
      </div>
    </main>
  );
}
