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

insert into clients (id, store_id, name, phone, dni, notes, created_at) values
  ('00000000-0000-4000-8000-300000000001', '00000000-0000-4000-8000-000000000001', 'María Gómez', '+54 9 261 555 0101', '30111222', '', now() - interval '40 days'),
  ('00000000-0000-4000-8000-300000000002', '00000000-0000-4000-8000-000000000001', 'Juan Pérez', '+54 9 261 555 0102', '28999111', 'Siempre cambia el equipo cada año', now() - interval '33 days'),
  ('00000000-0000-4000-8000-300000000003', '00000000-0000-4000-8000-000000000001', 'Lucas Romero', '+54 9 261 555 0103', '35444111', '', now() - interval '20 days'),
  ('00000000-0000-4000-8000-300000000004', '00000000-0000-4000-8000-000000000001', 'Sofía Ledesma', '+54 9 261 555 0104', '37222444', '', now() - interval '12 days'),
  ('00000000-0000-4000-8000-300000000005', '00000000-0000-4000-8000-000000000001', 'Diego Navarro', '+54 9 261 555 0105', '31777555', '', now() - interval '6 days');

-- ---------- historial de ventas y cajas ----------
-- Seis días cerrados y hoy con la caja abierta, como en el prototipo. Las ventas pasan por
-- registrar_venta (la misma función que usa la app), con la sesión de quien vende.
create function pg_temp.dev(n int) returns text language sql as $$ select '00000000-0000-4000-8000-1' || lpad(n::text, 11, '0') $$;
create function pg_temp.acc(n int) returns text language sql as $$ select '00000000-0000-4000-8000-2' || lpad(n::text, 11, '0') $$;
create function pg_temp.cli(n int) returns text language sql as $$ select '00000000-0000-4000-8000-3' || lpad(n::text, 11, '0') $$;
create function pg_temp.momento(p_off int, p_hour int) returns timestamptz language sql as $$
  select least(now(), ((dia_ar(now()) - p_off) + make_time(p_hour, 0, 0)) at time zone 'America/Argentina/Mendoza')
$$;

create function pg_temp.abrir(p_off int) returns void language sql as $$
  insert into cash_shifts (store_id, number, opened_at, opened_by, opening_ars, opening_usd)
  values ('00000000-0000-4000-8000-000000000001', next_number('00000000-0000-4000-8000-000000000001', 'T'),
    pg_temp.momento(p_off, 9), '00000000-0000-4000-8000-0000000000a4', 50000, 200)
$$;

create function pg_temp.cerrar(p_off int, p_diff_ars numeric, p_diff_usd numeric) returns void language plpgsql as $$
declare
  sh cash_shifts%rowtype;
  v_ars numeric;
  v_usd numeric;
begin
  select * into sh from cash_shifts where status = 'Abierta';
  select ars, usd into v_ars, v_usd from efectivo_esperado(sh.id);
  update cash_shifts set status = 'Cerrada', closed_at = pg_temp.momento(p_off, 21), closed_by = sh.opened_by,
    expected_ars = v_ars, expected_usd = v_usd, counted_ars = v_ars + p_diff_ars, counted_usd = v_usd + p_diff_usd,
    diff_ars = p_diff_ars, diff_usd = p_diff_usd,
    note = case when p_diff_ars <> 0 or p_diff_usd <> 0 then 'Diferencia detectada al contar.' else '' end,
    breakdown = desglose_caja(sh.id)
  where id = sh.id;
end $$;

-- Cobra la mitad en dólares (redondeado a 10) y el resto por transferencia, como el seed del prototipo.
create function pg_temp.vender(p_off int, p_hour int, p_user text, p jsonb) returns void language plpgsql as $$
declare
  v_fx numeric := (select fx from stores where id = '00000000-0000-4000-8000-000000000001');
  v_sub numeric;
  v_due numeric;
  v_usd numeric;
  v_at timestamptz := pg_temp.momento(p_off, p_hour);
  t jsonb := p -> 'trade_in';
  r json;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000' || p_user, 'role', 'authenticated')::text, true);
  select coalesce(sum(case when l ->> 'kind' = 'device' then d.price_usd else a.price_ars * coalesce((l ->> 'qty')::int, 1) / v_fx end), 0)
  into v_sub
  from jsonb_array_elements(p -> 'lines') l
  left join devices d on d.id = (l ->> 'device_id')::uuid
  left join accessories a on a.id = (l ->> 'accessory_id')::uuid;
  v_due := v_sub * (1 - coalesce((p ->> 'discount_pct')::numeric, 0) / 100);
  if t is not null then
    v_due := v_due - (tasar_canje(t ->> 'model', (t ->> 'capacity')::int, t ->> 'cond', (t ->> 'battery')::int,
      array(select jsonb_array_elements_text(t -> 'defects')), true, true) ->> 'value')::numeric;
  end if;
  v_usd := floor(v_due * 0.5 / 10 + 0.5) * 10;
  r := registrar_venta(p || jsonb_build_object('payments', jsonb_build_array(
    jsonb_build_object('method', 'Efectivo USD', 'amount', v_usd),
    jsonb_build_object('method', 'Transferencia ARS', 'amount', greatest(0, round((v_due - v_usd) * v_fx))))));

  update sales set at = v_at where id = (r ->> 'sale_id')::uuid;
  update cash_moves set at = v_at where sale_id = (r ->> 'sale_id')::uuid;
  update device_events set at = v_at where action like '%' || (r ->> 'number') || '%';
  update accessory_moves set at = v_at where note = 'Venta ' || (r ->> 'number');
  update audit_log set at = v_at where detail like (r ->> 'number') || ' ·%';
  update devices set entry_date = dia_ar(v_at) where id = (select device_id from trade_ins where sale_id = (r ->> 'sale_id')::uuid);
