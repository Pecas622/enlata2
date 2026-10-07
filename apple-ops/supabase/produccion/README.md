# Base para un Supabase nuevo, desde el navegador

Las mismas migraciones de `supabase/migrations`, juntas en dos archivos para pegar en **SQL Editor** sin instalar nada. Van en dos partes porque un valor nuevo de enum no se puede usar en la misma ejecución en que se agrega: primero `base-parte-1.sql`, después `base-parte-2.sql`, cada una en su propia query. Las dos registran las migraciones, así que un `supabase db push` posterior no las repite. No incluyen datos demo.

## Actualizaciones

Cada migración nueva trae su archivo `actualizacion-*.sql` para pegar en **SQL Editor** sobre una base que ya tiene las dos partes:

- `actualizacion-demo.sql`: botones "Cargar demo" y "Borrar demo" en Configuración (ya incluido en `base-parte-2.sql` para proyectos nuevos).
- `actualizacion-dolar-alertas.sql`: dólar automático (oficial, blue o MEP) y sección Alertas (ya incluido en `base-parte-2.sql`).
- `actualizacion-modulos.sql`: venta por módulos y `set_modulos` (ya incluido en `base-parte-2.sql`).
- `actualizacion-modulos-imei.sql`: canje y accesorios pasan a la base y se suma el módulo de stock con IMEI. Va después de `actualizacion-modulos.sql` (ya incluido en `base-parte-2.sql`).
