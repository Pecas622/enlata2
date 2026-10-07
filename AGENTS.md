# AGENTS.md

Guía para agentes de IA (Claude Code, Codex, Cursor, etc.) que trabajan en este repo. Para humanos, empezá por [README.md](README.md).

## Mapa del repo

- **Raíz**: sitio comercial y demos de Enlata2 (React + Vite, sin backend). Lo publica el proyecto de Vercel `enlata2`.
- **`apple-ops/`**: APPLE OPS, la app real (Next.js App Router + TypeScript + Supabase + Vercel). Tiene su propio `package.json`, su propio CI y su propio proyecto de Vercel.

Son independientes. Un cambio en una no debe tocar la otra salvo que el pedido lo diga explícitamente.

## Antes de tocar `apple-ops/`

Leé [apple-ops/CLAUDE.md](apple-ops/CLAUDE.md): tiene las reglas de negocio no negociables (moneda, tasación del canje, roles, caja, catálogo público, asistente). Para cómo está armado y qué hace cada función SQL, [apple-ops/README.md](apple-ops/README.md). El prototipo `apple-ops/reference/apple-ops-full.jsx` es la fuente de verdad de pantallas y flujos: portalo, no lo reinventes.

### Comandos (desde `apple-ops/`)

```bash
npm install
npx supabase start   # necesita Docker; aplica migraciones y supabase/seed.sql
npm run dev
npm run lint
npm run typecheck
npm test             # Vitest: lógica pura (src/lib/*.test.ts) y permisos en la base (tests/db/), necesita Supabase levantado
npm run build
npm run test:e2e     # Playwright (tests/e2e/)
npm run db:reset     # vuelve a los datos demo
```

Corré lint, typecheck y `npm test` antes de cada push. Los tests de base y e2e comparten el seed: los de caja dejan siempre una caja abierta para los de ventas (usá los helpers `withShiftClosed()` y `openShiftId()` de `tests/db/helpers.ts`).

### Dónde va cada cosa

- `src/app/(app)/`: pantallas internas con login (una carpeta por sección). `src/app/(print)/`: comprobantes y reportes imprimibles. `src/app/catalogo/[slug]/`: catálogo público, cotizador y asistente, sin login.
- `src/lib/`: lógica de negocio en funciones puras con su `*.test.ts` al lado (`appraise.ts`, `sale.ts`, `cash.ts`, `reports.ts`, `roles.ts`, `assistant.ts`...).
- `supabase/migrations/`: esquema, vistas, RLS y funciones SQL. Una migración nueva por cambio, con fecha en el nombre; nunca edites una ya aplicada. `supabase/produccion/` tiene el esquema en dos archivos para pegar en el SQL Editor: regeneralos si agregás migraciones.

### Reglas que se rompen fácil

- Interfaz en español rioplatense, con voseo.
- Los permisos se aplican en la base (RLS y funciones SQL), no solo en la UI. Ventas, anulaciones, ingresos, caja, usuarios y config se escriben solo por funciones SQL transaccionales que dejan registro con usuario y hora.
- Los costos viven en tablas aparte que solo leen Administrador y Encargado. El Vendedor no ve costos ni márgenes; el Cajero cuenta la caja sin ver el esperado.
- El catálogo público lee solo vistas públicas: nunca costos, IMEI, clientes ni márgenes. Si agregás un campo, extendé el test que lo verifica.
- Fechas en el día local de Argentina (`America/Argentina/Mendoza`, ver `src/lib/dates.ts`), nunca UTC pelado.
- Equipos en USD, accesorios en ARS; toda conversión pasa por `toUSD`.
- Hooks de React siempre antes de cualquier `return` condicional.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo en el servidor. Nunca commitees secretos ni `.env*`.
- El asistente no inventa precios ni stock: usa sus herramientas sobre vistas públicas y, sin clave de IA, cae al motor de reglas `src/lib/assistant.ts`. Mantené los dos caminos.

## Antes de tocar la raíz

```bash
npm install
npm run dev
npm run build   # no hay tests ni lint; que el build pase es el chequeo mínimo
```

Las verticales se definen en `src/config/products.js` (las genéricas se renderizan con `src/lib/GenericOps.jsx`) y las que tienen pantalla propia viven en `src/pages/`. Los datos se guardan en `localStorage`. La facturación ARCA es simulada (`src/lib/arca.js`, ver [docs/ARCA-FACTURACION.md](docs/ARCA-FACTURACION.md)) y tiene que seguir avisando en pantalla que es simulada.

## Forma de trabajar

- Una rama y una PR por cambio. Las PRs de APPLE OPS se nombran por etapa o tema (`apple-ops/etapa-N-...`).
- Cambios chicos y probados; resumí qué cambió en pocas líneas.
- Migraciones nuevas se aplican en producción con `npx supabase db push` antes de mergear la PR que las usa (ver [apple-ops/DEPLOY.md](apple-ops/DEPLOY.md)).
