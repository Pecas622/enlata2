import Link from "next/link";
import { after } from "next/server";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { refreshFxQuietly } from "@/lib/fx-server";
import { navFor } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { Shell } from "./Sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // Si el local usa cotización automática y está vieja, se actualiza después de responder.
  after(() => refreshFxQuietly(user.storeId));
  const footer = (
    <>
      <div className="who" data-testid="current-user">
        {user.name}
        <small>{user.role}</small>
      </div>
      <Link href="/cambiar-usuario" className="btn btn-secondary" data-testid="switch-user">Cambiar usuario</Link>
      <form action={logout}>
        <button className="btn btn-ghost" type="submit" style={{ width: "100%" }} data-testid="logout">Salir</button>
      </form>
    </>
  );
  return (
    <Shell nav={navFor(user.role)} storeName={user.storeName} footer={footer}>
      {children}
    </Shell>
  );
}
