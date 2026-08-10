import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PRODUCTS } from "../config/products.js";

export default function MarketingSite() {
  const navigate = useNavigate();

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.source !== "enlata2-landing" || e.data?.type !== "view-demo") return;
      if (!PRODUCTS.some((p) => p.id === e.data.productId)) return;
      navigate(`/app/${e.data.productId}`);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);

  return (
    <iframe
      src="/landing.html"
      title="Enlata2 Landing"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
    />
  );
}
