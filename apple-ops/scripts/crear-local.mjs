// Alta de un local nuevo con su primer Administrador, en el Supabase que indiquen las variables.
// Uso: npm run crear-local -- --local "Mi Local" --link mi-local --nombre "Santiago" --email yo@milocal.com --pin 1234 [--env .env.produccion]
// La contraseña sale de ADMIN_PASSWORD o se genera y se muestra una sola vez.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values: a } = parseArgs({
  options: {
    local: { type: "string" }, link: { type: "string" }, nombre: { type: "string" },
    email: { type: "string" }, pin: { type: "string" }, env: { type: "string", default: ".env.local" },
  },
});
const missing = ["local", "link", "nombre", "email", "pin"].filter((k) => !a[k]);
if (missing.length) {
  console.error(`Faltan: ${missing.map((k) => "--" + k).join(", ")}`);
  process.exit(1);
}
if (existsSync(a.env)) process.loadEnvFile(a.env);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(`Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (en ${a.env} o en el entorno).`);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
const { data: created, error: authError } = await sb.auth.admin.createUser({
  email: a.email, password, email_confirm: true, user_metadata: { name: a.nombre },
});
if (authError) {
  console.error(`No se pudo crear la cuenta: ${authError.message}`);
  process.exit(1);
}
const { data: store, error } = await sb.rpc("crear_local", {
  p_name: a.local, p_slug: a.link, p_admin: created.user.id, p_admin_name: a.nombre, p_pin: a.pin,
});
if (error) {
  await sb.auth.admin.deleteUser(created.user.id);
  console.error(`No se pudo crear el local: ${error.message}`);
  process.exit(1);
}
console.log(`Listo: local "${a.local}" (${store}).`);
console.log(`Entrá con ${a.email}${process.env.ADMIN_PASSWORD ? " y la contraseña de ADMIN_PASSWORD" : ` y la contraseña ${password} (guardala, no se vuelve a mostrar)`}.`);
console.log(`El catálogo /catalogo/${a.link} queda pausado hasta que lo publiques desde Catálogo online.`);
