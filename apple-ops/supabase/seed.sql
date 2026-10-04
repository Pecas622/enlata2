-- Datos demo del prototipo (solo para desarrollo y demos; nunca correr en un local real).
-- Usuarios: contraseña "demo1234" para los cuatro; PIN de mostrador igual al del prototipo.
-- Ventas, cajas e ingresos de ejemplo se agregan en las etapas 3 y 5, usando las funciones reales.

do $$
declare
  v_store uuid := '00000000-0000-4000-8000-000000000001';
  u record;
begin
  insert into stores (id, name, cuit, address, phone, fx, target_margin, max_discount_seller, warranty_new_days, warranty_used_days, cond_mult, defect_costs)
  values (v_store, 'Tu Local Apple', '30-00000000-0', 'Av. San Martín 1234, Mendoza', '+54 9 261 555 0000', 1200, 0.12, 5, 365, 90,
    '{"Usado A": 1, "Usado B": 0.9, "Reacondicionado": 0.85}',
    '{"Pantalla dañada": 90, "Tapa trasera rota": 35, "Cámara con falla": 45, "Face ID / Touch ID no funciona": 80, "Botones con falla": 25, "Puerto de carga con falla": 30, "Parlante / micrófono con falla": 25}');

  insert into catalog_settings (store_id, slug) values (v_store, 'demo');

  insert into trade_in_values (store_id, model, capacity, value_usd) values
    (v_store, 'iPhone 11', 64, 170), (v_store, 'iPhone 11', 128, 195),
    (v_store, 'iPhone 12', 64, 240), (v_store, 'iPhone 12', 128, 270),
    (v_store, 'iPhone 13', 128, 370), (v_store, 'iPhone 13', 256, 420),
    (v_store, 'iPhone 14', 128, 470), (v_store, 'iPhone 14', 256, 520),
    (v_store, 'iPhone 14 Pro', 128, 610), (v_store, 'iPhone 14 Pro', 256, 660),
    (v_store, 'iPhone 15', 128, 580), (v_store, 'iPhone 15 Pro', 128, 780),
    (v_store, 'iPhone 15 Pro', 256, 840), (v_store, 'iPhone 15 Pro Max', 256, 940),
    (v_store, 'iPad 9', 64, 180), (v_store, 'iPad Air M1', 64, 360),
    (v_store, 'MacBook Air M1', 256, 520);

  for u in select * from (values
    ('00000000-0000-4000-8000-0000000000a1'::uuid, 'santiago@demo.apple-ops.test', 'Santiago', 'Administrador'::user_role, 0, '1111'),
    ('00000000-0000-4000-8000-0000000000a2'::uuid, 'lucia@demo.apple-ops.test', 'Lucía', 'Encargado'::user_role, 0, '2222'),
    ('00000000-0000-4000-8000-0000000000a3'::uuid, 'mati@demo.apple-ops.test', 'Mati', 'Vendedor'::user_role, 2, '3333'),
    ('00000000-0000-4000-8000-0000000000a4'::uuid, 'caro@demo.apple-ops.test', 'Caro', 'Cajero'::user_role, 0, '4444')
  ) as t(id, email, name, role, commission, pin) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      crypt('demo1234', gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}', jsonb_build_object('name', u.name), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now());
    insert into profiles (id, store_id, name, role, commission_pct) values (u.id, v_store, u.name, u.role, u.commission);
    insert into profile_pins (profile_id, pin_hash) values (u.id, crypt(u.pin, gen_salt('bf')));
  end loop;
end $$;

-- Equipos (mismos 14 del prototipo). IMEI de prueba con el mismo cálculo que fakeIMEI().
with d (n, kind, model, capacity, color, condition, battery, cost, price, origin, age) as (values
  (1, 'iPhone', 'iPhone 15 Pro', 256, 'Titanio natural', 'Nuevo sellado', 100, 1010, 1190, 'Proveedor', 12),
  (2, 'iPhone', 'iPhone 15', 128, 'Azul', 'Nuevo sellado', 100, 700, 830, 'Proveedor', 12),
  (3, 'iPhone', 'iPhone 14', 128, 'Negro', 'Usado A', 91, 480, 580, 'Compra a particular', 20),
  (4, 'iPhone', 'iPhone 13', 128, 'Rosa', 'Usado A', 88, 370, 450, 'Canje', 34),
  (5, 'iPhone', 'iPhone 14 Pro', 256, 'Negro', 'Usado A', 94, 660, 780, 'Compra a particular', 9),
  (6, 'iPhone', 'iPhone 12', 128, 'Blanco', 'Usado B', 82, 255, 330, 'Canje', 52),
  (7, 'iPhone', 'iPhone 11', 64, 'Negro', 'Usado B', 79, 170, 230, 'Compra a particular', 61),
  (8, 'iPhone', 'iPhone 16 Pro', 256, 'Titanio negro', 'Nuevo sellado', 100, 1180, 1390, 'Proveedor', 5),
  (9, 'iPad', 'iPad 9', 64, 'Plata', 'Nuevo sellado', 100, 270, 340, 'Proveedor', 25),
  (10, 'Mac', 'MacBook Air M1', 256, 'Plata', 'Reacondicionado', 90, 560, 680, 'Compra a particular', 18),
  (11, 'Watch', 'Watch Series 9', 0, 'Rojo', 'Nuevo sellado', 100, 330, 410, 'Proveedor', 14),
  (12, 'AirPods', 'AirPods Pro 2', 0, 'Blanco', 'Nuevo sellado', 100, 190, 245, 'Proveedor', 8),
  (13, 'iPhone', 'iPhone 13', 256, 'Azul', 'Usado A', 90, 420, 500, 'Compra a particular', 3),
  (14, 'iPhone', 'iPhone 15', 128, 'Rosa', 'Nuevo sellado', 100, 700, 830, 'Proveedor', 12)
), ins as (
  insert into devices (id, store_id, kind, model, capacity, color, condition, imei, battery, price_usd, origin, entry_date, warranty_days)
  select ('00000000-0000-4000-8000-1' || lpad(n::text, 11, '0'))::uuid, '00000000-0000-4000-8000-000000000001',
         kind::device_kind, model, capacity, color, condition::device_condition,
         '35' || left((9000000000000 + n * 7919317)::text, 13), battery, price, origin::device_origin,
         dia_ar(now()) - age, case when condition = 'Nuevo sellado' then 365 else 90 end
  from d
  returning id
)
insert into device_costs (device_id, store_id, cost_usd)
select ('00000000-0000-4000-8000-1' || lpad(n::text, 11, '0'))::uuid, '00000000-0000-4000-8000-000000000001', cost from d;

