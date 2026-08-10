import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MarketingSite from "./pages/MarketingSite.jsx";
import Checkout from "./pages/Checkout.jsx";
import Cobros from "./pages/Cobros.jsx";
import UserApp from "./pages/UserApp.jsx";
import ConsoleShell from "./layout/ConsoleShell.jsx";
import { CARBON } from "./lib/theme.js";
import { PRODUCTS } from "./config/products.js";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MarketingSite />} />
        <Route
          path="/checkout"
          element={
            <div style={{ minHeight: "100vh", background: CARBON, padding: 24 }}>
              <Checkout />
            </div>
          }
        />
        <Route path="/admin" element={<ConsoleShell><Cobros /></ConsoleShell>} />
        <Route path="/app" element={<Navigate to={`/app/${PRODUCTS[0].id}`} replace />} />
        <Route path="/app/:productId" element={<ConsoleShell><UserApp /></ConsoleShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
