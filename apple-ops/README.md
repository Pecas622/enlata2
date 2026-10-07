# APPLE OPS

Vive en la carpeta `apple-ops/` del repo enlata2, separada del sitio de demos.

Software de gestión para locales de venta de productos Apple: stock con IMEI, plan canje, accesorios, caja y catálogo público. Es la versión real del prototipo que está en `reference/`. Las reglas del proyecto están en `CLAUDE.md`.

Stack: Next.js (App Router) + TypeScript, Supabase (Postgres, Auth, RLS), Vercel. Tests con Vitest y Playwright.

## Correr en tu máquina

Necesitás Node 22 y Docker (para Supabase local).

```bash
cd apple-ops
npm install
npx supabase start          # levanta Postgres, Auth y la API, aplica migraciones y seed
npx supabase status -o env  # copiá API_URL, ANON_KEY y SERVICE_ROLE_KEY a .env.local
npm run dev
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # solo servidor, nunca en el navegador
```

### Usuarios demo

Contraseña `demo1234` para todos.

| Usuario | Email | Rol | PIN |
| --- | --- | --- | --- |
| Santiago | santiago@demo.apple-ops.test | Administrador | 1111 |
| Lucía | lucia@demo.apple-ops.test | Encargado | 2222 |
| Mati | mati@demo.apple-ops.test | Vendedor | 3333 |
| Caro | caro@demo.apple-ops.test | Cajero | 4444 |

Para volver a los datos demo: `npm run db:reset`.

## Tests

```bash
npm test          # unitarios y permisos en la base (necesita Supabase levantado)
npm run build
npm run test:e2e  # Playwright: login, menú por rol, cambio de usuario con PIN
```

CI corre todo lo anterior en cada PR contra un Supabase local.

## Cómo está armado

- `supabase/migrations/`: esquema, vistas y políticas RLS. Los permisos por rol se aplican en la base: aunque alguien consulte Supabase directo, no recibe lo que su rol no ve.
- Los costos viven en tablas aparte (`device_costs`, `accessory_costs`, `sale_line_costs`) que solo leen Administrador y Encargado.
- El catálogo público lee únicamente las vistas `catalogo_publico`, `accesorios_publicos` y `catalogo_config_publica`, que no tienen costos, IMEI ni datos de clientes.
- Ventas, anulaciones, ingresos y caja no se escriben directo: se harán con funciones SQL transaccionales (etapas 2 a 5).
- Login con email y contraseña. En el mostrador, "Cambiar usuario" pasa a otro usuario del mismo local con su PIN de 4 dígitos (5 intentos fallidos lo bloquean 5 minutos).
- Las altas de usuarios las hace el Administrador; el registro público está desactivado. En el Supabase de producción hay que desactivarlo también en Authentication → Sign In / Providers.

## Etapas

1. Base y login ← esta
2. Stock e ingresos
3. Ventas y plan canje
4. Accesorios y clientes
5. Caja
6. Reportes, usuarios y configuración
7. Catálogo público
8. Asistente
9. Deploy en Vercel
