import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app vive en una carpeta del repo enlata2, que tiene su propio package-lock en la raíz.
  outputFileTracingRoot: path.join(__dirname),
  // "Editar video con IA" manda fotogramas del video a la acción del servidor.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
