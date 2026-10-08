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
MP_ACCESS_TOKEN=...             # opcional: cobro online del plan y los módulos con Mercado Pago (solo servidor)
MP_WEBHOOK_SECRET=...           # opcional: firma de las notificaciones de Mercado Pago (solo servidor)
NEXT_PUBLIC_PRODUCT_NAME=...    # opcional: nombre del producto en la landing (por defecto APPLE OPS)
NEXT_PUBLIC_SALES_WHATSAPP=...  # opcional: WhatsApp de ventas con código de país; muestra "Pedí una demo" en la landing
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

Todo local tiene la base: ventas, stock, ingresos, plan canje, accesorios, clientes, caja, usuarios y configuración. Encima se suman módulos: `imei` (stock con IMEI o serie obligatorio y sin repetidos; sin él el número es opcional), `reportes`, `catalogo` (catálogo online y cotizador web), `asistente` (chat con IA del catálogo, necesita `catalogo`) y `alertas` (alertas y dólar automático). Un local nuevo arranca con todos. Los cambia Enlata2 desde SQL Editor, con el link del catálogo del local:

```sql
select set_modulos('enlata2', array['imei', 'reportes']);  -- base + IMEI + reportes
select set_modulos('enlata2', array['imei', 'reportes', 'catalogo', 'asistente', 'alertas']);  -- todo
```

Sin un módulo, sus secciones no aparecen en el menú (el Administrador las ve atenuadas en "Sumá a tu plan") y la base rechaza lo que el módulo cubre: dólar automático, catálogo público y asistente; sin `imei`, el ingreso y el canje aceptan equipos sin número. **Configuración → Tu plan** muestra qué incluye el plan del local. Cada cambio queda en el historial como "Enlata2".

### Landing de venta

`/` es la landing para quien no inició sesión (con sesión va directo al dashboard). Sigue la presentación comercial: problema, qué hace, stock, canje, caja, roles, dashboard, catálogo y asistente, confianza, precios y preguntas. Los precios salen de `plan_prices` en el momento y todos los botones llevan a `/alta`. El nombre del producto y el WhatsApp de ventas están en `src/lib/brand.ts` (o en las variables `NEXT_PUBLIC_PRODUCT_NAME` y `NEXT_PUBLIC_SALES_WHATSAPP`). Las capturas de `public/landing/` son de la demo. Para regenerarlas, sacalas con los datos del seed y convertilas a WebP de 1600 px de ancho (780 px las del celular). Solo dice lo que el sistema hace hoy: si cambia una función, revisá `src/app/_landing/Landing.tsx`.

### Venta online del plan

Con `MP_ACCESS_TOKEN`, el plan y los módulos se venden solos con suscripciones mensuales de Mercado Pago (preapproval):

- **`/alta`** (pública, el link de la landing): muestra los precios y crea la cuenta del administrador y el local (`crear_local_pendiente`: sin módulos y con `billing_status = 'pendiente'`). Después manda a pagar el plan base a Mercado Pago.
- Un local que no está `activo` no entra a la app: va a **`/plan`**, que es también la vuelta desde Mercado Pago. Ahí se consulta el estado de las suscripciones pendientes en el momento y, si el pago está confirmado, entra.
- **Configuración → Tu plan**: el Administrador ve el precio de cada módulo que le falta y lo suma con "Sumar por $X/mes". El módulo se prende cuando Mercado Pago autoriza la suscripción.
- **`/api/mercadopago`** recibe las notificaciones (`subscription_preapproval`) y vuelve a pedir el estado a la API, así que una notificación falsa no activa nada; con `MP_WEBHOOK_SECRET` además exige la firma. `aplicar_suscripcion` aplica el estado: plan base activa o suspende el local (`suspendido` si se cancela o se pausa; los datos quedan), módulo lo prende o lo apaga. Queda en el historial como "Mercado Pago".
- Precios por mes en `plan_prices` (públicos). Arrancan con precios de lanzamiento (base $29.900; IMEI, reportes y alertas $4.900; catálogo $7.900; asistente $20.000). Cambiar `plan_prices` solo afecta a las suscripciones nuevas: para un aumento que llegue también a los clientes actuales, `npm run ajustar-precios -- --porcentaje 15 --env .env.produccion` muestra qué haría, y con `--aplicar` sube los precios de lista y el monto de cada suscripción en Mercado Pago (redondeado a $100). Avisá a los clientes antes del próximo cobro.

Sin `MP_ACCESS_TOKEN`, `/alta` avisa que el cobro online no está configurado y Tu plan sigue diciendo que los módulos se piden a Enlata2. Los locales creados con `crear-local` y los módulos de `set_modulos` no dependen de Mercado Pago. Los e2e usan un Mercado Pago de mentira (`tests/e2e/mp-mock.mjs`).

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
