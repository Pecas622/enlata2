# Base de datos de MARKETING OPS

Todo lo que necesitás para tener la base de MARKETING OPS en un proyecto de Supabase: el SQL para pegar, cómo crear el primer usuario, cómo actualizarla y qué hay adentro.

## Archivos

| Archivo | Para qué |
| --- | --- |
| `base.sql` | La base completa (tablas, permisos y funciones) en un solo archivo, para pegar en **SQL Editor** de un Supabase nuevo. Son las migraciones de `supabase/migrations` en orden, y al final quedan registradas, así que un `npx supabase db push` posterior no las repite. No trae datos demo. |
| `primer-usuario.sql` | Crea el espacio de trabajo y deja a un usuario como Administrador. |
| `cron-publicar.sql` | El cron de Supabase que publica lo programado en Instagram cada 5 minutos (ver "Publicar y programar"). |
| `../migrations/*.sql` | Las migraciones una por una: es lo que aplica `npx supabase db push`. |
| `datos-demo.sql` | Carga las marcas de ejemplo (La Espiga y Rodar Bikes) con piezas, campañas, resultados e investigación en el espacio de trabajo de producción, a nombre de su Administrador, para ver la app funcionando. No crea usuarios. Sale del seed con `npm run db:demo`. |
| `borrar-datos-demo.sql` | Saca lo que cargó `datos-demo.sql` (las dos marcas demo y todo lo que cuelga de ellas) sin tocar lo tuyo. |
| `../seed.sql` | Datos demo (Estudio Demo, La Espiga, Rodar Bikes y tres usuarios con contraseña `demo1234`). Solo para la base local: **no lo corras en producción**. |

## Base nueva, paso a paso

