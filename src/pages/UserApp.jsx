import React from "react";
import { useParams, Navigate, NavLink } from "react-router-dom";
import { CARD2, BORDER, OFFWHITE, GREEN, GRAY } from "../lib/theme.js";
import { PRODUCTS } from "../config/products.js";
import GenericOps from "../lib/GenericOps.jsx";
import InmoOps from "./InmoOps.jsx";
import AutoOps from "./AutoOps.jsx";
import ClubOps from "./ClubOps.jsx";
import RestaurantOps from "./RestaurantOps.jsx";
import DistribuidoraOps from "./DistribuidoraOps.jsx";

const BUILTIN_PAGES = { inmo: InmoOps, auto: AutoOps, club: ClubOps, restaurant: RestaurantOps, distribuidora: DistribuidoraOps };

export default function UserApp() {
  const { productId } = useParams();
  const activeProduct = PRODUCTS.find((p) => p.id === productId);

  if (!activeProduct) {
    return <Navigate to={`/app/${PRODUCTS[0].id}`} replace />;
  }

  const Builtin = BUILTIN_PAGES[activeProduct.id];

  return (
    <div className="ops-shell" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      <div className="ops-sidebar" style={{ width: 220, flex: "none", background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 12px" }}>
        <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, textTransform: "uppercase", padding: "0 8px 12px 8px" }}>
          Tus negocios (demo)
        </div>
        <div className="ops-nav-list" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {PRODUCTS.map((p) => (
            <NavLink key={p.id} to={`/app/${p.id}`} className="ops-nav-item" style={({ isActive }) => ({
              display: "block", padding: "9px 10px", borderRadius: 8, textDecoration: "none",
              background: isActive ? "rgba(184,255,61,0.1)" : "transparent",
            })}>
              <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 12.5, color: activeProduct.id === p.id ? GREEN : OFFWHITE }}>
                {p.num} · {p.name}
              </div>
              <div style={{ fontFamily: "Inter", fontSize: 11, color: GRAY, marginTop: 2 }}>{p.rubro}</div>
            </NavLink>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, width: "100%" }}>
        {Builtin ? <Builtin /> : <GenericOps product={activeProduct} />}
      </div>
    </div>
  );
}
