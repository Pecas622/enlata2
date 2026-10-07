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
ANTHROPIC_API_KEY=...           # opcional: el asistente del catálogo responde con IA (solo servidor)
```

Sin `ANTHROPIC_API_KEY` el asistente responde con el motor de reglas, con los mismos datos.

### Usuarios demo

Contraseña `demo1234` para todos.

| Usuario | Email | Rol | PIN |
| --- | --- | --- | --- |
| Santiago | santiago@demo.apple-ops.test | Administrador | 1111 |
| Lucía | lucia@demo.apple-ops.test | Encargado | 2222 |
| Mati | mati@demo.apple-ops.test | Vendedor | 3333 |
| Caro | caro@demo.apple-ops.test | Cajero | 4444 |

Para volver a los datos demo: `npm run db:reset`.

### Demo para mostrarle a un cliente

En producción, el Administrador de un local vacío tiene en **Configuración → Demo para clientes** el botón "Cargar demo": carga equipos, accesorios, clientes y una semana de ventas y cajas. Para entregar el local, "Borrar demo" deja todo en cero y conserva el local, los usuarios, la configuración, la tabla de tasación y el catálogo. En una base que ya existe, la función se agrega pegando `supabase/produccion/actualizacion-demo.sql` en SQL Editor.


### Dólar automático y alertas

En **Configuración → Dólar y alertas** el Administrador elige si la cotización es manual o sale sola del dólar oficial, blue o MEP (precio de venta de DolarAPI), más un ajuste en pesos. Se actualiza cada media hora mientras alguien usa la app o mira el catálogo, y una vez por día con Vercel Cron (`/api/cron/cotizacion`, protegido con `CRON_SECRET` si está configurado). Si la consulta falla queda la última cotización. La sección **Alertas** (Administrador y Encargado) muestra equipos parados, equipos con precio por debajo del margen objetivo, accesorios a reponer y ventas de los últimos 30 días con margen bajo.

### Venta por módulos

Todo local tiene la base: ventas, stock con IMEI, ingresos, clientes, caja, usuarios y configuración. Encima se suman módulos: `canje` (plan canje y cotizador web), `accesorios`, `reportes`, `catalogo` (catálogo online), `asistente` (chat del catálogo, necesita `catalogo`) y `alertas` (alertas y dólar automático). Un local nuevo arranca con todos. Los cambia Enlata2 desde SQL Editor, con el link del catálogo del local:

```sql
select set_modulos('enlata2', array['canje', 'reportes']);  -- base + plan canje + reportes
select set_modulos('enlata2', array['canje', 'accesorios', 'reportes', 'catalogo', 'asistente', 'alertas']);  -- todo
```

Sin un módulo, sus secciones no aparecen en el menú (el Administrador las ve atenuadas en "Sumá a tu plan") y la base rechaza lo que el módulo cubre: canje y accesorios en las ventas, dólar automático, catálogo público, cotizador y asistente. **Configuración → Tu plan** muestra qué incluye el plan del local. Cada cambio queda en el historial como "Enlata2".

## Tests

```bash
npm test          # unitarios y permisos en la base (necesita Supabase levantado)
npm run build
npm run test:e2e  # Playwright: login, menú por rol, PIN, stock, ingresos, ventas, canje, accesorios, clientes, caja, catálogo y asistente
```

CI corre todo lo anterior en cada PR contra un Supabase local.

## Cómo está armado

- `supabase/migrations/`: esquema, vistas y políticas RLS. Los permisos por rol se aplican en la base: aunque alguien consulte Supabase directo, no recibe lo que su rol no ve.
- Los costos viven en tablas aparte (`device_costs`, `accessory_costs`, `sale_line_costs`) que solo leen Administrador y Encargado.
- El catálogo público lee únicamente las vistas `catalogo_publico`, `accesorios_publicos` y `catalogo_config_publica`, que no tienen costos, IMEI ni datos de clientes.
- Ventas, anulaciones, ingresos y caja no se escriben directo: pasan por funciones SQL transaccionales (`registrar_ingreso`, `editar_equipo`, `registrar_venta`, `anular_venta`, `guardar_accesorio`, `reponer_accesorio`, `carga_masiva_accesorios`, `guardar_cliente`, `abrir_caja`, `movimiento_caja`, `cerrar_caja`, `guardar_usuario`, `guardar_config`, `guardar_catalogo`, `catalogo_equipo`, `guardar_asistente`). Cada una deja registro con usuario y hora.
- `registrar_venta` recalcula totales con la cotización del local, tasa el canje con `tasar_canje` (la misma cuenta que `appraise()`), controla precio, descuento y tope de canje según el rol, descuenta stock, cobra por la caja abierta y deja historial y registro. `anular_venta` devuelve el stock, registra el egreso en caja y retira el equipo del canje.
- Caja: una sola abierta por local. `resumen_caja` devuelve el efectivo esperado y el desglose por medio de pago, salvo al Cajero, que cuenta a ciegas. `cerrar_caja` recalcula el esperado, guarda contado, diferencia y desglose, y exige motivo si hay diferencia (al Cajero no, porque no la ve).
- Usuarios y configuración: solo el Administrador. El alta crea la cuenta de Auth en el servidor (con la clave de servicio) y `guardar_usuario` guarda rol, comisión y PIN, cuidando que quede al menos un administrador activo. `guardar_config` actualiza el local, la cotización y la tabla de tasación en una sola operación.
- Reportes y dashboard calculan con funciones puras (`src/lib/reports.ts`). Los costos llegan solo a Administrador y Encargado, así que la ganancia no existe para los demás roles.
- Catálogo público en `/catalogo/<link>` y cotizador en `/catalogo/<link>/cotizar`, sin login. Solo leen vistas (`catalogo_publico`, `accesorios_publicos`, `catalogo_config_publica`, `tasacion_publica`, `catalogo_estado`) que nunca exponen costos, IMEI, clientes ni márgenes, y hay un test que lo verifica. El cotizador usa `appraise()` con la tabla de tasación del local (mejor caso: Usado A, sin fallas) y dice "vale hasta"; si el modelo no tiene valor, deriva a un asesor. Los toques en WhatsApp pasan por `/catalogo/<link>/wa`, que los cuenta (`registrar_consulta`) para el panel.
- Asistente de chat del catálogo (botón "Preguntanos"): el navegador habla con `/catalogo/<link>/asistente`, que corre en el servidor. Con `ANTHROPIC_API_KEY` responde Claude (`claude-opus-5-5`, esfuerzo bajo, con el modelo de respaldo automático de la API si el pedido es rechazado) usando las herramientas `buscar_stock`, `cotizar_canje`, `mostrar_equipos` y `derivar_a_asesor`, que solo leen vistas públicas. Si no hay clave, o la IA falla o tarda más de 12 s, responde el motor de reglas (`src/lib/assistant.ts`, réplica de `assistantStep()` del prototipo). Las cotizaciones de canje son rangos orientativos con `appraise()`; reclamos, descuentos, cuotas y equipos sin referencia se derivan a WhatsApp. Cada charla queda en el panel del catálogo (`registrar_chat`) y las opciones se guardan con `guardar_asistente`.
- Fotos del catálogo: se suben desde Catálogo online al bucket público `fotos-equipos` de Supabase Storage. La base valida rol y equipo (`catalogo_equipo_foto`) y el servidor sube el archivo con la clave de servicio; el navegador achica la foto a 1200 px antes de mandarla.
- Producción: ver [DEPLOY.md](DEPLOY.md). El primer local se crea con `npm run crear-local` (función `crear_local`, solo con la clave de servicio).
- Los datos demo traen seis días de ventas y cierres de caja, y la caja de hoy abierta.
- Login con email y contraseña. En el mostrador, "Cambiar usuario" pasa a otro usuario del mismo local con su PIN de 4 dígitos (5 intentos fallidos lo bloquean 5 minutos).
- Las altas de usuarios las hace el Administrador; el registro público está desactivado. En el Supabase de producción hay que desactivarlo también en Authentication → Sign In / Providers.

## Etapas

1. Base y login
2. Stock e ingresos
3. Ventas y plan canje
4. Accesorios y clientes
5. Caja
6. Reportes, usuarios y configuración
7. Catálogo público
8. Asistente de chat
9. Deploy en Vercel y fotos del catálogo ← esta
