// Junta las migraciones en supabase/produccion/base.sql, para pegar en SQL Editor de un Supabase nuevo.
// Uso: npm run db:produccion (después de agregar una migración).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "supabase");
const files = readdirSync(join(dir, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const out = [
  "-- MARKETING OPS · base completa para un Supabase nuevo.",
  "-- Pegala entera en SQL Editor y corré. Son las migraciones de supabase/migrations, en orden:",
  ...files.map((f) => `--   ${f}`),
  "-- Al final las registra, así que un `npx supabase db push` posterior no las repite. No trae datos demo.",
  "-- Generada desde las migraciones: si agregás una, regenerá este archivo (ver README.md de esta carpeta).",
  "",
  "-- Freno: solo corre en una base vacía. Si el proyecto ya tiene tablas (por ejemplo, el de APPLE OPS), corta acá",
  "-- y no toca nada: varios nombres se pisan (profiles, user_role, is_admin, dia_ar) y cambiarían sus permisos.",
  "do $$",
  "begin",
  "  if exists (select 1 from pg_tables where schemaname = 'public') or exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'user_role') then",
  "    raise exception 'Esta base ya tiene tablas: base.sql va en un proyecto de Supabase nuevo y vacío. No se aplicó nada.';",
  "  end if;",
  "end $$;",
  "",
];
for (const f of files) {
  out.push("-- ======================================================================", `-- ${f}`, "-- ======================================================================");
  out.push(readFileSync(join(dir, "migrations", f), "utf8").trimEnd(), "");
}
out.push(
  "-- ---------- registro de migraciones ----------",
  "create schema if not exists supabase_migrations;",
  "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);",
  ...files.map((f) => {
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    return `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${rest.join("_")}') on conflict do nothing;`;
  }),
);
writeFileSync(join(dir, "produccion", "base.sql"), out.join("\n") + "\n");
console.log(`supabase/produccion/base.sql: ${files.length} migraciones`);
