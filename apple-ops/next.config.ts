import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app vive en una carpeta del repo enlata2, que tiene su propio package-lock en la raíz.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
