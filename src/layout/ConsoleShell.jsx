import React from "react";
import { Link, useLocation } from "react-router-dom";
import { CARBON, CARD, BORDER, OFFWHITE, GREEN, GRAY } from "../lib/theme.js";

const TABS = [
  { id: "admin", label: "Admin", to: "/admin" },
  { id: "app", label: "Usuario", to: "/app" },
];

export default function ConsoleShell({ children }) {
  const location = useLocation();
  const activeTab = location.pathname.startsWith("/admin") ? "admin" : "app";

  return (
    <div style={{ minHeight: "100vh", background: CARBON, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 16, padding: "0 20px", height: 48, flex: "none",
        borderBottom: `1px solid ${BORDER}`, background: CARD,
      }}>
        <Link to="/" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 14, color: OFFWHITE, textDecoration: "none" }}>
          ENLATA<span style={{ color: GREEN }}>2</span>
        </Link>
        <div style={{ width: 1, height: 20, background: BORDER }} />
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map((t) => (
            <Link key={t.id} to={t.to} style={{
              padding: "6px 12px", borderRadius: 6, fontFamily: "Inter", fontSize: 12.5, fontWeight: 600, textDecoration: "none",
              color: activeTab === t.id ? GREEN : GRAY, background: activeTab === t.id ? "rgba(184,255,61,0.1)" : "transparent",
            }}>{t.label}</Link>
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "Inter", fontSize: 11.5, color: GRAY }}>
          Consola interna · sin login todavía
        </div>
      </div>
      <div style={{ flex: 1, padding: 24 }}>
        {children}
      </div>
    </div>
  );
}
