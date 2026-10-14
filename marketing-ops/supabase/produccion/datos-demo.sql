-- MARKETING OPS · datos demo para ver la app funcionando en producción.
-- Carga dos marcas de ejemplo (La Espiga y Rodar Bikes) con piezas en todos los estados, campañas, resultados y,
-- si la base ya tiene la etapa 5, una investigación. Todo queda a nombre del Administrador del espacio de trabajo.
-- Pegalo entero en SQL Editor del proyecto de MARKETING OPS y tocá Run. Para sacarlo: borrar-datos-demo.sql.
-- Generado desde supabase/seed.sql con npm run db:demo.

begin;

do $$
begin
  if to_regclass('public.content_results') is null then raise exception 'Esta base no es la de MARKETING OPS con la etapa 4.'; end if;
  if (select count(*) from workspaces) <> 1 then raise exception 'La base tiene % espacios de trabajo: este archivo es para una base con uno solo.', (select count(*) from workspaces); end if;
  if (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1) is null then raise exception 'El espacio de trabajo no tiene un Administrador.'; end if;
  if exists (select 1 from brands where id = '00000000-0000-4000-8000-0000000000b1') then raise exception 'Los datos demo ya están cargados. Si querés recargarlos, corré antes borrar-datos-demo.sql.'; end if;
end $$;

do $$
declare
  v_ws uuid := (select id from workspaces order by created_at limit 1);
begin
  insert into brands (id, workspace_id, name, industry, city, description, audience, value_prop, products, tone, words_avoid, cta, hashtags, website, instagram, whatsapp, color, updated_by)
  values
    ('00000000-0000-4000-8000-0000000000b1', v_ws, 'La Espiga', 'Panadería y pastelería', 'Godoy Cruz, Mendoza',
     'Panadería de barrio con masa madre, facturas del día y tortas por encargo.',
     'Vecinos de Godoy Cruz, familias y oficinas de la zona que buscan algo rico y casero.',
     'Todo sale del horno esa misma mañana, con masa madre y sin premezclas.',
     'Pan de masa madre, facturas, medialunas de manteca, tortas por encargo, budines, prepizzas',
     '{Cercano,Divertido}', 'barato, industrial, premezcla', 'Pedí por WhatsApp y retirá sin hacer fila', 'laespiga, masamadre, godoycruz',
     '', '@laespiga.panaderia', '+54 9 261 555 0101', '#C2410C', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1)),
    ('00000000-0000-4000-8000-0000000000b2', v_ws, 'Rodar Bikes', 'Bicicletería y taller', 'Ciudad de Mendoza',
     'Venta de bicicletas urbanas y de montaña, repuestos y taller con turno.',
     'Ciclistas urbanos y de fin de semana de 20 a 50 años que usan la bici para moverse o para salir a la montaña.',
     'Service en 48 h con turno online y garantía escrita en cada arreglo.',
     'Bicicletas urbanas, mountain bikes, service completo, cascos, luces, cubiertas',
     '{Directo,Profesional}', 'barato, chino', 'Sacá turno por WhatsApp', 'rodarbikes, ciclismomendoza, mtb',
     'rodarbikes.com.ar', '@rodar.bikes', '+54 9 261 555 0202', '#047857', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1));
end $$;

