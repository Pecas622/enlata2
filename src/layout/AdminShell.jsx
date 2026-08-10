import React from "react";
import { Link } from "react-router-dom";
import { CARBON, CARD, BORDER, OFFWHITE, GREEN, GRAY } from "../lib/theme.js";

// Top strip for the internal Enlata2 "Admin" console (/admin).
// Not reachable from anywhere in the user-facing app — only via direct URL.
export default function AdminShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: CARBON, display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 16, padding: "0 20px", height: 48, flex: "none",
        borderBottom: `1px solid ${BORDER}`, background: CARD,
      }}>
        <Link to="/" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, fontSize: 14, color: OFFWHITE, textDecoration: "none" }}>
          ENLATA<span style={{ color: GREEN }}>2</span>
        </Link>
        <div style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(184,255,61,0.1)", color: GREEN, fontFamily: "Inter", fontSize: 11.5, fontWeight: 700 }}>
          ADMIN
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "Inter", fontSize: 11.5, color: GRAY }}>
          Uso interno · sin login todavía
        </div>
      </div>
      <div style={{ flex: 1, padding: 24 }}>
        {children}
      </div>
    </div>
  );
}
