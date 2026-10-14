# Base de datos de MARKETING OPS

Todo lo que necesitás para tener la base de MARKETING OPS en un proyecto de Supabase: el SQL para pegar, cómo crear el primer usuario, cómo actualizarla y qué hay adentro.

## Archivos

| Archivo | Para qué |
| --- | --- |
| `base.sql` | La base completa (tablas, permisos y funciones) en un solo archivo, para pegar en **SQL Editor** de un Supabase nuevo. Son las migraciones de `supabase/migrations` en orden, y al final quedan registradas, así que un `npx supabase db push` posterior no las repite. No trae datos demo. |
| `primer-usuario.sql` | Crea el espacio de trabajo y deja a un usuario como Administrador. |
| `../migrations/*.sql` | Las migraciones una por una: es lo que aplica `npx supabase db push`. |
| `datos-demo.sql` | Carga las marcas de ejemplo (La Espiga y Rodar Bikes) con piezas, campañas, resultados e investigación en el espacio de trabajo de producción, a nombre de su Administrador, para ver la app funcionando. No crea usuarios. Sale del seed con `npm run db:demo`. |
| `borrar-datos-demo.sql` | Saca lo que cargó `datos-demo.sql` (las dos marcas demo y todo lo que cuelga de ellas) sin tocar lo tuyo. |
| `../seed.sql` | Datos demo (Estudio Demo, La Espiga, Rodar Bikes y tres usuarios con contraseña `demo1234`). Solo para la base local: **no lo corras en producción**. |

## Base nueva, paso a paso