1. En [supabase.com](https://supabase.com) creá un proyecto. La región más cercana para Argentina es São Paulo.
2. **SQL Editor > New query**: pegá todo `base.sql` y tocá **Run**. Tiene que ser un proyecto **nuevo y vacío**, nunca el de APPLE OPS: comparten nombres (`profiles`, `user_role`, `is_admin`, `dia_ar`) y le cambiaría los permisos. Por eso `base.sql` arranca con un freno: si la base ya tiene tablas, corta con un error y no aplica nada.
3. **Authentication > Users > Add user > Create new user**: cargá tu email y una contraseña, y tildá **Auto Confirm User**.
4. **SQL Editor**: abrí `primer-usuario.sql`, cambiá el email, tu nombre y el nombre de la empresa o agencia, y corrélo.
5. **Authentication > URL Configuration**: en **Site URL** poné la dirección de la app en Vercel, y en **Redirect URLs** sumá `https://<tu-app>/login` (el mail de confirmación vuelve ahí).
   Para que cada negocio cree su propia cuenta desde `/registro`, en **Authentication > Sign In / Providers** dejá activado **Allow new users to sign up** (y **Confirm email**, así nadie se registra con un email ajeno). Si lo apagás, tampoco funcionan las invitaciones, porque el invitado crea su usuario desde la app.
6. En el proyecto de Vercel de MARKETING OPS, cargá las variables y hacé un redeploy:

   | Variable | De dónde sale |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API > Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API > clave `anon` / publishable |
   | `ANTHROPIC_API_KEY` | Opcional. Con ella el generador escribe con Claude, el análisis de métricas usa IA y se puede investigar en internet; sin ella, plantillas y reglas. Solo servidor. |
   | `INSTAGRAM_APP_ID` y `INSTAGRAM_APP_SECRET` | Opcionales. Los de la app de Meta, para que cada marca conecte su Instagram (ver "Conectar Instagram" abajo). Sin ellos, el panel Redes avisa que falta configurar y no deja conectar. Solo servidor. |
   | `TOKENS_KEY` | Con Instagram, obligatoria. La clave con la que se cifran los permisos de las redes antes de guardarlos: 32 bytes en base64, sacala con `openssl rand -base64 32`. Si la cambiás, hay que reconectar las cuentas. Solo servidor. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Para publicar en Instagram. Supabase > Project Settings > API > clave `service_role` / secret. La usa solo el publicador, en el servidor (ver "Publicar y programar" abajo). Nunca en el navegador. |
   | `CRON_SECRET` | Para publicar lo programado. Una clave inventada (`openssl rand -hex 32`) con la que el cron se identifica. Solo servidor. |
   | `APP_URL` | Opcional. La dirección pública de la app (por ejemplo `https://marketing-ops-seven.vercel.app`), para armar la vuelta del inicio de sesión de Instagram. Sin ella se usa la del pedido. |
   | `NEXT_PUBLIC_PRODUCT_NAME` | Opcional. El nombre que se muestra (por defecto MARKETING OPS). |

   `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` hacen falta solo para publicar en Instagram; sin ellas, todo lo demás anda igual.

Para sumar a otra persona, invitala desde **Equipo** en la app: te da un link para mandarle, y con él crea su contraseña y entra con el rol que elegiste. Cada espacio nuevo arranca en el plan Prueba; para cambiarlo: `update workspaces set plan_id = 'emprendedor' where name = '<negocio>';` (planes: `prueba`, `emprendedor`, `agencia`).

## Conectar Instagram

Cada marca conecta su cuenta profesional de Instagram (Empresa o Creador) con el inicio de sesión oficial de Instagram ("Instagram API with Instagram Login" de Meta). La app nunca ve la contraseña: Instagram le da un permiso por 60 días, que se renueva solo al probar la conexión cuando falta poco para que venza. El permiso se guarda cifrado con `TOKENS_KEY`.

Para habilitarlo, una sola vez:

1. En [developers.facebook.com](https://developers.facebook.com/apps) creá una app de tipo **Empresa** (Business).
2. Sumale el producto **Instagram** y elegí **API setup with Instagram login**.
3. En **Business login settings**, en **OAuth redirect URIs**, cargá `https://<tu-app>/api/redes/instagram/vuelta` (tiene que coincidir exacto con `APP_URL`).
4. Copiá el **Instagram app ID** y el **Instagram app secret** a `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` en Vercel, sumá `TOKENS_KEY` y `APP_URL`, y hacé un redeploy.
5. Mientras la app está en modo desarrollo, solo conectan las cuentas que sumes como testers en **App roles > Roles > Instagram Testers** (cada una acepta la invitación desde Instagram, en Configuración > Apps y sitios web). Para que conecte cualquier cliente, Meta tiene que aprobar la app (**App Review**) con los permisos `instagram_business_basic` e `instagram_business_content_publish`, con un video que muestre el uso.

Facebook y TikTok aparecen como "Próximamente": todavía no se conectan.

## Publicar y programar

Una pieza **aprobada** de Instagram (post, carrusel, Reel o historia), con sus fotos en JPG o su video, se publica desde la pieza con **Publicar ahora** o se programa para un día y hora. La pieza pasa a Publicado solo cuando Instagram confirma; si algo falla, queda en Error con el motivo y se puede reintentar. Lo programado y los errores se ven también en **Redes**.

Lo programado lo publica un cron que llama a `https://<tu-app>/api/cron/publicar` cada 5 minutos con el encabezado `Authorization: Bearer <CRON_SECRET>`. Con el plan gratis de Vercel el cron propio corre una vez por día, así que conviene usar el de Supabase:

1. Cargá `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` en Vercel y hacé un redeploy.
2. En Supabase, **Database > Extensions**: activá `pg_cron` y `pg_net`.
3. En **SQL Editor**, abrí `cron-publicar.sql`, cambiá la dirección de la app y el `CRON_SECRET`, y corrélo. Para ver que anda: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`.

Instagram deja publicar hasta 100 piezas por día por cuenta, y baja el archivo de un link firmado que dura una hora.

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
| `workspaces` | Los espacios de trabajo, con su plan. |
| `profiles` | Las personas: una por usuario de Supabase Auth, con su espacio, su nombre, su email, su rol, si está activa y, para un Revisor, qué marcas ve (vacío: todas). |
| `brands` | Las marcas: rubro, ciudad, qué hace, público, por qué la eligen, productos, tono, palabras que no usa, llamado a la acción, hashtags, redes y color; y para planificar, objetivos, redes donde publica, publicaciones por semana, presupuesto mensual de publicidad, mercado e identidad visual. |
| `contents` | Las piezas: marca, red, formato, objetivo, tema, título, texto, hashtags, llamado a la acción, estado, fecha de publicación, horario sugerido, gancho, guion o estructura, recursos, por qué se propone, origen (IA, plantilla o manual), campaña y quién la creó y editó. |
| `content_events` | El historial de cada pieza: quién la creó, editó, mandó a revisión, aprobó, pidió cambios, publicó, reprogramó, sumó a una campaña o le cargó resultados. |
| `campaigns` | Las campañas: marca, nombre, objetivo, fechas, presupuesto en pesos, oferta, público, zona, edades, intereses y notas. |
| `campaign_events` | El historial de cada campaña. |
| `content_plans` | Los planes del mes de cada marca: mes, si lo armó la IA o las plantillas, la estrategia en pocas frases, las piezas propuestas (con la pieza creada si pasó al calendario), quién y cuándo. |
| `content_deletions` | Registro de las piezas borradas (su historial se va con ellas): qué pieza, de qué marca, título, estado, fecha, quién y cuándo. |
| `brand_research` | Las investigaciones con IA de cada marca: qué se pidió mirar, resumen, tendencias del rubro, competencia, ideas (con la pieza creada si se pasó al calendario), fuentes, quién y cuándo. |
| `content_results` | Los resultados de cada pieza publicada: personas alcanzadas, interacciones, clics, consultas, ventas, inversión en pesos y una nota. Una fila por pieza. |
| `invitations` | Las invitaciones al equipo: email, nombre, rol, marcas que verá, código del link, estado (Pendiente, Aceptada, Cancelada) y vencimiento a los 14 días. Solo las lee el Administrador. |
| `team_events` | El historial del equipo: quién invitó, canceló, cambió el rol o las marcas, desactivó o reactivó a quién, y cuándo se creó el espacio. |
| `plans` | Los planes con sus topes: Prueba (1 marca, 2 personas, 30 acciones con IA por mes, 200 MB de archivos), Emprendedor (2, 4, 200, 2 GB) y Agencia (15, 20, 1500, 20 GB). |
| `social_accounts` | Las cuentas de redes conectadas a cada marca: red, id y usuario en la red, tipo de cuenta, seguidores, estado (Conectada, Vencida, Error), último error, el permiso cifrado (esta columna no se lee desde la app: solo `social_token`), cuándo vence, quién la conectó y cuándo se probó. |
| `social_events` | El historial de las conexiones: quién conectó o desconectó qué cuenta. |
| `publications` | La publicación en Instagram de cada pieza: estado (Programada, Publicando, Publicada, Error), día y hora, intentos, último error, el contenedor que arma Instagram mientras procesa un video, el id y el link de la publicación. |
| `media_files` | Los archivos de cada marca (logo, fotos y videos) en el bucket privado `media` de Storage, en `<espacio>/<marca>/...`: ruta, nombre, tipo, tamaño, pieza a la que va, quién y cuándo. |
| `ai_usage` | Cuántas acciones con IA usó cada espacio por mes y por tipo (generar, adaptar, plan, investigar, analizar). |

Valores fijos (enums): roles `Administrador`, `Creador` y `Revisor`; estados `Idea`, `Borrador`, `En revisión`, `Aprobado` y `Publicado`; redes Instagram, Facebook, TikTok, LinkedIn, WhatsApp y Email; formatos Post, Carrusel, Reel, Historia, Anuncio y Mensaje; objetivos Vender, Conseguir consultas, Lanzamiento, Promoción, Comunidad y Educar.

### Funciones (la única forma de escribir)

| Función | Qué hace | Quién puede |
| --- | --- | --- |
| `save_brand(id, datos)` | Crea o edita una marca. | Administrador |
| `save_content(id, datos)` | Crea o edita una pieza. Sin texto nace como Idea; con texto, como Borrador. Si se edita una aprobada, vuelve a Borrador. Una publicada no se edita. | Administrador y Creador |
| `set_content_status(id, estado, nota)` | Mueve una pieza en el circuito según `can_move`. Pedir cambios la vuelve a Borrador con una nota. | Según el paso: el Creador manda a revisión y publica lo aprobado; el Revisor aprueba o pide cambios; el Administrador hace todo |
| `schedule_content(id, día)` | Cambia la pieza de día o la saca del calendario sin tocar su estado: una aprobada sigue aprobada. | Administrador y Creador |
| `add_plan_ideas(marca, ideas)` | Guarda las ideas del plan del mes en una sola transacción: si una está mal, no se guarda ninguna. | Administrador y Creador |
| `save_campaign(id, datos)` | Crea o edita una campaña. Valida fechas, presupuesto y la página de destino. La marca no se cambia después. | Administrador y Creador |
| `set_content_campaign(pieza, campaña)` | Suma o saca una pieza de una campaña. Tienen que ser de la misma marca. | Administrador y Creador |
| `save_results(pieza, datos)` | Carga o corrige los resultados de una pieza publicada. Valida que sean números enteros y no negativos. | Administrador y Creador |
| `save_research(marca, datos)` | Guarda una investigación ya validada en el servidor. | Administrador y Creador |
| `add_research_idea(investigación, n, día)` | Pasa la idea n de una investigación al calendario como Idea, una sola vez, y deja registro de que salió de la investigación. | Administrador y Creador |
| `copy_content(pieza, datos)` | Crea una pieza nueva a partir de otra: duplicar (igual, sin fecha) o adaptar a otra red (con su texto nuevo). Registra de cuál salió. | Administrador y Creador |
| `delete_content(pieza)` | Borra una pieza que no se publicó, deja registro en `content_deletions` y libera los planes e investigaciones que la apuntaban. | Administrador y Creador |
| `save_plan(marca, mes, datos)` | Guarda un plan del mes ya validado en el servidor (hasta 62 piezas). | Administrador y Creador |
| `invite_member(email, nombre, rol, marcas)` | Invita a una persona y devuelve el código del link. Reemplaza la invitación pendiente del mismo email. Respeta el tope de personas del plan. | Administrador |
| `cancel_invitation(id)` | Cancela una invitación pendiente. | Administrador |
| `invitation_info(código)` | Lo que muestra la pantalla de registro a quien tiene el link: email, nombre, rol y espacio. Nada si el link no sirve. | Cualquiera con el link |
| `accept_invitation()` | El usuario logueado, con el email confirmado y sin perfil, entra al espacio de su invitación pendiente. | El invitado |
| `create_own_workspace()` | Quien se registró sin invitación, con el nombre de su negocio, crea su espacio en el plan Prueba y queda como Administrador. | El que se registró |
| `update_member(id, rol, activa, marcas)` | Cambia el rol, las marcas o si está activa una persona. Siempre queda un Administrador activo. | Administrador |
| `use_ai(tipo)` | Cuenta una acción con IA del mes. Devuelve false, sin contar, si el plan llegó a su tope: la app usa las reglas y plantillas. | Cualquiera del espacio |
| `connect_social(marca, datos)` | Conecta o reconecta la cuenta de una red a una marca, con el permiso ya cifrado por la app. Una misma cuenta no va en dos marcas. | Administrador |
| `disconnect_social(id)` | Desconecta una cuenta y deja registro. | Administrador |
| `social_token(id)` | Devuelve el permiso cifrado, para que el servidor lo use (probar la conexión y, después, publicar). | Administrador y Creador |
| `save_social_check(id, datos)` | Guarda lo que devolvió la red al probar la conexión: estado, usuario, seguidores y, si se renovó, el permiso nuevo. | Administrador y Creador |
| `add_media(datos)` | Registra un archivo ya subido a Storage: lee tamaño y tipo de Storage, valida que sea del espacio y de la marca, y respeta el espacio del plan. | Administrador y Creador |
| `delete_media(id)` | Saca el registro de un archivo y devuelve la ruta para borrarlo de Storage. | Administrador y Creador |
| `schedule_publication(pieza, cuándo)` | Programa (o reprograma) la publicación en Instagram de una pieza aprobada, con la cuenta conectada y sus archivos; "Publicar ahora" es programarla para ya. Pone el día y la hora en el calendario. Si la pieza se mueve de día, la publicación se mueve con ella. | Administrador y Creador |
| `cancel_publication(pieza)` | Cancela una publicación programada o descarta una con error. | Administrador y Creador |
| `claim_publications`, `save_publication_container`, `save_publication_token`, `finish_publication` | El publicador: toma lo que toca (descarta lo que dejó de estar aprobado o perdió la cuenta), guarda el avance y cierra con el resultado. La pieza pasa a Publicado solo cuando Instagram confirma. | Solo el servidor (clave de servicio) |
| `plan_usage()` | El plan del espacio, sus topes y lo usado este mes. | Cualquiera del espacio |
| `add_plan_pieces(plan, posiciones)` | Pasa al calendario las piezas elegidas del plan, leídas de la base: con texto como Borrador, sin texto como Idea. Cada una entra una sola vez, nunca en un día que ya pasó, y registra por qué se propuso. | Administrador y Creador |

Funciones de apoyo: `current_workspace_id()`, `current_app_role()`, `is_admin()`, `can_create()`, `can_review()`, `can_move(desde, hasta, rol)`, `dia_ar(fecha)`, que da el día local de Argentina, y `can_see_brand(marca)`, que aplica las marcas de cada Revisor en el RLS de todas las tablas. Los topes de marcas y personas los aplican triggers sobre `brands`, `invitations` y `profiles`.

### Permisos

- `anon` (sin sesión) no lee ni escribe nada.
- `authenticated` solo lee (`select`) lo de su espacio, por RLS en todas las tablas (y un Revisor con marcas elegidas, solo lo de esas marcas). `insert`, `update` y `delete` están revocados.
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
| `20261020000000_equipo.sql` | 7 | Equipo (invitaciones, roles y marcas por Revisor con RLS), registro propio con espacio nuevo, planes con topes de marcas, personas y acciones con IA. Los espacios que ya existían quedan en Agencia. |
| `20261021000000_redes_archivos.sql` | 8 | `social_accounts` con el permiso cifrado y sin lectura desde la app, `social_events`, conectar, desconectar y probar redes; bucket privado `media` con sus políticas, `media_files`, `add_media`, `delete_media` y espacio de archivos por plan. |
| `20261022000000_publicaciones.sql` | 9 | `publications`, programar, cancelar y el publicador (solo con la clave de servicio); la publicación se mueve con la pieza en el calendario. |
| `20261023000000_editar_con_ia.sql` | 10 | La acción con IA "editar" en `use_ai` y `ai_usage`; `save_content` deja en el historial "Editada con IA" o "Editada automáticamente" con el pedido. |
| `20261024000000_video_con_ia.sql` | 11 | La acción con IA "video" en `use_ai` y `ai_usage` (el plan de edición de video). |
| `20261025000000_campana_destino.sql` | 3 | `campaigns.product` (qué promociona) y `campaigns.link` (la página de destino del anuncio); `save_campaign` los guarda y valida que la página sea una dirección web. |
