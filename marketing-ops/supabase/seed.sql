-- Datos demo (solo para desarrollo y demos). Contraseña "demo1234" para los tres usuarios.
-- Un espacio de trabajo con dos marcas, para mostrar que sirve a un emprendimiento o a una agencia con varios clientes.

do $$
declare
  v_ws uuid := '00000000-0000-4000-8000-000000000001';
  u record;
begin
  insert into workspaces (id, name) values (v_ws, 'Estudio Demo');

  for u in select * from (values
    ('00000000-0000-4000-8000-0000000000a1'::uuid, 'santiago@demo.marketing-ops.test', 'Santiago', 'Administrador'::user_role),
    ('00000000-0000-4000-8000-0000000000a2'::uuid, 'lucia@demo.marketing-ops.test', 'Lucía', 'Creador'::user_role),
    ('00000000-0000-4000-8000-0000000000a3'::uuid, 'mati@demo.marketing-ops.test', 'Mati', 'Revisor'::user_role)
  ) as t(id, email, name, role) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      crypt('demo1234', gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', jsonb_build_object('name', u.name), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now());
    insert into profiles (id, workspace_id, name, role) values (u.id, v_ws, u.name, u.role);
  end loop;

  insert into brands (id, workspace_id, name, industry, city, description, audience, value_prop, products, tone, words_avoid, cta, hashtags, website, instagram, whatsapp, color, updated_by)
  values
    ('00000000-0000-4000-8000-0000000000b1', v_ws, 'La Espiga', 'Panadería y pastelería', 'Godoy Cruz, Mendoza',
     'Panadería de barrio con masa madre, facturas del día y tortas por encargo.',
     'Vecinos de Godoy Cruz, familias y oficinas de la zona que buscan algo rico y casero.',
     'Todo sale del horno esa misma mañana, con masa madre y sin premezclas.',
     'Pan de masa madre, facturas, medialunas de manteca, tortas por encargo, budines, prepizzas',
     '{Cercano,Divertido}', 'barato, industrial, premezcla', 'Pedí por WhatsApp y retirá sin hacer fila', 'laespiga, masamadre, godoycruz',
     '', '@laespiga.panaderia', '+54 9 261 555 0101', '#C2410C', '00000000-0000-4000-8000-0000000000a1'),
    ('00000000-0000-4000-8000-0000000000b2', v_ws, 'Rodar Bikes', 'Bicicletería y taller', 'Ciudad de Mendoza',
     'Venta de bicicletas urbanas y de montaña, repuestos y taller con turno.',
     'Ciclistas urbanos y de fin de semana de 20 a 50 años que usan la bici para moverse o para salir a la montaña.',
     'Service en 48 h con turno online y garantía escrita en cada arreglo.',
     'Bicicletas urbanas, mountain bikes, service completo, cascos, luces, cubiertas',
     '{Directo,Profesional}', 'barato, chino', 'Sacá turno por WhatsApp', 'rodarbikes, ciclismomendoza, mtb',
     'rodarbikes.com.ar', '@rodar.bikes', '+54 9 261 555 0202', '#047857', '00000000-0000-4000-8000-0000000000a1');
end $$;

-- Piezas de ejemplo en todos los estados del circuito.
insert into contents (id, workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, source, created_by, updated_by, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Post', 'Vender',
   'Medialunas de manteca', 'Medialunas recién salidas',
   E'¿Ya probaste nuestras medialunas de manteca? 🥐\n\nLas hacemos todas las mañanas, con manteca de verdad y sin premezclas. Salen calentitas a las 7.\n\nPedí por WhatsApp y retirá sin hacer fila.',
   '#laespiga #masamadre #godoycruz', 'Pedí por WhatsApp y retirá sin hacer fila', 'Publicado', current_date - 3, 'plantilla',
   '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2', now() - interval '6 days', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Reel', 'Promoción',
   'Promo de budines los jueves', 'Jueves de budines',
   E'0-3 s · Gancho: mano cortando un budín todavía caliente. Texto: "Los jueves pasá algo distinto".\n3-10 s · Budines de limón, chocolate y banana saliendo del horno.\n10-20 s · Texto: "Llevando dos, el segundo a mitad de precio".\n20-25 s · Cierre: frente de La Espiga. "Pedí por WhatsApp y retirá sin hacer fila".',
   '#laespiga #godoycruz', 'Pedí por WhatsApp y retirá sin hacer fila', 'Aprobado', current_date + 2, 'ia',
   '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Carrusel', 'Educar',
   '5 señales de que tu bici necesita service', '5 señales de que tu bici pide service',
   E'Placa 1: 5 señales de que tu bici pide service.\nPlaca 2: Los cambios saltan solos.\nPlaca 3: Los frenos chillan o tardan en frenar.\nPlaca 4: La cadena hace ruido aunque la limpies.\nPlaca 5: Las cubiertas pierden aire de un día para el otro.\nPlaca 6: Service en 48 h con garantía escrita. Sacá turno por WhatsApp.',
   '#rodarbikes #ciclismomendoza #mtb', 'Sacá turno por WhatsApp', 'En revisión', current_date + 4, 'plantilla',
   '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2', now() - interval '1 day', now() - interval '20 hours'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'WhatsApp', 'Mensaje', 'Conseguir consultas',
   'Recordatorio de service antes del verano', 'Service antes del verano',
   E'Hola! Te escribimos de Rodar Bikes. Se viene la temporada de salir a la montaña y es el mejor momento para hacerle el service a tu bici.\n\nLo tenemos listo en 48 h y con garantía escrita.\n\nSacá turno por WhatsApp respondiendo este mensaje.',
   '', 'Sacá turno por WhatsApp', 'Borrador', null, 'manual',
   '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', now() - interval '5 hours', now() - interval '5 hours'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Facebook', 'Post', 'Lanzamiento',
   'Tortas por encargo para el Día de la Madre', 'Tortas para el Día de la Madre', '', '', '', 'Idea', null, 'manual',
   '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2', now() - interval '2 hours', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'Instagram', 'Reel', 'Vender',
   'Bicis urbanas para ir al trabajo', 'Al trabajo en bici',
   E'0-3 s · Gancho: semáforo en rojo, autos parados y una bici que pasa por la ciclovía. Texto: "¿Otra vez tarde?".\n3-12 s · Recorrido por el centro de Mendoza en bici urbana.\n12-20 s · Las urbanas del local, con canasto y luces.\n20-25 s · Cierre: "Sacá turno por WhatsApp y probala".',
   '#rodarbikes #ciclismomendoza', 'Sacá turno por WhatsApp', 'Borrador', current_date + 8, 'plantilla',
   '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a2', now() - interval '3 hours', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-0000000000c7', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Instagram', 'Historia', 'Comunidad',
   'Así arranca el día en el horno', 'Así arranca el día en el horno', '', '', '', 'Idea', current_date + 1, 'manual',
   '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', now() - interval '1 hour', now() - interval '1 hour');

insert into content_events (workspace_id, content_id, action, note, by_profile, at) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Creada con plantilla', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '6 days'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Mandó a revisión', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Aprobó', '', '00000000-0000-4000-8000-0000000000a3', now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'Marcó como publicada', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Creada con IA', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Mandó a revisión', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 'Aprobó', '', '00000000-0000-4000-8000-0000000000a3', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'Creada con plantilla', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 'Mandó a revisión', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '20 hours'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c4', 'Creada', '', '00000000-0000-4000-8000-0000000000a1', now() - interval '5 hours'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c5', 'Creada', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '2 hours'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c6', 'Creada con plantilla', '', '00000000-0000-4000-8000-0000000000a2', now() - interval '3 hours'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c7', 'Creada', '', '00000000-0000-4000-8000-0000000000a1', now() - interval '1 hour');
