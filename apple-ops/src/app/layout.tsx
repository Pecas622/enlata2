import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "APPLE OPS",
  description: "Stock con IMEI, plan canje, accesorios y caja para tu local.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
