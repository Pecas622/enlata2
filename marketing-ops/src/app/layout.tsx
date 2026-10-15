import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";

// Tipografía propia de MARKETING OPS (APPLE OPS usa la del sistema).
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Marca, contenidos y campañas de tu negocio en un solo lugar.",
};

export const viewport: Viewport = { themeColor: "#0C0D12", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
