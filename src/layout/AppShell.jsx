import React from "react";
import { Link } from "react-router-dom";
import { CARBON, CARD, BORDER, OFFWHITE, GREEN, GRAY } from "../lib/theme.js";

// Top strip for the client-facing "Usuario" console (/app/*).
// Deliberately has no link to /admin — regular users must never see it.
export default function AppShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: CARBON, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "10px 20px", minHeight: 48, flex: "none",
        borderBottom: `1px solid ${BORDER}`, background: CARD,
      }}>
        <Link to="/" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 14, color: OFFWHITE, textDecoration: "none" }}>
          ENLATA<span style={{ color: GREEN }}>2</span>
        </Link>
        <div style={{ marginLeft: "auto", fontFamily: "Inter", fontSize: 11.5, color: GRAY }}>
          Tu panel
        </div>
      </div>
      <div className="shell-content" style={{ flex: 1, padding: 24 }}>
        {children}
      </div>
    </div>
  );
}
