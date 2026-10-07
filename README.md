# Enlata2

"Software que ya viene listo": sistemas de gestión 80% hechos y 20% a medida, uno por rubro. Cada producto se llama "OPS lata" (APPLE OPS, INMO OPS, CLUB OPS, etc.).

Este repo tiene dos cosas separadas:

| Carpeta | Qué es | Stack | Deploy |
| --- | --- | --- | --- |
| raíz (`src/`, `public/`, `index.html`) | Sitio comercial y demos de todas las verticales | React + Vite, sin backend (datos en `localStorage`) | Proyecto de Vercel `enlata2` |
| [`apple-ops/`](apple-ops/) | APPLE OPS, la primera app real: gestión para locales que venden productos Apple | Next.js + TypeScript + Supabase + Vercel | Proyecto de Vercel aparte, con Root Directory `apple-ops` |

## Sitio y demos (raíz)

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

Rutas principales:

- `/`: landing comercial (`public/landing.html` dentro de `MarketingSite`).
- `/app/:productId`: demo de cada vertical (`apple`, `inmo`, `club`, `auto`, `restaurant`, `distribuidora`, `gym`, `academy`). Las verticales se definen en `src/config/products.js`; las que tienen pantalla propia están en `src/pages/`.
- `/checkout` y `/admin`: alta y cobros de la demo.

Todo es frontend: no hay base ni servidor, y los datos de demo se cargan solos en la primera visita. La facturación ARCA es simulada; el estado y los próximos pasos están en [docs/ARCA-FACTURACION.md](docs/ARCA-FACTURACION.md).

## APPLE OPS (`apple-ops/`)

Stock con IMEI, plan canje con tasación, accesorios, clientes, ventas y anulaciones, caja con conteo a ciegas, reportes, usuarios por rol con PIN de mostrador, catálogo público con cotizador de iPhone usado y asistente de chat (con IA opcional).

```bash
cd apple-ops
npm install
npx supabase start          # Postgres, Auth y API locales con migraciones y datos demo
npx supabase status -o env  # copiar las claves a .env.local
npm run dev                 # http://localhost:3000
```

- Cómo correrla, usuarios demo, tests y cómo está armada: [apple-ops/README.md](apple-ops/README.md).
- Reglas de negocio y estilo: [apple-ops/CLAUDE.md](apple-ops/CLAUDE.md).
- Publicar en Supabase y Vercel: [apple-ops/DEPLOY.md](apple-ops/DEPLOY.md).

Se construyó en 9 etapas, una PR por etapa: base y login, stock e ingresos, ventas y canje, accesorios y clientes, caja, reportes/usuarios/config, catálogo público, asistente de chat y deploy con fotos.

## CI

`.github/workflows/apple-ops.yml` corre lint, typecheck, tests unitarios y de base, build y Playwright contra un Supabase local, solo cuando cambia algo en `apple-ops/`. El sitio de la raíz no tiene CI.

## Para agentes de IA

Ver [AGENTS.md](AGENTS.md).