insert into device_events (store_id, device_id, action, by_profile, at)
select d.store_id, d.id, 'Ingreso (' || origin || ') a US$ ' || c.cost_usd::int, '00000000-0000-4000-8000-0000000000a2', entry_date + time '11:00'
from devices d join device_costs c on c.device_id = d.id;

with a (n, sku, name, category, cost, price, stock, min_stock, supplier) as (values
  (1, 'FUN-001', 'Funda silicona iPhone 15', 'Fundas', 3500, 12000, 14, 5, 'Distribuidora Centro'),
  (2, 'FUN-002', 'Funda MagSafe iPhone 15 Pro', 'Fundas', 6500, 19000, 8, 4, 'Distribuidora Centro'),
  (3, 'FUN-003', 'Funda transparente iPhone 13/14', 'Fundas', 2500, 9000, 3, 6, 'Distribuidora Centro'),
  (4, 'VID-001', 'Vidrio templado iPhone 15', 'Vidrios', 1200, 6500, 22, 8, 'ImportCell'),
  (5, 'VID-002', 'Vidrio templado iPhone 13/14', 'Vidrios', 1200, 6500, 18, 8, 'ImportCell'),
  (6, 'VID-003', 'Vidrio privacidad iPhone 15 Pro', 'Vidrios', 2800, 11000, 0, 4, 'ImportCell'),
  (7, 'CAR-001', 'Cargador 20W USB-C', 'Cargadores', 7000, 19000, 9, 4, 'ImportCell'),
  (8, 'CAR-002', 'Cargador MagSafe', 'Cargadores', 16000, 42000, 5, 3, 'ImportCell'),
  (9, 'CAB-001', 'Cable USB-C a Lightning 1m', 'Cables', 4500, 13000, 17, 6, 'Distribuidora Centro'),
  (10, 'CAB-002', 'Cable USB-C a USB-C 1m', 'Cables', 4000, 12000, 12, 6, 'Distribuidora Centro'),
  (11, 'AUR-001', 'Auriculares con cable Lightning', 'Auriculares', 5500, 15000, 2, 4, 'ImportCell'),
  (12, 'SOP-001', 'Soporte auto magnético', 'Soportes', 3200, 10000, 11, 4, 'Distribuidora Centro'),
  (13, 'OTR-001', 'Pop socket', 'Otros', 900, 4500, 25, 10, 'Distribuidora Centro'),
  (14, 'OTR-002', 'Limpieza de equipo (servicio)', 'Otros', 0, 8000, 99, 0, 'Interno')
), ins as (
  insert into accessories (id, store_id, sku, name, category, price_ars, stock, min_stock, supplier)
  select ('00000000-0000-4000-8000-2' || lpad(n::text, 11, '0'))::uuid, '00000000-0000-4000-8000-000000000001',
         sku, name, category::acc_category, price, stock, min_stock, supplier
  from a
  returning id
)
insert into accessory_costs (accessory_id, store_id, cost_ars)
select ('00000000-0000-4000-8000-2' || lpad(n::text, 11, '0'))::uuid, '00000000-0000-4000-8000-000000000001', cost from a;

insert into accessory_moves (store_id, accessory_id, qty, note, by_profile, at)
select store_id, id, stock, 'Stock inicial', '00000000-0000-4000-8000-0000000000a2', now() - interval '20 days'
from accessories where stock > 0;

insert into clients (store_id, name, phone, dni, notes, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'María Gómez', '+54 9 261 555 0101', '30111222', '', now() - interval '40 days'),
  ('00000000-0000-4000-8000-000000000001', 'Juan Pérez', '+54 9 261 555 0102', '28999111', 'Siempre cambia el equipo cada año', now() - interval '33 days'),
  ('00000000-0000-4000-8000-000000000001', 'Lucas Romero', '+54 9 261 555 0103', '35444111', '', now() - interval '20 days'),
  ('00000000-0000-4000-8000-000000000001', 'Sofía Ledesma', '+54 9 261 555 0104', '37222444', '', now() - interval '12 days'),
  ('00000000-0000-4000-8000-000000000001', 'Diego Navarro', '+54 9 261 555 0105', '31777555', '', now() - interval '6 days');

insert into audit_log (store_id, profile_id, user_name, action, detail)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'Santiago', 'Datos demo', 'Se cargaron datos de demostración');
