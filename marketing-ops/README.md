# MARKETING OPS

Vive en la carpeta `marketing-ops/` del repo enlata2, separada del sitio de demos y de APPLE OPS.

Herramienta de marketing para empresas, emprendimientos y agencias: cada negocio carga su marca una vez (qué vende, a quién le habla, por qué lo eligen, cómo habla) y desde ahí genera piezas para cada red, las pasa por aprobación y las deja listas para publicar. Las reglas del proyecto están en `CLAUDE.md`.

Stack: Next.js (App Router) + TypeScript, Supabase (Postgres, Auth, RLS), Vercel. Tests con Vitest y Playwright.

## Módulos y etapas

| Etapa | Módulo | Qué hace | Estado |
| --- | --- | --- | --- |
| 1 | Base | Login, espacio de trabajo con varias marcas, roles Administrador, Creador y Revisor | Hecho |
| 1 | Marca y negocio | Rubro, ciudad, qué hace, productos, público, por qué la eligen, tono, palabras prohibidas, llamado a la acción, hashtags, redes, color | Hecho |
| 1 | Generador de piezas | Post, carrusel, guion de Reel o TikTok, historia, anuncio de Meta, mensaje de WhatsApp y email. 3 variantes con ángulos distintos, con IA o con plantillas, chequeadas contra los límites de cada red | Hecho |
| 1 | Contenidos y aprobación | Biblioteca con filtros, edición, vista previa tipo celular, circuito Idea → Borrador → En revisión → Aprobado → Publicado con historial y pedido de cambios | Hecho |
| 2 | Calendario | Mes con las piezas por día, marca, red y estado; arrastrar para reprogramar (una aprobada sigue aprobada); semanas flojas marcadas; fechas comerciales de Argentina; plan del mes que sugiere ideas con fecha y se escriben con el generador en la misma pieza. En el celular se ve como agenda | Hecho |
| 3 | Campañas | Objetivo, fechas, presupuesto en pesos y público; agrupa piezas de la marca (sumar existentes o generar desde la campaña) con su avance; brief para Meta Ads con objetivo sugerido según vendas por web o por WhatsApp, presupuesto por día, segmentación, ubicaciones según los formatos y los textos de los anuncios, para copiar | Hecho |
| 4 | Métricas | Carga de resultados en cada pieza publicada (alcance, interacciones, clics, consultas, ventas e inversión); tablero por período y marca con la comparación contra el período anterior, desglose por formato y por red, resultados por campaña con costo por consulta; análisis de qué funcionó, qué no y qué repetir el mes que viene, por reglas o con IA (que no puede usar números que no estén en los datos) | Hecho |
| 5 | Investigar | Antes de escribir, Claude busca en internet qué publica la competencia y de qué se habla en el rubro y la ciudad de la marca, y propone ideas. Cada tendencia y cada competidor trae las páginas de donde sale; lo que no tiene fuente real se descarta, y las ideas no pueden traer precios ni descuentos. Las investigaciones quedan guardadas y sus ideas pasan al calendario o al generador. Sin clave de IA, ideas para arrancar con las fechas que vienen y lo que vende la marca | Hecho |
| 6 | Plan mensual con IA | La marca suma objetivos, redes, publicaciones por semana, presupuesto, mercado e identidad visual. El plan del mes trae, para cada fecha libre, horario sugerido, red, formato, objetivo, tema, gancho, guion o estructura, texto, llamado a la acción, recursos y por qué se propone. Con IA, Claude decide el mes con la investigación y lo que funcionó, y escribe cada pieza; sin clave o si falla, reglas y plantillas. Las piezas elegidas entran al calendario como borradores y siguen el circuito de aprobación. El calendario suma vistas semanal y diaria con filtros por red y estado, y cada pieza se puede duplicar, adaptar a otra red, regenerar o borrar (si no está publicada) desde la pieza o desde la vista del día | Hecho |
| 7 | Inicio, equipo y límites | El inicio responde tres preguntas: cómo está funcionando la marca (últimos 30 días contra los anteriores), qué hay que publicar hoy (por horario, con lo aprobado que quedó atrasado) y qué conviene hacer para mejorar (aprobaciones, atrasos, semanas con menos publicaciones que las de la marca, resultados sin cargar y lo que dice el análisis). Cada negocio crea su cuenta desde `/registro` y queda como Administrador de su espacio; invita a su equipo con un link, elige el rol y, para el cliente de una agencia, qué marcas ve (aplicado con RLS). Planes Prueba, Emprendedor y Agencia con tope de marcas, personas y acciones con IA por mes: sin cupo, todo sigue con reglas y plantillas | Hecho |
| 8 | Redes y archivos | Panel Redes: cada marca conecta su cuenta profesional de Instagram con el inicio de sesión oficial de Instagram; el permiso queda cifrado y se prueba y renueva desde el panel (Facebook y TikTok, próximamente). Logo, fotos y videos de cada marca y de cada pieza en un espacio privado, con tope por plan | Hecho |
| 9 | Publicación | Publicar y programar en Instagram (y después TikTok y Facebook), estados Programado y Error, publicado solo con confirmación de la red | |

## Correr en tu máquina

Necesitás Node 22 y Docker (para Supabase local). Los puertos no chocan con APPLE OPS: la API local está en 55321 y la app en 3100.

```bash
cd marketing-ops
npm install
npx supabase start          # Postgres, Auth y API con migraciones y datos demo
npx supabase status -o env  # copiá API_URL, ANON_KEY y SERVICE_ROLE_KEY a .env.local
npm run dev                 # http://localhost:3100
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # solo para los tests de base; la app no la usa
ANTHROPIC_API_KEY=...           # opcional: el generador escribe con Claude (solo servidor)
INSTAGRAM_APP_ID=...            # opcional: para conectar Instagram (ver supabase/produccion/README.md)
INSTAGRAM_APP_SECRET=...        # opcional, solo servidor
TOKENS_KEY=...                  # con Instagram: openssl rand -base64 32 (solo servidor)
NEXT_PUBLIC_PRODUCT_NAME=...    # opcional: nombre del producto (por defecto MARKETING OPS)
```

