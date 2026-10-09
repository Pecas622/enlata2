# Base para un Supabase nuevo, desde el navegador

Las mismas migraciones de `supabase/migrations`, juntas en dos archivos para pegar en **SQL Editor** sin instalar nada. Van en dos partes porque un valor nuevo de enum no se puede usar en la misma ejecución en que se agrega: primero `base-parte-1.sql`, después `base-parte-2.sql`, cada una en su propia query. Las dos registran las migraciones, así que un `supabase db push` posterior no las repite. No incluyen datos demo.

## Actualizaciones

Cada migración nueva trae su archivo `actualizacion-*.sql` para pegar en **SQL Editor** sobre una base que ya tiene las dos partes:

- `actualizacion-demo.sql`: botones "Cargar demo" y "Borrar demo" en Configuración (ya incluido en `base-parte-2.sql` para proyectos nuevos).
- `actualizacion-dolar-alertas.sql`: dólar automático (oficial, blue o MEP) y sección Alertas (ya incluido en `base-parte-2.sql`).
- `actualizacion-modulos.sql`: venta por módulos y `set_modulos` (ya incluido en `base-parte-2.sql`).
- `actualizacion-modulos-imei.sql`: canje y accesorios pasan a la base y se suma el módulo de stock con IMEI. Va después de `actualizacion-modulos.sql` (ya incluido en `base-parte-2.sql`).
- `actualizacion-suscripciones.sql`: venta online del plan y de los módulos con Mercado Pago (precios, alta pendiente de pago y suscripciones). Va después de `actualizacion-modulos-imei.sql` (ya incluido en `base-parte-2.sql`).
- `actualizacion-facturacion.sql`: módulo de facturación electrónica con ARCA (datos fiscales, certificado y facturas). Va después de `actualizacion-suscripciones.sql` (ya incluido en `base-parte-2.sql`).
- `actualizacion-precios-base.sql`: base a $45.900 con stock con IMEI y alertas incluidos, reportes a $6.900; los locales nuevos nacen con IMEI y alertas. Va después de `actualizacion-facturacion.sql` (ya incluido en `base-parte-2.sql`).
