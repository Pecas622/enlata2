import React, { useState } from "react";
import InmoOps from "./pages/InmoOps.jsx";
import AutoOps from "./pages/AutoOps.jsx";
import ClubOps from "./pages/ClubOps.jsx";
import RestaurantOps from "./pages/RestaurantOps.jsx";
import Checkout from "./pages/Checkout.jsx";
import Cobros from "./pages/Cobros.jsx";
import GenericOps from "./lib/GenericOps.jsx";
import { CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY } from "./lib/theme.js";
import { PRODUCTS } from "./config/products.js";

const BUILTIN_PAGES = { inmo: InmoOps, auto: AutoOps, club: ClubOps, restaurant: RestaurantOps };

const PAGES = [
  { id: "landing", label: "Landing (Enlata2)" },
  { id: "checkout", label: "Flujo de compra" },
  { id: "cobros", label: "Panel de cobros" },
];

const navBtnStyle = (active) => ({
  background: active ? GREEN : "transparent",
  color: active ? CARBON : GRAY,
  border: `1px solid ${active ? GREEN : BORDER}`,
  borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
});

export default function App() {
  const [page, setPage] = useState("landing");
  const [productId, setProductId] = useState(PRODUCTS[0].id);

  const activeProduct = PRODUCTS.find((p) => p.id === productId);

  return (
    <div style={{ minHeight: "100vh", background: CARBON, fontFamily: "Inter, sans-serif" }}>
      <div style={{
        display: "flex", gap: 10, alignItems: "center", padding: "14px 20px",
        borderBottom: `1px solid ${BORDER}`, background: CARD, flexWrap: "wrap",
      }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, color: OFFWHITE, marginRight: 16 }}>
          ENLATA<span style={{ color: GREEN }}>2</span>
        </div>
        {PAGES.map((p) => (
          <button key={p.id} onClick={() => setPage(p.id)} style={navBtnStyle(page === p.id)}>
            {p.label}
          </button>
        ))}

        <div style={{ width: 1, height: 22, background: BORDER, margin: "0 4px" }} />

        <select
          value={page === "product" ? productId : ""}
          onChange={(e) => { setProductId(e.target.value); setPage("product"); }}
          style={{
            background: page === "product" ? GREEN : CARD2, color: page === "product" ? CARBON : OFFWHITE,
            border: `1px solid ${page === "product" ? GREEN : BORDER}`, borderRadius: 8,
            padding: "8px 12px", fontSize: 13, fontWeight: 600, fontFamily: "Inter", cursor: "pointer",
          }}
        >
          <option value="" disabled>Ver producto...</option>
          {PRODUCTS.map((p) => (
            <option key={p.id} value={p.id}>{p.num} · {p.name}{p.businessName ? ` — ${p.businessName}` : ""}</option>
          ))}
        </select>
      </div>

      <div style={{ padding: page === "landing" ? 0 : 24 }}>
        {page === "landing" && (
          <iframe
            src="/landing.html"
            title="Enlata2 Landing"
            style={{ width: "100%", height: "calc(100vh - 57px)", border: "none" }}
          />
        )}
        {page === "checkout" && <Checkout />}
        {page === "cobros" && <Cobros />}
        {page === "product" && activeProduct && (() => {
          const Builtin = BUILTIN_PAGES[activeProduct.id];
          return Builtin ? <Builtin /> : <GenericOps product={activeProduct} />;
        })()}
      </div>
    </div>
  );
}
