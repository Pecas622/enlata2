"use client";

export function PrintButton() {
  return <button className="btn btn-primary no-print" style={{ marginTop: 18, width: "100%" }} onClick={() => window.print()}>Imprimir</button>;
}