-- Piezas de ejemplo en todos los estados del circuito.
insert into contents (id, workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, source, created_by, updated_by, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c1', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Post', 'Vender',
   'Medialunas de manteca', 'Medialunas recién salidas',
   E'¿Ya probaste nuestras medialunas de manteca? 🥐\n\nLas hacemos todas las mañanas, con manteca de verdad y sin premezclas. Salen calentitas a las 7.\n\nPedí por WhatsApp y retirá sin hacer fila.',
   '#laespiga #masamadre #godoycruz', 'Pedí por WhatsApp y retirá sin hacer fila', 'Publicado', current_date - 3, 'plantilla',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '6 days', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000c2', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Reel', 'Promoción',
   'Promo de budines los jueves', 'Jueves de budines',
   E'0-3 s · Gancho: mano cortando un budín todavía caliente. Texto: "Los jueves pasá algo distinto".\n3-10 s · Budines de limón, chocolate y banana saliendo del horno.\n10-20 s · Texto: "Llevando dos, el segundo a mitad de precio".\n20-25 s · Cierre: frente de La Espiga. "Pedí por WhatsApp y retirá sin hacer fila".',
   '#laespiga #godoycruz', 'Pedí por WhatsApp y retirá sin hacer fila', 'Aprobado', current_date + 2, 'ia',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000c3', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Carrusel', 'Educar',
   '5 señales de que tu bici necesita service', '5 señales de que tu bici pide service',
   E'Placa 1: 5 señales de que tu bici pide service.\nPlaca 2: Los cambios saltan solos.\nPlaca 3: Los frenos chillan o tardan en frenar.\nPlaca 4: La cadena hace ruido aunque la limpies.\nPlaca 5: Las cubiertas pierden aire de un día para el otro.\nPlaca 6: Service en 48 h con garantía escrita. Sacá turno por WhatsApp.',
   '#rodarbikes #ciclismomendoza #mtb', 'Sacá turno por WhatsApp', 'En revisión', current_date + 4, 'plantilla',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 day', now() - interval '20 hours'),
  ('00000000-0000-4000-8000-0000000000c4', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b2', 'WhatsApp', 'Mensaje', 'Conseguir consultas',
   'Recordatorio de service antes del verano', 'Service antes del verano',
   E'Hola! Te escribimos de Rodar Bikes. Se viene la temporada de salir a la montaña y es el mejor momento para hacerle el service a tu bici.\n\nLo tenemos listo en 48 h y con garantía escrita.\n\nSacá turno por WhatsApp respondiendo este mensaje.',
   '', 'Sacá turno por WhatsApp', 'Borrador', null, 'manual',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '5 hours', now() - interval '5 hours'),
  ('00000000-0000-4000-8000-0000000000c5', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b1', 'Facebook', 'Post', 'Lanzamiento',
   'Tortas por encargo para el Día de la Madre', 'Tortas para el Día de la Madre', '', '', '', 'Idea', null, 'manual',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '2 hours', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000000c6', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Reel', 'Vender',
   'Bicis urbanas para ir al trabajo', 'Al trabajo en bici',
   E'0-3 s · Gancho: semáforo en rojo, autos parados y una bici que pasa por la ciclovía. Texto: "¿Otra vez tarde?".\n3-12 s · Recorrido por el centro de Mendoza en bici urbana.\n12-20 s · Las urbanas del local, con canasto y luces.\n20-25 s · Cierre: "Sacá turno por WhatsApp y probala".',
   '#rodarbikes #ciclismomendoza', 'Sacá turno por WhatsApp', 'Borrador', current_date + 8, 'plantilla',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-0000000000c7', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Historia', 'Comunidad',
   'Así arranca el día en el horno', 'Así arranca el día en el horno', '', '', '', 'Idea', current_date + 1, 'manual',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 hour', now() - interval '1 hour');

insert into content_events (workspace_id, content_id, action, note, by_profile, at) values
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c1', 'Creada con plantilla', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '6 days'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c1', 'Mandó a revisión', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '5 days'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c1', 'Aprobó', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '4 days'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c1', 'Marcó como publicada', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '3 days'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c2', 'Creada con IA', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '2 days'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c2', 'Mandó a revisión', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '2 days'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c2', 'Aprobó', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 day'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c3', 'Creada con plantilla', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 day'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c3', 'Mandó a revisión', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '20 hours'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c4', 'Creada', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '5 hours'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c5', 'Creada', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '2 hours'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c6', 'Creada con plantilla', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '3 hours'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c7', 'Creada', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 hour');

-- Campañas (etapa 3): una en curso para La Espiga y una planificada para Rodar Bikes.
insert into campaigns (id, workspace_id, brand_id, name, goal, starts_on, ends_on, budget, offer, audience, locations, age_min, age_max, interests, notes, created_by, updated_by, created_at) values
  ('00000000-0000-4000-8000-0000000000d1', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b1', 'Día de la Madre', 'Promoción',
   current_date - 5, current_date + 5, 55000, 'Tortas por encargo para mamá, encargando con 48 h de anticipación',
   'Hijos e hijas de la zona que buscan un regalo rico para mamá', 'Godoy Cruz y Luján de Cuyo', 25, 60, 'Repostería, Regalos, Día de la Madre',
   'Fotos de las tortas de frutilla y de chocolate, que son las más pedidas.', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000000d2', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b2', 'Service de primavera', 'Conseguir consultas',
   current_date + 3, current_date + 30, 120000, '', '', 'Ciudad de Mendoza, Godoy Cruz y Las Heras', 20, 50, '',
   '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 day');

insert into contents (id, workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, source, created_by, updated_by, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c8', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Anuncio', 'Promoción',
   'Tortas para el Día de la Madre', 'Anuncio tortas para mamá',
   E'Texto principal: Este domingo, que mamá tenga su torta casera. Encargala con 48 h de anticipación y retirala sin hacer fila 🎂\nTítulo: Tortas por encargo para mamá\nDescripción: La Espiga · Godoy Cruz\nBotón: Enviar mensaje',
   '', 'Pedí por WhatsApp y retirá sin hacer fila', 'En revisión', current_date + 1, 'plantilla',
   (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '4 hours', now() - interval '3 hours');

update contents set campaign_id = '00000000-0000-4000-8000-0000000000d1'
where id in ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000c8');
update contents set campaign_id = '00000000-0000-4000-8000-0000000000d2'
where id in ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000c6');

insert into campaign_events (workspace_id, campaign_id, action, by_profile, at) values
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000d1', 'Creó la campaña', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '5 days'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000d1', 'Sumó una pieza', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '3 hours'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000d2', 'Creó la campaña', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 day');
insert into content_events (workspace_id, content_id, action, note, by_profile, at) values
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c8', 'Creada con plantilla', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '4 hours'),
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000c8', 'Mandó a revisión', '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '3 hours');

