import { redirect } from "next/navigation";
import { Logo } from "@/components/icons";
import { loadPrices, syncStore } from "@/lib/billing-server";
import { mpConfigured } from "@/lib/mercadopago";
import { BASE_INCLUDES } from "@/lib/modules";
import { fmtARS } from "@/lib/money";
import { getCurrentUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { salir } from "./actions";
import { PayButton } from "./PayButton";

export const dynamic = "force-dynamic";

// A dónde vuelve el cliente desde Mercado Pago, y donde espera un local sin el plan base al día.
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ vuelta?: string; error?: string }> }) {
  const { vuelta, error } = await searchParams;
  const user = await getCurrentUser();
  // Al volver de Mercado Pago no se espera la notificación: se consulta el estado ahí mismo.
  if (mpConfigured()) await syncStore(user.storeId);
  const { data: store } = await (await createClient()).from("stores").select("billing_status").eq("id", user.storeId).single();
  const status = store?.billing_status ?? user.billingStatus;
  if (status === "activo") redirect(vuelta === "modulo" ? "/config?pago=ok#plan" : "/dashboard");

  const prices = await loadPrices();
  const suspended = status === "suspendido";
  return (
    <main className="center">
      <div className="card auth-card" style={{ padding: "28px 26px" }} data-testid="plan-pendiente">
        <div className="auth-head">
          <Logo size={46} />
          <div className="brand">APPLE<span>OPS</span></div>
        </div>
        <h2 className="card-title" style={{ margin: 0 }}>{suspended ? "Tu plan está suspendido" : `Falta activar ${user.storeName}`}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {suspended
            ? "Mercado Pago no pudo cobrar el plan base o la suscripción se canceló. Lo que cargaste sigue guardado: cuando se reactive, entrás como siempre."
            : vuelta === "base"
              ? "Mercado Pago todavía no nos confirmó el pago. Puede tardar unos minutos: recargá esta página en un rato."
              : "Tu cuenta está creada. Para entrar, falta el pago del plan base."}
        </p>
        {error === "mp" && <div className="error" role="alert">Mercado Pago no respondió. Probá de nuevo.</div>}
        <div className="plan-row">
          <div><b>Plan base</b><div className="muted">{BASE_INCLUDES}</div></div>
          <b>{fmtARS(prices.base)}/mes</b>
        </div>
        {user.role === "Administrador"
          ? mpConfigured()
            ? <PayButton item="base" label={`Pagar plan base ${fmtARS(prices.base)}/mes`} testId="plan-pagar-base" />
            : <div className="error" role="alert">El cobro online todavía no está configurado. Escribile a Enlata2.</div>
          : <p className="muted" style={{ margin: 0 }}>Avisale al administrador del local.</p>}
        <form action={salir}><button className="btn" type="submit" style={{ width: "100%" }} data-testid="plan-salir">Salir</button></form>
      </div>
    </main>
  );
}
