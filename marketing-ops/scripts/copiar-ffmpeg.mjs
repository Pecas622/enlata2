// Copia el motor de video (ffmpeg.wasm) a public/ffmpeg para que el editor de video lo cargue desde la misma app,
// sin depender de un CDN. Corre después de npm install y antes del build; la carpeta no se commitea.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const from = path.join(process.cwd(), "node_modules", "@ffmpeg", "core", "dist", "umd");
const to = path.join(process.cwd(), "public", "ffmpeg");
if (!existsSync(from)) {
  console.warn("No encontré @ffmpeg/core: el editor de video no va a poder cargar el motor.");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) copyFileSync(path.join(from, f), path.join(to, f));
console.log("Motor de video copiado a public/ffmpeg.");
