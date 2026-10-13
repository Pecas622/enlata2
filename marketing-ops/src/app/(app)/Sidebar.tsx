"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BrandName } from "@/components/BrandName";
import { Logo, NavIcon } from "@/components/icons";
import { NEXT_ITEMS, type NavItem } from "@/lib/roles";

export function Shell({ nav, workspaceName, footer, children }: { nav: NavItem[]; workspaceName: string; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = pathname.split("/")[1] || "inicio";
  return (
    <div className={`shell${open ? " menu-open" : ""}`}>
      <div className="menu-toggle">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={24} />
          <BrandName />
        </div>
        <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => setOpen(!open)} data-testid="menu-toggle">
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      <nav className="sidebar" aria-label="Secciones">
        <div className="sidebar-head">
          <Logo />
          <div>
            <BrandName />
            <div className="store">{workspaceName}</div>
          </div>
        </div>
        {nav.map((item) => (
          <Link
            key={item.id}
            href={`/${item.id}`}
            className={`nav-item${current === item.id ? " active" : ""}`}
            data-testid={`nav-${item.id}`}
            onClick={() => setOpen(false)}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
        <div className="nav-group">Próximas etapas</div>
        {NEXT_ITEMS.map((item) => (
          <div key={item.label} className="nav-next" aria-disabled>
            <NavIcon name={item.icon} />
            {item.label}
            <em>Pronto</em>
          </div>
        ))}
        <div className="sidebar-foot">{footer}</div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
