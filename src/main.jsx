import React from "react";
import ReactDOM from "react-dom/client";
import "./storage-polyfill.js";
import "./lib/responsive.css";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