1. En [supabase.com](https://supabase.com) creá un proyecto. La región más cercana para Argentina es São Paulo.
2. **SQL Editor > New query**: pegá todo `base.sql` y tocá **Run**. Tiene que ser un proyecto **nuevo y vacío**, nunca el de APPLE OPS: comparten nombres (`profiles`, `user_role`, `is_admin`, `dia_ar`) y le cambiaría los permisos. Por eso `base.sql` arranca con un freno: si la base ya tiene tablas, corta con un error y no aplica nada.
3. **Authentication > Users > Add user > Create new user**: cargá tu email y una contraseña, y tildá **Auto Confirm User**.
4. **SQL Editor**: abrí `primer-usuario.sql`, cambiá el email, tu nombre y el nombre de la empresa o agencia, y corrélo.
5. **Authentication > URL Configuration**: en **Site URL** poné la dirección de la app en Vercel.
6. En el proyecto de Vercel de MARKETING OPS, cargá las variables y hacé un redeploy:

   | Variable | De dónde sale |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API > Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API > clave `anon` / publishable |
   | `ANTHROPIC_API_KEY` | Opcional. Con ella el generador escribe con Claude, el análisis de métricas usa IA y se puede investigar en internet; sin ella, plantillas y reglas. Solo servidor. |
   | `NEXT_PUBLIC_PRODUCT_NAME` | Opcional. El nombre que se muestra (por defecto MARKETING OPS). |

   La app no usa `SUPABASE_SERVICE_ROLE_KEY`: esa clave queda solo para los tests locales.

Para sumar a otra persona, creá su usuario igual que en el paso 3 y usá el bloque comentado al final de `primer-usuario.sql`, con su rol: Administrador, Creador o Revisor.

## Base que ya existe

Cada etapa nueva trae su migración, y hay que aplicarla **antes** de mergear la PR que la usa. Desde `marketing-ops`:

```bash
npx supabase link --project-ref <ref-del-proyecto>   # una sola vez
npx supabase db push                                 # aplica solo las que faltan
```

Sin instalar nada: en SQL Editor pegá, en orden, los archivos de `supabase/migrations` que todavía no corriste. Para saber cuáles ya están: `select version, name from supabase_migrations.schema_migrations order by version;`.

Si agregás una migración, regenerá `base.sql` con `npm run db:produccion`.

## Qué hay adentro

Todo cuelga de un **espacio de trabajo**: la empresa, el emprendimiento o la agencia. Cada tabla tiene `workspace_id`, y con RLS cada usuario lee solo lo de su espacio. Ninguna tabla se escribe directo, ni siquiera el Administrador: todo pasa por funciones SQL que validan el rol y dejan registro con usuario y hora.

### Tablas

| Tabla | Qué guarda |
| --- | --- |
| `workspaces` | Los espacios de trabajo. |
| `profiles` | Las personas: una por usuario de Supabase Auth, con su espacio, su nombre, su rol y si está activa. |
| `brands` | Las marcas: rubro, ciudad, qué hace, público, por qué la eligen, productos, tono, palabras que no usa, llamado a la acción, hashtags, redes y color; y para planificar, objetivos, redes donde publica, publicaciones por semana, presupuesto mensual de publicidad, mercado e identidad visual. |
| `contents` | Las piezas: marca, red, formato, objetivo, tema, título, texto, hashtags, llamado a la acción, estado, fecha de publicación, horario sugerido, gancho, guion o estructura, recursos, por qué se propone, origen (IA, plantilla o manual), campaña y quién la creó y editó. |
| `content_events` | El historial de cada pieza: quién la creó, editó, mandó a revisión, aprobó, pidió cambios, publicó, reprogramó, sumó a una campaña o le cargó resultados. |
| `campaigns` | Las campañas: marca, nombre, objetivo, fechas, presupuesto en pesos, oferta, público, zona, edades, intereses y notas. |
| `campaign_events` | El historial de cada campaña. |
| `content_plans` | Los planes del mes de cada marca: mes, si lo armó la IA o las plantillas, la estrategia en pocas frases, las piezas propuestas (con la pieza creada si pasó al calendario), quién y cuándo. |
| `content_deletions` | Registro de las piezas borradas (su historial se va con ellas): qué pieza, de qué marca, título, estado, fecha, quién y cuándo. |
| `brand_research` | Las investigaciones con IA de cada marca: qué se pidió mirar, resumen, tendencias del rubro, competencia, ideas (con la pieza creada si se pasó al calendario), fuentes, quién y cuándo. |
| `content_results` | Los resultados de cada pieza publicada: personas alcanzadas, interacciones, clics, consultas, ventas, inversión en pesos y una nota. Una fila por pieza. |

Valores fijos (enums): roles `Administrador`, `Creador` y `Revisor`; estados `Idea`, `Borrador`, `En revisión`, `Aprobado` y `Publicado`; redes Instagram, Facebook, TikTok, LinkedIn, WhatsApp y Email; formatos Post, Carrusel, Reel, Historia, Anuncio y Mensaje; objetivos Vender, Conseguir consultas, Lanzamiento, Promoción, Comunidad y Educar.

### Funciones (la única forma de escribir)

| Función | Qué hace | Quién puede |
| --- | --- | --- |
| `save_brand(id, datos)` | Crea o edita una marca. | Administrador |
| `save_content(id, datos)` | Crea o edita una pieza. Sin texto nace como Idea; con texto, como Borrador. Si se edita una aprobada, vuelve a Borrador. Una publicada no se edita. | Administrador y Creador |
| `set_content_status(id, estado, nota)` | Mueve una pieza en el circuito según `can_move`. Pedir cambios la vuelve a Borrador con una nota. | Según el paso: el Creador manda a revisión y publica lo aprobado; el Revisor aprueba o pide cambios; el Administrador hace todo |
| `schedule_content(id, día)` | Cambia la pieza de día o la saca del calendario sin tocar su estado: una aprobada sigue aprobada. | Administrador y Creador |
| `add_plan_ideas(marca, ideas)` | Guarda las ideas del plan del mes en una sola transacción: si una está mal, no se guarda ninguna. | Administrador y Creador |
| `save_campaign(id, datos)` | Crea o edita una campaña. Valida fechas y presupuesto. La marca no se cambia después. | Administrador y Creador |
| `set_content_campaign(pieza, campaña)` | Suma o saca una pieza de una campaña. Tienen que ser de la misma marca. | Administrador y Creador |
| `save_results(pieza, datos)` | Carga o corrige los resultados de una pieza publicada. Valida que sean números enteros y no negativos. | Administrador y Creador |
| `save_research(marca, datos)` | Guarda una investigación ya validada en el servidor. | Administrador y Creador |
| `add_research_idea(investigación, n, día)` | Pasa la idea n de una investigación al calendario como Idea, una sola vez, y deja registro de que salió de la investigación. | Administrador y Creador |
| `copy_content(pieza, datos)` | Crea una pieza nueva a partir de otra: duplicar (igual, sin fecha) o adaptar a otra red (con su texto nuevo). Registra de cuál salió. | Administrador y Creador |
| `delete_content(pieza)` | Borra una pieza que no se publicó, deja registro en `content_deletions` y libera los planes e investigaciones que la apuntaban. | Administrador y Creador |
| `save_plan(marca, mes, datos)` | Guarda un plan del mes ya validado en el servidor (hasta 62 piezas). | Administrador y Creador |
| `add_plan_pieces(plan, posiciones)` | Pasa al calendario las piezas elegidas del plan, leídas de la base: con texto como Borrador, sin texto como Idea. Cada una entra una sola vez, nunca en un día que ya pasó, y registra por qué se propuso. | Administrador y Creador |

Funciones de apoyo: `current_workspace_id()`, `current_app_role()`, `is_admin()`, `can_create()`, `can_review()`, `can_move(desde, hasta, rol)` y `dia_ar(fecha)`, que da el día local de Argentina.

### Permisos

- `anon` (sin sesión) no lee ni escribe nada.
- `authenticated` solo lee (`select`) lo de su espacio, por RLS en las ocho tablas. `insert`, `update` y `delete` están revocados.
- Las funciones de escritura son `security definer`: corren con permisos de la base, pero primero validan el rol del usuario y el espacio de trabajo.
- La regla del circuito de aprobación está dos veces, en `can_move` (SQL) y en `src/lib/workflow.ts`. Si cambia una, hay que cambiar la otra.

### Migraciones

| Migración | Etapa | Qué agrega |
| --- | --- | --- |
| `20261013000000_esquema_base.sql` | 1 | Espacios, usuarios, marcas, piezas, historial, circuito de aprobación y permisos. |
| `20261014000000_calendario.sql` | 2 | `schedule_content` y `add_plan_ideas`. |
| `20261015000000_campanas.sql` | 3 | Campañas, su historial, `contents.campaign_id`, `save_campaign` y `set_content_campaign`. |
| `20261016000000_metricas.sql` | 4 | `content_results`, `save_results`, y una pieza que se publica sin fecha queda con el día de hoy. |
| `20261017000000_investigacion.sql` | 5 | `brand_research`, `save_research` y `add_research_idea`: las investigaciones con IA y el paso de sus ideas al calendario. |
| `20261018000000_plan_mensual.sql` | 6 | Campos para planificar en `brands` y `contents`, `content_plans`, `save_plan` y `add_plan_pieces`; `save_brand` y `save_content` guardan los campos nuevos. |
| `20261019000000_acciones_piezas.sql` | 6 | `content_deletions`, `copy_content` y `delete_content`: duplicar, adaptar y borrar piezas. |