-- Métricas (etapa 4): piezas publicadas en los últimos dos meses con sus resultados, y una campaña que ya terminó.
insert into campaigns (id, workspace_id, brand_id, name, goal, starts_on, ends_on, budget, offer, audience, locations, age_min, age_max, interests, notes, created_by, updated_by, created_at) values
  ('00000000-0000-4000-8000-0000000000d3', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b2', 'Vuelta a la montaña', 'Conseguir consultas',
   current_date - 30, current_date - 10, 60000, '', 'Ciclistas de fin de semana que vuelven a salir a la montaña', 'Ciudad de Mendoza y Godoy Cruz', 20, 50, 'Mountain bike, Ciclismo',
   '', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '32 days');

insert into contents (id, workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, campaign_id, source, created_by, updated_by, created_at, updated_at)
select v.id::uuid, (select id from workspaces order by created_at limit 1), v.brand::uuid, v.channel::content_channel, v.format::content_format, v.goal::content_goal, v.title, v.title, v.body, v.tags,
  v.cta, 'Publicado', current_date - v.ago, v.camp::uuid, v.source::content_source, (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1),
  now() - make_interval(days => v.ago + 3), now() - make_interval(days => v.ago)
from (values
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Reel', 'Comunidad', 'Así se hace la masa madre', 6, null, 'ia',
   E'0-3 s · Gancho: manos hundiéndose en la masa. Texto: "Esto lleva 24 horas".\n3-15 s · El frasco de masa madre, el amasado y el pan entrando al horno.\n15-25 s · Cierre: el pan cortado. "Pedí por WhatsApp y retirá sin hacer fila".', '#laespiga #masamadre', 'Pedí por WhatsApp y retirá sin hacer fila'),
  ('00000000-0000-4000-8000-000000000c10', '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Historia', 'Promoción', 'Últimas facturas del día', 9, null, 'plantilla',
   E'Texto: Quedan las últimas facturas de hoy\nSticker: encuesta "¿Medialuna o vigilante?"\nCierre: Pedí por WhatsApp y retirá sin hacer fila', '', 'Pedí por WhatsApp y retirá sin hacer fila'),
  ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-0000000000b1', 'WhatsApp', 'Mensaje', 'Promoción', 'Encargos para el Día de la Madre', 4, '00000000-0000-4000-8000-0000000000d1', 'plantilla',
   E'Hola! Te escribimos de La Espiga. Ya estamos tomando encargos de tortas para el Día de la Madre, con 48 h de anticipación.\n\nRespondé este mensaje y te pasamos los sabores.', '', 'Respondé este mensaje'),
  ('00000000-0000-4000-8000-000000000c12', '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Anuncio', 'Promoción', 'Anuncio tortas para mamá (primera tanda)', 2, '00000000-0000-4000-8000-0000000000d1', 'plantilla',
   E'Texto principal: Que mamá tenga su torta casera este domingo. Encargala con 48 h de anticipación.\nTítulo: Tortas por encargo para mamá\nDescripción: La Espiga · Godoy Cruz\nBotón: Enviar mensaje', '', 'Enviar mensaje'),
  ('00000000-0000-4000-8000-000000000c13', '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Reel', 'Educar', 'Cómo emparchar una cámara', 12, '00000000-0000-4000-8000-0000000000d3', 'ia',
   E'0-3 s · Gancho: cubierta pinchada en plena subida. Texto: "¿Te pasó?".\n3-20 s · Paso a paso: sacar la rueda, encontrar el pinchazo y emparchar.\n20-25 s · Cierre: "Sacá turno por WhatsApp si preferís que lo hagamos nosotros".', '#rodarbikes #mtb', 'Sacá turno por WhatsApp'),
  ('00000000-0000-4000-8000-000000000c14', '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Post', 'Vender', 'Llegaron las urbanas', 15, null, 'plantilla',
   E'Llegaron las bicis urbanas: con canasto, luces y guardabarros.\n\nPasá a probarlas o sacá turno por WhatsApp.', '#rodarbikes #ciclismomendoza', 'Sacá turno por WhatsApp'),
  ('00000000-0000-4000-8000-000000000c15', '00000000-0000-4000-8000-0000000000b2', 'Facebook', 'Post', 'Conseguir consultas', 'Turnos de service', 20, '00000000-0000-4000-8000-0000000000d3', 'plantilla',
   E'Antes de volver a la montaña, hacele el service a tu bici. Lo tenemos listo en 48 h y con garantía escrita.\n\nSacá turno por WhatsApp.', '', 'Sacá turno por WhatsApp'),
  ('00000000-0000-4000-8000-000000000c16', '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Anuncio', 'Conseguir consultas', 'Anuncio service en 48 h', 25, '00000000-0000-4000-8000-0000000000d3', 'plantilla',
   E'Texto principal: Tu bici lista en 48 h, con garantía escrita en cada arreglo.\nTítulo: Service en 48 h\nDescripción: Rodar Bikes · Mendoza\nBotón: Enviar mensaje', '', 'Enviar mensaje'),
  ('00000000-0000-4000-8000-000000000c17', '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Post', 'Educar', 'Por qué usamos masa madre', 40, null, 'plantilla',
   E'¿Por qué masa madre? Porque el pan dura más, es más liviano y tiene otro sabor.\n\nPedí por WhatsApp y retirá sin hacer fila.', '#laespiga #masamadre', 'Pedí por WhatsApp y retirá sin hacer fila'),
  ('00000000-0000-4000-8000-000000000c18', '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Carrusel', 'Educar', 'Qué llevar para salir a la montaña', 45, null, 'plantilla',
   E'Placa 1: Qué llevar para salir a la montaña.\nPlaca 2: Cámara de repuesto y parches.\nPlaca 3: Inflador chico.\nPlaca 4: Agua de sobra.\nPlaca 5: Sacá turno por WhatsApp y salí con la bici a punto.', '#rodarbikes #mtb', 'Sacá turno por WhatsApp'),
  ('00000000-0000-4000-8000-000000000c19', '00000000-0000-4000-8000-0000000000b1', 'Facebook', 'Post', 'Comunidad', 'Nuevo horario de los domingos', 1, null, 'manual',
   E'Desde este domingo abrimos de 8 a 13. Pedí por WhatsApp y retirá sin hacer fila.', '', 'Pedí por WhatsApp y retirá sin hacer fila')
) as v(id, brand, channel, format, goal, title, ago, camp, source, body, tags, cta);

