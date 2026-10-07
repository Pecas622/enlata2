import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app vive en una carpeta del repo enlata2, que tiene su propio package-lock en la raíz.
  outputFileTracingRoot: path.join(__dirname),
  // Fotos de equipos (hasta 4 MB) por server action; Vercel acepta hasta 4,5 MB por pedido.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};

export default nextConfig;
