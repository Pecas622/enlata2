// Arma supabase/produccion/datos-demo.sql a partir de supabase/seed.sql: las mismas marcas, piezas, campañas, resultados
// e investigación de ejemplo, pero cargadas en el espacio de trabajo que ya existe en un Supabase de producción y a nombre
// de su Administrador (sin crear usuarios). También arma borrar-datos-demo.sql, que saca todo lo demo y nada más.
// Uso: npm run db:demo (después de cambiar el seed).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "supabase");
let sql = readFileSync(join(dir, "seed.sql"), "utf8");

const WS = "(select id from workspaces order by created_at limit 1)";
const ADMIN = `(select id from profiles where workspace_id = ${WS} and role = 'Administrador' order by created_at limit 1)`;
const DEMO = "'00000000-0000-4000-8000-%'"; // todos los ids demo empiezan así; los reales son aleatorios

const replace = (from, to) => {
  if (!sql.includes(from)) throw new Error(`No encontré en el seed: ${from.slice(0, 60)}…`);
  sql = sql.split(from).join(to);
};

// 1. Sin espacio de trabajo ni usuarios nuevos: se usa el que ya existe.
sql = sql.replace(/^--.*\n--.*\n\n/, "");
sql = sql.replace(/  insert into workspaces[\s\S]*?end loop;\n\n/, "");
replace("  u record;\n", "");
replace("v_ws uuid := '00000000-0000-4000-8000-000000000001';", `v_ws uuid := ${WS};`);
replace("'00000000-0000-4000-8000-000000000001'", WS);
for (const u of ["a1", "a2", "a3"]) replace(`'00000000-0000-4000-8000-0000000000${u}'`, ADMIN);

// 2. Lo que el seed hace sobre toda la tabla, acá solo sobre lo demo.
replace("where c.status = 'Publicado' and c.id <> '00000000-0000-4000-8000-0000000000c1';", `where c.status = 'Publicado' and c.id <> '00000000-0000-4000-8000-0000000000c1' and c.id::text like ${DEMO};`);
replace("from content_results r;", `from content_results r where r.content_id::text like ${DEMO};`);

// 3. La clienta demo del equipo es un usuario del seed: en producción no existe.
sql = sql.replace(/-- Equipo \(etapa 7\)[^\n]*\nupdate profiles set brand_ids[^\n]*\n/, "");
if (sql.includes("brand_ids")) throw new Error("Quedó la clienta demo del equipo en los datos demo.");

// 3b. La investigación solo si la base ya tiene la etapa 5.
sql = sql.replace(/(-- Una investigación de ejemplo[^\n]*\n)(insert into brand_research[\s\S]*?\);\n)/, (_, comment, insert) =>
  `${comment}do $demo$ begin\n  if to_regclass('public.brand_research') is not null then\n    execute $q$\n${insert.trimEnd().replace(/;$/, "")}\n    $q$;\n  end if;\nend $demo$;\n`);
if (!sql.includes("$q$")) throw new Error("No encontré la investigación de ejemplo en el seed.");

// 4. Los campos del plan del mes solo si la base ya tiene la etapa 6.
sql = sql.replace(/(  -- Lo que usa el plan del mes[^\n]*\n)([\s\S]*?)(end \$\$;)/, (_, comment, updates, end) =>
  `${comment}  if to_regclass('public.content_plans') is not null then\n    execute $q$\n${updates.trimEnd().replace(/;\n/g, ";\n").replace(/;$/, "")}\n    $q$;\n  end if;\n${end}`);
if (!sql.includes("to_regclass('public.content_plans')")) throw new Error("No encontré los campos del plan en el seed.");

const header = `-- MARKETING OPS · datos demo para ver la app funcionando en producción.
-- Carga dos marcas de ejemplo (La Espiga y Rodar Bikes) con piezas en todos los estados, campañas, resultados y,
-- si la base ya tiene la etapa 5, una investigación. Todo queda a nombre del Administrador del espacio de trabajo.
-- Pegalo entero en SQL Editor del proyecto de MARKETING OPS y tocá Run. Para sacarlo: borrar-datos-demo.sql.
-- Generado desde supabase/seed.sql con npm run db:demo.

begin;

do $$
begin
  if to_regclass('public.content_results') is null then raise exception 'Esta base no es la de MARKETING OPS con la etapa 4.'; end if;
  if (select count(*) from workspaces) <> 1 then raise exception 'La base tiene % espacios de trabajo: este archivo es para una base con uno solo.', (select count(*) from workspaces); end if;
  if ${ADMIN} is null then raise exception 'El espacio de trabajo no tiene un Administrador.'; end if;
  if exists (select 1 from brands where id = '00000000-0000-4000-8000-0000000000b1') then raise exception 'Los datos demo ya están cargados. Si querés recargarlos, corré antes borrar-datos-demo.sql.'; end if;
end $$;

`;
writeFileSync(join(dir, "produccion", "datos-demo.sql"), header + sql.trimEnd() + "\n\ncommit;\n");

// Borrar: todo cuelga de las dos marcas demo (piezas, historial, campañas, resultados e investigaciones se van en cascada).
writeFileSync(join(dir, "produccion", "borrar-datos-demo.sql"), `-- MARKETING OPS · saca los datos demo que cargó datos-demo.sql. No toca nada tuyo: borra solo las dos marcas demo,
-- y con ellas sus piezas, historial, campañas, resultados e investigaciones.
delete from brands where id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
`);
console.log("supabase/produccion/datos-demo.sql y borrar-datos-demo.sql listos");