-- La última (nuevo horario) queda sin resultados, para mostrar el aviso de que faltan cargar.
insert into content_results (content_id, workspace_id, reach, interactions, clicks, inquiries, sales, spend, updated_by, updated_at)
select v.id::uuid, (select id from workspaces order by created_at limit 1), v.reach, v.inter, v.clicks, v.inq, v.sales, v.spend, (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '1 day'
from (values
  ('00000000-0000-4000-8000-0000000000c1', 1450, 62, 8, 4, 2, 0),
  ('00000000-0000-4000-8000-0000000000c9', 5200, 410, 35, 9, 0, 0),
  ('00000000-0000-4000-8000-000000000c10', 900, 38, 0, 6, 4, 0),
  ('00000000-0000-4000-8000-000000000c11', 320, 0, 0, 21, 9, 0),
  ('00000000-0000-4000-8000-000000000c12', 8400, 190, 140, 17, 6, 22000),
  ('00000000-0000-4000-8000-000000000c13', 6100, 520, 48, 11, 1, 0),
  ('00000000-0000-4000-8000-000000000c14', 1300, 41, 12, 3, 1, 0),
  ('00000000-0000-4000-8000-000000000c15', 700, 15, 9, 5, 0, 0),
  ('00000000-0000-4000-8000-000000000c16', 9800, 160, 210, 24, 0, 35000),
  ('00000000-0000-4000-8000-000000000c17', 1100, 48, 4, 1, 0, 0),
  ('00000000-0000-4000-8000-000000000c18', 2400, 180, 20, 4, 0, 0)
) as v(id, reach, inter, clicks, inq, sales, spend);

insert into content_events (workspace_id, content_id, action, note, by_profile, at)
select (select id from workspaces order by created_at limit 1), c.id, e.action, '', e.who::uuid, c.updated_at - e.back
from contents c
cross join (values
  ('Creada con plantilla', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), interval '3 days'),
  ('Mandó a revisión', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), interval '2 days'),
  ('Aprobó', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), interval '1 day'),
  ('Marcó como publicada', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), interval '0 days')
) as e(action, who, back)
where c.status = 'Publicado' and c.id <> '00000000-0000-4000-8000-0000000000c1' and c.id::text like '00000000-0000-4000-8000-%';
insert into content_events (workspace_id, content_id, action, note, by_profile, at)
select r.workspace_id, r.content_id, 'Cargó los resultados', format('Alcance %s · %s interacciones · %s consultas', r.reach, r.interactions, r.inquiries), r.updated_by, r.updated_at
from content_results r where r.content_id::text like '00000000-0000-4000-8000-%';
insert into campaign_events (workspace_id, campaign_id, action, by_profile, at) values
  ((select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000d3', 'Creó la campaña', (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '32 days');

-- Una investigación de ejemplo para La Espiga (competidores y fuentes ficticios, en example.com).
do $demo$ begin
  if to_regclass('public.brand_research') is not null then
    execute $q$
insert into brand_research (id, workspace_id, brand_id, focus, summary, trends, competitors, ideas, sources, created_by, created_at) values (
  '00000000-0000-4000-8000-0000000000e1', (select id from workspaces order by created_at limit 1), '00000000-0000-4000-8000-0000000000b1',
  'Panaderías de Godoy Cruz y el Día de la Madre',
  'Las panaderías de la zona muestran el horno y el proceso en Reels, y en octubre todas empujan tortas por encargo para el Día de la Madre. La masa madre sigue siendo tema: la gente pregunta cómo se hace y cuánto dura el pan.',
  '[{"title": "Pan de masa madre", "detail": "Se habla de fermentación lenta y de pan que dura más. Es justo lo que hace La Espiga.", "sources": ["https://example.com/tendencias-panaderia-2026"]},
    {"title": "Tortas por encargo para el Día de la Madre", "detail": "Las búsquedas de tortas por encargo crecen las dos semanas antes de la fecha.", "sources": ["https://example.com/dia-de-la-madre-regalos"]}]',
  '[{"name": "Panadería El Molino (ejemplo)", "detail": "Reels cortos del horno a la mañana y encuestas en historias para elegir el sabor de la semana.", "sources": ["https://example.com/el-molino"]},
    {"name": "Dulce Barrio (ejemplo)", "detail": "Carruseles con el paso a paso de sus tortas y un aviso de fecha límite para encargar.", "sources": ["https://example.com/dulce-barrio"]}]',
  '[{"topic": "Un día con la masa madre de La Espiga, del horno a tu mesa", "why": "La masa madre es tema y la competencia engancha mostrando el horno.", "channel": "Instagram", "format": "Reel", "goal": "Comunidad", "sources": ["https://example.com/tendencias-panaderia-2026", "https://example.com/el-molino"]},
    {"topic": "Hasta cuándo podés encargar la torta del Día de la Madre", "why": "Las búsquedas crecen antes de la fecha y Dulce Barrio ya avisa su fecha límite.", "channel": "WhatsApp", "format": "Mensaje", "goal": "Conseguir consultas", "sources": ["https://example.com/dia-de-la-madre-regalos", "https://example.com/dulce-barrio"]},
    {"topic": "Elegí el sabor del budín de la semana", "why": "Las encuestas en historias le funcionan a El Molino para que la gente participe.", "channel": "Instagram", "format": "Historia", "goal": "Comunidad", "sources": ["https://example.com/el-molino"]},
    {"topic": "Cuánto dura el pan de masa madre y cómo guardarlo", "why": "Es una pregunta que se repite en lo que se habla del rubro.", "channel": "Instagram", "format": "Carrusel", "goal": "Educar", "sources": ["https://example.com/tendencias-panaderia-2026"]}]',
  '[{"url": "https://example.com/tendencias-panaderia-2026", "title": "Qué se come en 2026: el regreso del pan de verdad"},
    {"url": "https://example.com/dia-de-la-madre-regalos", "title": "Día de la Madre: qué se regala este año"},
    {"url": "https://example.com/el-molino", "title": "Panadería El Molino en Instagram"},
    {"url": "https://example.com/dulce-barrio", "title": "Dulce Barrio: tortas por encargo"}]',
  (select id from profiles where workspace_id = (select id from workspaces order by created_at limit 1) and role = 'Administrador' order by created_at limit 1), now() - interval '2 days')
    $q$;
  end if;
end $demo$;

commit;
