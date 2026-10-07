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
npm run test:e2e  # Playwright: login, menú por rol, PIN, stock, ingresos, ventas, canje, accesorios y clientes
```

CI corre todo lo anterior en cada PR contra un Supabase local.

## Cómo está armado

- `supabase/migrations/`: esquema, vistas y políticas RLS. Los permisos por rol se aplican en la base: aunque alguien consulte Supabase directo, no recibe lo que su rol no ve.
- Los costos viven en tablas aparte (`device_costs`, `accessory_costs`, `sale_line_costs`) que solo leen Administrador y Encargado.
- El catálogo público lee únicamente las vistas `catalogo_publico`, `accesorios_publicos` y `catalogo_config_publica`, que no tienen costos, IMEI ni datos de clientes.
- Ventas, anulaciones, ingresos y caja no se escriben directo: pasan por funciones SQL transaccionales (`registrar_ingreso`, `editar_equipo`, `registrar_venta`, `anular_venta`, `guardar_accesorio`, `reponer_accesorio`, `carga_masiva_accesorios`, `guardar_cliente`; la caja en la etapa 5). Cada una deja registro con usuario y hora.
- `registrar_venta` recalcula totales con la cotización del local, tasa el canje con `tasar_canje` (la misma cuenta que `appraise()`), controla precio, descuento y tope de canje según el rol, descuenta stock, cobra por la caja abierta y deja historial y registro. `anular_venta` devuelve el stock, registra el egreso en caja y retira el equipo del canje.
- Los datos demo traen seis días de ventas y cierres de caja, y la caja de hoy abierta.
- Login con email y contraseña. En el mostrador, "Cambiar usuario" pasa a otro usuario del mismo local con su PIN de 4 dígitos (5 intentos fallidos lo bloquean 5 minutos).
- Las altas de usuarios las hace el Administrador; el registro público está desactivado. En el Supabase de producción hay que desactivarlo también en Authentication → Sign In / Providers.

## Etapas

1. Base y login
2. Stock e ingresos
3. Ventas y plan canje
4. Accesorios y clientes ← esta
5. Caja
6. Reportes, usuarios y configuración
7. Catálogo público
8. Asistente
9. Deploy en Vercel
