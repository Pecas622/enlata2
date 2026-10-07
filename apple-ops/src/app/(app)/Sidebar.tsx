"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo, NavIcon } from "@/components/icons";
import type { NavItem } from "@/lib/roles";

export function Shell({ nav, locked = [], storeName, footer, children }: { nav: NavItem[]; locked?: NavItem[]; storeName: string; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = pathname.split("/")[1] || "dashboard";
  return (
    <div className={`shell${open ? " menu-open" : ""}`}>
      <div className="menu-toggle">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Logo size={24} />
          <span className="brand">APPLE<span>OPS</span></span>
        </div>
        <button className="btn btn-secondary" style={{ padding: "6px 12px" }} onClick={() => setOpen(!open)} data-testid="menu-toggle">
          {open ? "Cerrar" : "Menú"}
        </button>
      </div>
      <nav className="sidebar" aria-label="Secciones">
        <div className="sidebar-head">
          <Logo />
          <div>
            <div className="brand">APPLE<span>OPS</span></div>
            <div className="store">{storeName}</div>
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
        {locked.length > 0 && <div className="nav-group">Sumá a tu plan</div>}
        {locked.map((item) => (
          <Link key={item.id} href="/config#plan" className="nav-item nav-locked" data-testid={`nav-locked-${item.id}`} onClick={() => setOpen(false)}>
            <NavIcon name={item.icon} />
            {item.label}
          </Link>
        ))}
        <div className="sidebar-foot">{footer}</div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