### Usuarios demo

Contraseña `demo1234` para todos. El espacio "Estudio Demo" tiene dos marcas (La Espiga, panadería, y Rodar Bikes, bicicletería) y piezas en todos los estados.

| Usuario | Email | Rol |
| --- | --- | --- |
| Santiago | santiago@demo.marketing-ops.test | Administrador |
| Lucía | lucia@demo.marketing-ops.test | Creador |
| Mati | mati@demo.marketing-ops.test | Revisor |
| Carla | carla@demo.marketing-ops.test | Revisor que solo ve La Espiga (la clienta de la agencia) |

Para volver a los datos demo: `npm run db:reset`.

## Cómo está armado

- `src/app/(app)/`: pantallas con login. `inicio` (lo que espera aprobación, lo listo para publicar, borradores), `generar`, `contenidos` y `contenidos/[id]` (editor, vista previa, circuito e historial), `calendario` y `calendario/plan`, `campanas` (lista, alta y detalle con piezas y brief), `marca`.
- `src/lib/channels.ts`: canales, formatos por canal, límites de cada red y `checkCopy`, que avisa largo, hashtags de más, palabras que la marca evita, falta de llamado a la acción y precios o porcentajes que no estaban en el pedido.
- `src/lib/generator.ts`: generador por plantillas. Tres ángulos por objetivo y una estructura por formato (placas del carrusel, escenas del Reel con tiempos, campos del anuncio, asunto del email). Emojis solo si el tono es Cercano o Divertido.
- `src/lib/generator-ai.ts`: el mismo pedido a Claude con salida JSON con esquema. Si falla o tarda más de 40 s, la acción usa las plantillas y lo avisa en pantalla.
- `src/lib/calendar.ts`: grilla del mes, fechas comerciales argentinas (las móviles calculadas: Día de la Madre, del Padre, de las Infancias, Pascuas, Carnaval, Black Friday), semanas flojas y `suggestPlan`, que arma el plan del mes sin pisar días ocupados ni repetir una fecha que ya tiene pieza.
- `src/lib/campaigns.ts`: estado por fechas, presupuesto por día, avance y `buildBrief`, que arma el brief para Meta Ads. Usa los anuncios escritos de la campaña y, si no hay, propone textos con las plantillas; lo que sale de la marca y no de la campaña (ubicación, intereses) se marca como sugerido.
- `src/lib/planner.ts` y `src/lib/planner-ai.ts`: el plan del mes completo. Las fechas salen de `suggestPlan` con la frecuencia y las redes de la marca. Claude decide en un paso qué va en cada fecha (`parseStrategy`: solo fechas dadas, redes de la marca y temas sin ofertas inventadas) y en otro escribe las piezas en tandas en paralelo (`parsePieces`: lo que se pasa de largo, inventa precios o usa palabras prohibidas se escribe con plantillas). Sin clave, `rulePlan`.
- `src/lib/research.ts` y `src/lib/research-ai.ts`: la investigación. Claude con búsqueda web (`web_search`) devuelve tendencias, competencia e ideas con sus fuentes; `parseResearch` descarta lo que cita páginas que la búsqueda no encontró y las ideas con precios, porcentajes o cuotas inventados. Sin clave, `ruleIdeas` propone ideas con las fechas comerciales y los productos de la marca.
- `src/lib/workflow.ts` y `src/lib/roles.ts`: circuito de aprobación y permisos para la interfaz.
- `supabase/migrations/`: esquema, RLS y funciones `save_brand`, `save_content`, `set_content_status`, `can_move`, `schedule_content` (reprogramar sin tocar el estado) `add_plan_ideas` (todas las ideas del plan en una transacción), `save_campaign` y `set_content_campaign`.

### Base de datos

Tablas, funciones, permisos y cómo armar la base en un Supabase nuevo (SQL para pegar y primer usuario): [supabase/produccion/README.md](supabase/produccion/README.md).

### Generador con IA

Con `ANTHROPIC_API_KEY` cada "Generar" es una llamada a Claude (`claude-opus-5-5` con esfuerzo bajo), que tiene costo por uso. El modelo recibe la marca y el pedido, y tiene prohibido inventar ofertas; igual, `checkCopy` marca cualquier precio o porcentaje que no esté en lo que escribió la persona.

"Armar plan con IA" hace una llamada para decidir el mes y una por cada 5 piezas (en paralelo), con esfuerzo bajo. Tarda entre medio minuto y dos minutos y cada plan queda guardado.

"Investigar con IA" es más cara que generar: hace hasta 6 búsquedas web (que se cobran aparte de los tokens) y puede tardar uno o dos minutos. Por eso se pide a mano y cada resultado queda guardado.

## Tests

```bash
npm run lint
npm run typecheck
npm test            # lógica pura (src/lib/*.test.ts) y permisos en la base (tests/db/), con Supabase levantado
npm run build
npm run test:e2e    # Playwright: generar, guardar, revisión, pedir cambios, aprobar y publicar
```

## Deploy

Igual que APPLE OPS (ver `../apple-ops/DEPLOY.md`), con otro proyecto de Supabase y otro proyecto de Vercel con Root Directory `marketing-ops`. Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y, si querés IA, `ANTHROPIC_API_KEY`. El esquema se aplica con `npx supabase db push` desde esta carpeta (nunca el seed).
