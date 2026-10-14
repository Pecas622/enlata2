import Link from "next/link";
import { BrandName } from "@/components/BrandName";
import { Logo } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./SignupForm";

type Info = { email: string; name: string; role: string; workspace: string };

export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ invitacion?: string }> }) {
  const { invitacion } = await searchParams;
  const supabase = await createClient();
  const { data } = invitacion ? await supabase.rpc("invitation_info", { p_token: invitacion }) : { data: null };
  const inv = (data as Info[] | null)?.[0];
  return (
    <main className="center">
      <div className="card auth-card" style={{ padding: "28px 26px" }}>
        <div className="auth-head">
          <Logo size={46} />
          <div style={{ fontSize: 26, marginTop: 10 }}><BrandName /></div>
          {inv ? (
            <p className="muted" data-testid="invite-info">Te invitaron a <b>{inv.workspace}</b> como <b>{inv.role}</b>. Creá tu contraseña para entrar.</p>
          ) : invitacion ? (
            <p className="muted" data-testid="invite-invalid">Este link de invitación no sirve: ya se usó, se canceló o pasaron 14 días. Pedile al administrador uno nuevo.</p>
          ) : (
            <p className="muted" data-testid="signup-own">Creá tu cuenta gratis: arrancás en el plan Prueba con una marca, y después sumás a tu equipo.</p>
          )}
        </div>
        {inv ? <SignupForm token={invitacion!} email={inv.email} name={inv.name} /> : invitacion ? <Link className="btn btn-secondary" href="/login">Ir al login</Link> : <SignupForm />}
        {!inv && !invitacion && <p className="muted" style={{ textAlign: "center", fontSize: 13 }}>¿Ya tenés cuenta? <Link href="/login" style={{ color: "var(--accent)" }}>Entrá</Link></p>}
      </div>
    </main>
  );
}
