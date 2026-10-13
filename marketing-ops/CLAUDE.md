# MARKETING OPS — producción (Enlata2)

Segundo producto de Enlata2: la herramienta para que empresas, emprendimientos y agencias hagan su marketing. Marca y tono de cada negocio, generación de piezas (posts, carruseles, guiones de Reel, historias, anuncios, mensajes de WhatsApp y emails), circuito de aprobación, calendario con plan del mes, campañas con brief para Meta Ads y métricas con el análisis de qué funcionó. Marca: Enlata2, "Software que ya viene listo". Nombre de trabajo: MARKETING OPS (se cambia con `NEXT_PUBLIC_PRODUCT_NAME`).

Es independiente de APPLE OPS (`../apple-ops`): mismo stack y mismo estilo, otra base, otro proyecto de Vercel.

## Stack
Next.js (App Router) + TypeScript + Postgres vía Supabase (Auth + RLS) + Vercel. API de Anthropic solo desde el servidor. Tests con Vitest y Playwright.

## Reglas (no negociables)
- Interfaz en español rioplatense, con voseo.
- Todo vive dentro de un espacio de trabajo (`workspace_id`) y se lee con RLS: nadie ve marcas ni piezas de otro.
- Las tablas no se escriben directo: marcas y contenidos pasan por `save_brand`, `save_content`, `set_content_status`, `schedule_content`, `add_plan_ideas`, `save_campaign`, `set_content_campaign` y `save_results`, que validan el rol y dejan registro en `content_events` (y `campaign_events`) con usuario y hora. Una pieza solo entra en una campaña de su misma marca.
- Roles: Administrador (todo), Creador (genera, edita, manda a revisión y marca como publicada lo aprobado), Revisor (el dueño o el cliente: aprueba o pide cambios, no edita). La regla del circuito está dos veces, en `can_move` (SQL) y en `src/lib/workflow.ts`: si cambia una, cambiá la otra y sus tests.
- Una pieza aprobada que se edita vuelve a Borrador; si solo cambia de día (`schedule_content`) sigue aprobada. Una publicada no se edita ni se mueve.
- El generador nunca inventa precios, descuentos, plazos ni datos: usa la marca y lo que escribió la persona. Con `ANTHROPIC_API_KEY` escribe Claude (`src/lib/generator-ai.ts`, salida JSON con esquema); sin clave, o si la IA falla, escriben las plantillas (`src/lib/generator.ts`). Mantené los dos caminos. Toda variante pasa por `checkCopy` (largo por red, hashtags, palabras prohibidas, llamado a la acción, números que no estaban en el pedido).
- Los resultados se cargan solo en piezas publicadas (una fila por pieza en `content_results`). El análisis de métricas tiene dos caminos, como el generador: reglas (`src/lib/metrics.ts`, siempre) y Claude a pedido (`src/lib/insights-ai.ts`). La IA no puede usar números que no estén en los datos: `inventedNumbers` descarta los puntos que los tengan. Mantené los dos caminos.
- Fechas en el día local de Argentina (`src/lib/dates.ts`), nunca UTC pelado.
- Hooks de React antes de cualquier `return` condicional.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo en el servidor. Nunca commitees `.env*`.

## Estilo visual
El de APPLE OPS (fondo claro, fuente del sistema, tarjetas redondeadas) con acento índigo `#5E5CE6` para distinguir el producto.

## Forma de trabajar
- Por etapas; cada etapa se prueba antes de seguir. Las PRs se nombran `marketing-ops/etapa-N-...`.
- Lógica en funciones puras con su `*.test.ts` al lado; permisos probados contra la base en `tests/db/`.
- Migración nueva por cambio, con fecha en el nombre; nunca edites una aplicada. Después regenerá `supabase/produccion/base.sql` con `npm run db:produccion` y sumala a la tabla de `supabase/produccion/README.md`.
