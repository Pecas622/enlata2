# MARKETING OPS — producción (Enlata2)

Segundo producto de Enlata2: la herramienta para que empresas, emprendimientos y agencias hagan su marketing. Marca y tono de cada negocio, generación de piezas (posts, carruseles, guiones de Reel, historias, anuncios, mensajes de WhatsApp y emails), circuito de aprobación, calendario con plan del mes, campañas con brief para Meta Ads, métricas con el análisis de qué funcionó e investigación con IA de la competencia y el rubro. Marca: Enlata2, "Software que ya viene listo". Nombre de trabajo: MARKETING OPS (se cambia con `NEXT_PUBLIC_PRODUCT_NAME`).

Es independiente de APPLE OPS (`../apple-ops`): mismo stack y mismo estilo, otra base, otro proyecto de Vercel.

## Stack
Next.js (App Router) + TypeScript + Postgres vía Supabase (Auth + RLS) + Vercel. API de Anthropic solo desde el servidor. Tests con Vitest y Playwright.

## Reglas (no negociables)
- Interfaz en español rioplatense, con voseo.
- Todo vive dentro de un espacio de trabajo (`workspace_id`) y se lee con RLS: nadie ve marcas ni piezas de otro.
- Las tablas no se escriben directo: marcas y contenidos pasan por `save_brand`, `save_content`, `set_content_status`, `schedule_content`, `add_plan_ideas`, `save_campaign`, `set_content_campaign`, `save_results`, `save_research`, `add_research_idea`, `save_plan`, `add_plan_pieces`, `copy_content`, `delete_content`, `invite_member`, `cancel_invitation`, `accept_invitation`, `create_own_workspace`, `update_member` y `use_ai`, que validan el rol y dejan registro en `content_events` (y `campaign_events` o `team_events`) con usuario y hora. Una pieza solo entra en una campaña de su misma marca.
- Roles: Administrador (todo), Creador (genera, edita, manda a revisión y marca como publicada lo aprobado), Revisor (el dueño o el cliente: aprueba o pide cambios, no edita). La regla del circuito está dos veces, en `can_move` (SQL) y en `src/lib/workflow.ts`: si cambia una, cambiá la otra y sus tests.
- Un Revisor puede tener marcas elegidas (`profiles.brand_ids`, el cliente de una agencia): solo ve esas, y se aplica con `can_see_brand` en el RLS de cada tabla. Si sumás una tabla con `brand_id`, su política de lectura tiene que usarlo.
- Planes y límites: `plans` define el tope de marcas, personas (activas más invitaciones pendientes) y acciones con IA por mes. Marcas y personas los frenan triggers en la base; cada llamada a Claude pasa antes por `takeAi` (`src/lib/usage.ts` → `use_ai`), y sin cupo se usan las reglas y plantillas con un aviso. Toda función nueva con IA tiene que pasar por `takeAi`.
- Quien se registra sin invitación crea su propio espacio en el plan Prueba (`create_own_workspace`); con invitación, entra al espacio que lo invitó (`accept_invitation`). Las dos corren desde `getCurrentUser` cuando el usuario no tiene perfil.
- Una pieza aprobada que se edita vuelve a Borrador; si solo cambia de día (`schedule_content`) sigue aprobada. Una publicada no se edita, no se mueve ni se borra; borrar deja registro en `content_deletions`.
- El generador nunca inventa precios, descuentos, plazos ni datos: usa la marca y lo que escribió la persona. Con `ANTHROPIC_API_KEY` escribe Claude (`src/lib/generator-ai.ts`, salida JSON con esquema); sin clave, o si la IA falla, escriben las plantillas (`src/lib/generator.ts`). Mantené los dos caminos. Toda variante pasa por `checkCopy` (largo por red, hashtags, palabras prohibidas, llamado a la acción, números que no estaban en el pedido).
- Los resultados se cargan solo en piezas publicadas (una fila por pieza en `content_results`). El análisis de métricas tiene dos caminos, como el generador: reglas (`src/lib/metrics.ts`, siempre) y Claude a pedido (`src/lib/insights-ai.ts`). La IA no puede usar números que no estén en los datos: `inventedNumbers` descarta los puntos que los tengan. Mantené los dos caminos.
- La investigación (`src/lib/research-ai.ts`) usa la búsqueda web de Claude y pide el JSON en el texto (la búsqueda no se combina con la salida con esquema). Todo pasa por `parseResearch`: tendencias y competidores sin una fuente que la búsqueda haya encontrado se descartan, y las ideas no pueden traer precios, porcentajes ni cuotas. Se guarda con `save_research` y sus ideas pasan al calendario con `add_research_idea`, que lee la idea de la base, no del navegador. Sin clave, `ruleIdeas`. Mantené los dos caminos.
- El plan del mes (`src/lib/planner.ts`, `src/lib/planner-ai.ts`) toma las fechas de `suggestPlan` (frecuencia, días libres, fechas comerciales); la IA decide qué va en cada una y escribe las piezas, y todo pasa por `parseStrategy` y `parsePieces`: lo que no sirve se completa con reglas y plantillas, nunca se guarda sin controlar. Se guarda con `save_plan` y las piezas pasan al calendario con `add_plan_pieces`, que las lee de la base. Sin clave, `rulePlan`. El horario es una sugerencia de referencia, no una programación. Mantené los dos caminos.
- Fechas en el día local de Argentina (`src/lib/dates.ts`), nunca UTC pelado.
- Hooks de React antes de cualquier `return` condicional.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo en el servidor. Nunca commitees `.env*`.

## Estilo visual
El de APPLE OPS (fondo claro, fuente del sistema, tarjetas redondeadas) con acento índigo `#5E5CE6` para distinguir el producto.

## Forma de trabajar
- Por etapas; cada etapa se prueba antes de seguir. Las PRs se nombran `marketing-ops/etapa-N-...`.
- Lógica en funciones puras con su `*.test.ts` al lado; permisos probados contra la base en `tests/db/`.
- Migración nueva por cambio, con fecha en el nombre; nunca edites una aplicada. Después regenerá `supabase/produccion/base.sql` con `npm run db:produccion` y sumala a la tabla de `supabase/produccion/README.md`.
