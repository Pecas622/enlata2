import { BrandName } from "@/components/BrandName";
import { Logo } from "@/components/icons";
import { LoginForm } from "./LoginForm";

const ERRORS: Record<string, string> = {
  "sin-perfil": "Tu usuario no tiene acceso a ningún espacio de trabajo. Pedile al administrador que te dé de alta.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="center">
      <div className="card auth-card" style={{ padding: "28px 26px" }}>
        <div className="auth-head">
          <Logo size={46} />
          <div style={{ fontSize: 26, marginTop: 10 }}><BrandName /></div>
          <p className="muted">Tu marca, tus contenidos y tus campañas en un solo lugar.</p>
        </div>
        <LoginForm initialError={error ? ERRORS[error] : undefined} />
      </div>
    </main>
  );
}
