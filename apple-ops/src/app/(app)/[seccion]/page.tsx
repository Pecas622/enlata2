import { notFound, redirect } from "next/navigation";
import { NAV_ITEMS, canOpen } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";

export default async function SectionPage({ params }: { params: Promise<{ seccion: string }> }) {
  const { seccion } = await params;
  const item = NAV_ITEMS.find((i) => i.id === seccion);
  if (!item) notFound();
  const user = await getCurrentUser();
  if (!canOpen(user.role, seccion, user.modules)) redirect("/dashboard");
  return (
    <>
      <h1 className="page-title" data-testid="page-title">{item.label}</h1>
      <p className="page-sub">Hola, {user.name}.</p>
      <div className="card muted">Esta sección se construye en la etapa {item.stage}.</div>
    </>
  );
}
