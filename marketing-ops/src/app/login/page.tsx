import Link from "next/link";
import { BrandName } from "@/components/BrandName";
import { Logo } from "@/components/icons";
import { LoginForm } from "./LoginForm";

const ERRORS: Record<string, string> = {
  "sin-perfil": "Tu usuario no tiene acceso a ningún espacio de trabajo. Pedile al administrador que te invite desde Equipo, o creá tu propia cuenta.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; confirmado?: string }> }) {
  const { error, confirmado } = await searchParams;
  return (
    <main className="center">
      <div className="card auth-card" style={{ padding: "28px 26px" }}>
        <div className="auth-head">
          <Logo size={46} />
          <div style={{ fontSize: 26, marginTop: 10 }}><BrandName /></div>
          <p className="muted">Tu marca, tus contenidos y tus campañas en un solo lugar.</p>
        </div>
        {confirmado && <p className="ok" style={{ textAlign: "center" }}>Email confirmado. Entrá con tu email y tu contraseña.</p>}
        <LoginForm initialError={error ? ERRORS[error] : undefined} />
        <p className="muted" style={{ textAlign: "center", fontSize: 13, marginTop: 14 }}>¿Todavía no tenés cuenta? <Link href="/registro" style={{ color: "var(--accent)" }} data-testid="link-registro">Creá la tuya</Link></p>
      </div>
    </main>
  );
}
