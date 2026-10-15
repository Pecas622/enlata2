// Instagram de mentira para los tests de punta a punta: contesta como la Content Publishing API y anota los pedidos
// (GET /__pedidos los devuelve). La app lo usa con INSTAGRAM_GRAPH_URL=http://localhost:3199.
import { createServer } from "node:http";

const PORT = Number(process.env.IG_FAKE_PORT ?? 3199);
const pedidos = [];
let n = 0;

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const send = (code, data) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/__pedidos") return send(200, pedidos);
    pedidos.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: Object.fromEntries(new URLSearchParams(body)) });
    if (req.method === "POST" && url.pathname.endsWith("/media_publish")) return send(200, { id: "17900000000000001" });
    if (req.method === "POST" && url.pathname.endsWith("/media")) return send(200, { id: `1800000000000000${++n}` });
    const fields = url.searchParams.get("fields") ?? "";
    if (fields.includes("status_code")) return send(200, { status_code: "FINISHED", status: "Finished" });
    if (fields.includes("permalink")) return send(200, { permalink: "https://www.instagram.com/p/E2E123/" });
    if (url.pathname.endsWith("/me")) return send(200, { user_id: "e2e-1784", username: "rodarbikes", account_type: "BUSINESS", followers_count: 900 });
    send(404, { error: { message: "ruta desconocida en el Instagram de mentira" } });
  });
}).listen(PORT, () => console.log(`Instagram de mentira en ${PORT}`));