end $$;

create function pg_temp.dl(n int) returns jsonb language sql as $$ select jsonb_build_object('kind', 'device', 'device_id', pg_temp.dev(n)) $$;
create function pg_temp.al(n int, q int) returns jsonb language sql as $$ select jsonb_build_object('kind', 'acc', 'accessory_id', pg_temp.acc(n), 'qty', q) $$;

-- usuarios: a2 Lucía (Encargado), a3 Mati (Vendedor), a4 Caro (Cajero)
select pg_temp.abrir(6);
select pg_temp.vender(6, 14, 'a3', jsonb_build_object('lines', jsonb_build_array(pg_temp.dl(9), pg_temp.al(4, 1)), 'client_id', pg_temp.cli(3), 'seller_id', '00000000-0000-4000-8000-0000000000a3'));
select pg_temp.cerrar(6, 0, 0);

select pg_temp.abrir(5);
select pg_temp.vender(5, 16, 'a4', jsonb_build_object('lines', jsonb_build_array(pg_temp.dl(2), pg_temp.al(1, 1), pg_temp.al(4, 1)), 'client_id', pg_temp.cli(1), 'seller_id', '00000000-0000-4000-8000-0000000000a2'));
select pg_temp.cerrar(5, -2000, 0);

select pg_temp.abrir(4);
select pg_temp.vender(4, 13, 'a3', jsonb_build_object('lines', jsonb_build_array(pg_temp.dl(11)), 'seller_id', '00000000-0000-4000-8000-0000000000a3'));
select pg_temp.vender(4, 17, 'a4', jsonb_build_object('lines', jsonb_build_array(pg_temp.al(7, 1), pg_temp.al(9, 2)), 'seller_id', '00000000-0000-4000-8000-0000000000a3'));
select pg_temp.cerrar(4, 0, 0);

select pg_temp.abrir(3);
select pg_temp.vender(3, 15, 'a2', jsonb_build_object('lines', jsonb_build_array(pg_temp.dl(14), pg_temp.al(2, 1)), 'client_id', pg_temp.cli(2), 'seller_id', '00000000-0000-4000-8000-0000000000a2',
  'trade_in', jsonb_build_object('kind', 'iPhone', 'model', 'iPhone 13', 'capacity', 128, 'color', 'Azul', 'cond', 'Usado B', 'battery', 86, 'defects', '[]'::jsonb,
    'imei', '35' || left((9000000000000 + 31 * 7919317)::text, 13))));
select pg_temp.cerrar(3, 0, 0);

select pg_temp.abrir(2);
select pg_temp.vender(2, 18, 'a3', jsonb_build_object('lines', jsonb_build_array(pg_temp.dl(12), pg_temp.al(8, 1)), 'client_id', pg_temp.cli(4), 'seller_id', '00000000-0000-4000-8000-0000000000a3'));
select pg_temp.cerrar(2, 0, 20);

select pg_temp.abrir(1);
select pg_temp.vender(1, 12, 'a4', jsonb_build_object('lines', jsonb_build_array(pg_temp.dl(8), pg_temp.al(12, 1)), 'client_id', pg_temp.cli(5), 'seller_id', '00000000-0000-4000-8000-0000000000a2', 'discount_pct', 2));
select pg_temp.vender(1, 19, 'a3', jsonb_build_object('lines', jsonb_build_array(pg_temp.al(5, 2), pg_temp.al(10, 1), pg_temp.al(13, 2)), 'seller_id', '00000000-0000-4000-8000-0000000000a3'));
select pg_temp.cerrar(1, 0, 0);

-- hoy: caja abierta, una venta con canje y una de accesorios
select pg_temp.abrir(0);
select pg_temp.vender(0, 10, 'a3', jsonb_build_object('lines', jsonb_build_array(pg_temp.dl(3), pg_temp.al(1, 1), pg_temp.al(5, 1)), 'client_id', pg_temp.cli(2), 'seller_id', '00000000-0000-4000-8000-0000000000a3',
  'trade_in', jsonb_build_object('kind', 'iPhone', 'model', 'iPhone 12', 'capacity', 64, 'color', 'Negro', 'cond', 'Usado B', 'battery', 81, 'defects', '["Tapa trasera rota"]'::jsonb,
    'imei', '35' || left((9000000000000 + 32 * 7919317)::text, 13))));
select pg_temp.vender(0, 11, 'a3', jsonb_build_object('lines', jsonb_build_array(pg_temp.al(9, 1), pg_temp.al(13, 1)), 'seller_id', '00000000-0000-4000-8000-0000000000a3'));

insert into audit_log (store_id, profile_id, user_name, action, detail)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'Santiago', 'Datos demo', 'Se cargaron datos de demostración');

update stores set demo_since = now() where id = '00000000-0000-4000-8000-000000000001';
