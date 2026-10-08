// Mercado Pago de mentira para los e2e: crea suscripciones (preapproval), muestra un checkout con
// un botón "Pagar" que las autoriza y vuelve al back_url, como el de verdad. También acepta el cambio
// de monto (PUT) que usa scripts/ajustar-precios.mjs.
import { createServer } from "node:http";

const PORT = Number(process.env.MP_MOCK_PORT ?? 3999);
const subs = new Map();
let n = 0;

const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const read = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b ? JSON.parse(b) : {})); });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const [, a, id] = url.pathname.split("/");
  if (req.method === "GET" && a === "health") return json(res, 200, { ok: true });
  if (a === "preapproval" && req.method === "POST") {
    if (!String(req.headers.authorization).startsWith("Bearer ")) return json(res, 401, { message: "sin token" });
    const body = await read(req);
    const sub = { id: `mock${++n}${Date.now()}`, status: "pending", external_reference: body.external_reference, back_url: body.back_url,
      reason: body.reason, auto_recurring: body.auto_recurring };
    sub.init_point = `http://localhost:${PORT}/checkout/${sub.id}`;
    subs.set(sub.id, sub);
    return json(res, 201, sub);
  }
  if (a === "preapproval" && req.method === "PUT" && subs.has(id)) {
    const body = await read(req);
    Object.assign(subs.get(id).auto_recurring, body.auto_recurring ?? {});
    return json(res, 200, subs.get(id));
  }
  if (a === "preapproval" && req.method === "GET") return subs.has(id) ? json(res, 200, subs.get(id)) : json(res, 404, { message: "no existe" });
  if (a === "subs" && req.method === "GET") return json(res, 200, [...subs.values()]);
  if (a === "checkout" && subs.has(id)) {
    const sub = subs.get(id);
    if (req.method === "POST") {
      sub.status = "authorized";
      res.writeHead(303, { Location: sub.back_url });
      return res.end();
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>Mercado Pago (prueba)</title><h1>${sub.reason}</h1><p data-testid="mp-monto">$ ${sub.auto_recurring.transaction_amount}</p><form method="post"><button data-testid="mp-pagar">Pagar</button></form>`);
  }
  json(res, 404, { message: "no existe" });
}).listen(PORT, () => console.log(`mp-mock en ${PORT}`));
