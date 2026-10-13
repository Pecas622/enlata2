import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { navFor } from "@/lib/roles";
import { getCurrentUser } from "@/lib/session";
import { Shell } from "./Sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const footer = (
    <>
      <div className="who" data-testid="current-user">
        {user.name}
        <small>{user.role}</small>
      </div>
      <form action={logout}>
        <button className="btn btn-ghost" type="submit" style={{ width: "100%" }} data-testid="logout">Salir</button>
      </form>
    </>
  );
  return (
    <Shell nav={navFor(user.role)} workspaceName={user.workspaceName} footer={footer}>
      {children}
    </Shell>
  );
}
