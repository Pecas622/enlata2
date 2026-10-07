-- Actualización para pegar en SQL Editor: demo para clientes (migración 20261007000000_demo).

-- APPLE OPS · demo para mostrar el sistema a un cliente.
-- cargar_demo llena un local vacío con equipos, accesorios, clientes y una semana de ventas y cajas.
-- borrar_demo deja el local en cero para entregarlo: borra todo lo operativo y conserva el local,
-- los usuarios, la configuración, la tabla de tasación y el catálogo.

alter table stores add column if not exists demo_since timestamptz;

create or replace function cargar_demo() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_store uuid := current_store_id();
  v_fx numeric;
  v_dev uuid[] := '{}';
  v_acc uuid[] := '{}';
  v_cli uuid[] := '{}';
  v_id uuid;
  v_shift uuid;
  v_day int;
  r record;
  s jsonb;
  v_sub numeric;
  v_due numeric;
  v_usd numeric;
  v_at timestamptz;
  v_res json;
  v_ars numeric;
  v_cash_usd numeric;
  -- Ventas de la semana: día (0 = hoy), hora, equipos, accesorios [n, cantidad], cliente, descuento, canje.
  v_sales jsonb := '[
    {"d":6,"h":14,"dev":[9],"acc":[[4,1]],"cli":3},
    {"d":5,"h":16,"dev":[2],"acc":[[1,1],[4,1]],"cli":1},
    {"d":4,"h":13,"dev":[11],"acc":[]},
    {"d":4,"h":17,"dev":[],"acc":[[7,1],[9,2]]},
    {"d":3,"h":15,"dev":[14],"acc":[[2,1]],"cli":2,"canje":{"kind":"iPhone","model":"iPhone 13","capacity":128,"color":"Azul","cond":"Usado B","battery":86,"defects":[],"n":31}},
    {"d":2,"h":18,"dev":[12],"acc":[[8,1]],"cli":4},
    {"d":1,"h":12,"dev":[8],"acc":[[12,1]],"cli":5,"desc":2},
    {"d":1,"h":19,"dev":[],"acc":[[5,2],[10,1],[13,2]]},
    {"d":0,"h":10,"dev":[3],"acc":[[1,1],[5,1]],"cli":2,"canje":{"kind":"iPhone","model":"iPhone 12","capacity":64,"color":"Negro","cond":"Usado B","battery":81,"defects":["Tapa trasera rota"],"n":32}},
    {"d":0,"h":11,"dev":[],"acc":[[9,1],[13,1]]}
  ]';
  v_diff jsonb := '{"5":[-2000,0],"2":[0,20]}';
begin
  if current_app_role() is distinct from 'Administrador' then
    raise exception 'Solo el Administrador puede cargar la demo.' using errcode = '42501';
  end if;
  if exists (select 1 from devices where store_id = v_store) or exists (select 1 from accessories where store_id = v_store)
     or exists (select 1 from clients where store_id = v_store) or exists (select 1 from sales where store_id = v_store)
     or exists (select 1 from cash_shifts where store_id = v_store) then
    raise exception 'El local ya tiene datos. La demo solo se carga en un local vacío.' using errcode = '22023';
  end if;

  -- Si el local todavía no configuró la tasación, se usan los valores del prototipo.
  update stores set defect_costs = '{"Pantalla dañada": 90, "Tapa trasera rota": 35, "Cámara con falla": 45, "Face ID / Touch ID no funciona": 80, "Botones con falla": 25, "Puerto de carga con falla": 30, "Parlante / micrófono con falla": 25}'
  where id = v_store and defect_costs = '{}';
  if not exists (select 1 from trade_in_values where store_id = v_store) then
    insert into trade_in_values (store_id, model, capacity, value_usd)
    select v_store, m, c, v from (values
      ('iPhone 11', 64, 170), ('iPhone 11', 128, 195), ('iPhone 12', 64, 240), ('iPhone 12', 128, 270),
      ('iPhone 13', 128, 370), ('iPhone 13', 256, 420), ('iPhone 14', 128, 470), ('iPhone 14', 256, 520),
      ('iPhone 14 Pro', 128, 610), ('iPhone 14 Pro', 256, 660), ('iPhone 15', 128, 580), ('iPhone 15 Pro', 128, 780),
      ('iPhone 15 Pro', 256, 840), ('iPhone 15 Pro Max', 256, 940), ('iPad 9', 64, 180), ('iPad Air M1', 64, 360),
      ('MacBook Air M1', 256, 520)) t(m, c, v);
  end if;
  select fx into v_fx from stores where id = v_store;

  -- Equipos (los 14 del prototipo), con IMEI de prueba como fakeIMEI().
  for r in select * from (values
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
  ) t(n, kind, model, capacity, color, condition, battery, cost, price, origin, age) order by n loop
    insert into devices (store_id, kind, model, capacity, color, condition, imei, battery, price_usd, origin, entry_date, warranty_days)
    values (v_store, r.kind::device_kind, r.model, r.capacity, r.color, r.condition::device_condition,
      '35' || left((9000000000000 + r.n * 7919317)::text, 13), r.battery, r.price, r.origin::device_origin,
      dia_ar(now()) - r.age, case when r.condition = 'Nuevo sellado' then 365 else 90 end)
    returning id into v_id;
    v_dev := v_dev || v_id;
    insert into device_costs (device_id, store_id, cost_usd) values (v_id, v_store, r.cost);
    insert into device_events (store_id, device_id, action, by_profile, at)
    values (v_store, v_id, 'Ingreso (' || r.origin || ') a US$ ' || r.cost, v_uid, (dia_ar(now()) - r.age) + time '11:00');
  end loop;
  insert into catalog_items (device_id, store_id, featured) values (v_dev[1], v_store, true), (v_dev[5], v_store, true);

  for r in select * from (values
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
  ) t(n, sku, name, category, cost, price, stock, min_stock, supplier) order by n loop
    insert into accessories (store_id, sku, name, category, price_ars, stock, min_stock, supplier)
    values (v_store, r.sku, r.name, r.category::acc_category, r.price, r.stock, r.min_stock, r.supplier)
    returning id into v_id;
    v_acc := v_acc || v_id;
    insert into accessory_costs (accessory_id, store_id, cost_ars) values (v_id, v_store, r.cost);
    if r.stock > 0 then
      insert into accessory_moves (store_id, accessory_id, qty, note, by_profile, at)
      values (v_store, v_id, r.stock, 'Stock inicial', v_uid, now() - interval '20 days');
    end if;
  end loop;

  for r in select * from (values
    (1, 'María Gómez', '+54 9 261 555 0101', '30111222', '', 40),
    (2, 'Juan Pérez', '+54 9 261 555 0102', '28999111', 'Siempre cambia el equipo cada año', 33),
    (3, 'Lucas Romero', '+54 9 261 555 0103', '35444111', '', 20),
    (4, 'Sofía Ledesma', '+54 9 261 555 0104', '37222444', '', 12),
    (5, 'Diego Navarro', '+54 9 261 555 0105', '31777555', '', 6)
  ) t(n, name, phone, dni, notes, age) order by n loop
    insert into clients (store_id, name, phone, dni, notes, created_at)
    values (v_store, r.name, r.phone, r.dni, r.notes, now() - make_interval(days => r.age))
    returning id into v_id;
    v_cli := v_cli || v_id;
  end loop;

  -- Una semana de cajas: seis días cerrados y hoy abierta. Las ventas pasan por registrar_venta.
  for v_day in reverse 6..0 loop
    insert into cash_shifts (store_id, number, opened_at, opened_by, opening_ars, opening_usd)
    values (v_store, next_number(v_store, 'T'), least(now(), ((dia_ar(now()) - v_day) + time '09:00') at time zone 'America/Argentina/Mendoza'), v_uid, 50000, 200)
    returning id into v_shift;

    for s in select e from jsonb_array_elements(v_sales) e where (e ->> 'd')::int = v_day loop
      v_at := least(now(), ((dia_ar(now()) - v_day) + make_time((s ->> 'h')::int, 0, 0)) at time zone 'America/Argentina/Mendoza');
      s := jsonb_build_object(
        'lines', (select coalesce(jsonb_agg(x), '[]') from (
          select jsonb_build_object('kind', 'device', 'device_id', v_dev[n::int]) x from jsonb_array_elements_text(s -> 'dev') n
          union all
          select jsonb_build_object('kind', 'acc', 'accessory_id', v_acc[(a ->> 0)::int], 'qty', (a ->> 1)::int) from jsonb_array_elements(s -> 'acc') a) q),
        'client_id', case when s ? 'cli' then v_cli[(s ->> 'cli')::int] end,
        'discount_pct', coalesce((s ->> 'desc')::numeric, 0),
        'trade_in', case when s ? 'canje' then (s -> 'canje') - 'n' || jsonb_build_object('imei', '35' || left((9000000000000 + (s -> 'canje' ->> 'n')::int * 7919317)::text, 13)) end);
      s := jsonb_strip_nulls(s);

      -- Cobra la mitad en dólares (redondeado a 10) y el resto por transferencia, como el prototipo.
      select coalesce(sum(case when l ->> 'kind' = 'device' then d.price_usd else a.price_ars * coalesce((l ->> 'qty')::int, 1) / v_fx end), 0)
      into v_sub
      from jsonb_array_elements(s -> 'lines') l
      left join devices d on d.id = (l ->> 'device_id')::uuid
      left join accessories a on a.id = (l ->> 'accessory_id')::uuid;
      v_due := v_sub * (1 - (s ->> 'discount_pct')::numeric / 100);
      if s ? 'trade_in' then
        v_due := v_due - (tasar_canje(s -> 'trade_in' ->> 'model', (s -> 'trade_in' ->> 'capacity')::int, s -> 'trade_in' ->> 'cond',
          (s -> 'trade_in' ->> 'battery')::int, array(select jsonb_array_elements_text(s -> 'trade_in' -> 'defects')), true, true) ->> 'value')::numeric;
      end if;
      v_usd := floor(v_due * 0.5 / 10 + 0.5) * 10;
      v_res := registrar_venta(s || jsonb_build_object('payments', jsonb_build_array(
        jsonb_build_object('method', 'Efectivo USD', 'amount', v_usd),
        jsonb_build_object('method', 'Transferencia ARS', 'amount', greatest(0, round((v_due - v_usd) * v_fx))))));

      update sales set at = v_at where id = (v_res ->> 'sale_id')::uuid;
      update cash_moves set at = v_at where sale_id = (v_res ->> 'sale_id')::uuid;
      update device_events set at = v_at where store_id = v_store and action like '%' || (v_res ->> 'number') || '%';
      update accessory_moves set at = v_at where store_id = v_store and note = 'Venta ' || (v_res ->> 'number');
      update audit_log set at = v_at where store_id = v_store and detail like (v_res ->> 'number') || ' ·%';
      update devices set entry_date = dia_ar(v_at) where id = (select device_id from trade_ins where sale_id = (v_res ->> 'sale_id')::uuid);
    end loop;

    if v_day > 0 then
      select ars, usd into v_ars, v_cash_usd from efectivo_esperado(v_shift);
      update cash_shifts set status = 'Cerrada',
        closed_at = least(now(), ((dia_ar(now()) - v_day) + time '21:00') at time zone 'America/Argentina/Mendoza'), closed_by = v_uid,
        expected_ars = v_ars, expected_usd = v_cash_usd,
        counted_ars = v_ars + coalesce((v_diff -> v_day::text ->> 0)::numeric, 0),
        counted_usd = v_cash_usd + coalesce((v_diff -> v_day::text ->> 1)::numeric, 0),
        diff_ars = coalesce((v_diff -> v_day::text ->> 0)::numeric, 0), diff_usd = coalesce((v_diff -> v_day::text ->> 1)::numeric, 0),
        note = case when v_diff ? v_day::text then 'Diferencia detectada al contar.' else '' end,
        breakdown = desglose_caja(v_shift)
      where id = v_shift;
    end if;
  end loop;

  update stores set demo_since = now() where id = v_store;
  perform log_event('Datos demo', 'Se cargaron datos de demostración');
end $$;

-- Deja el local en cero. Devuelve las rutas de fotos borradas para que la app las quite de Storage.
create or replace function borrar_demo() returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_photos text[];
begin
  if current_app_role() is distinct from 'Administrador' then
    raise exception 'Solo el Administrador puede borrar la demo.' using errcode = '42501';
  end if;
  if (select demo_since from stores where id = v_store) is null then
    raise exception 'Este local no tiene una demo cargada.' using errcode = '22023';
  end if;

  select coalesce(array_agg(photo_path), '{}') into v_photos from catalog_items where store_id = v_store and photo_path is not null;
  delete from assistant_chats where store_id = v_store;
  update devices set sold_sale_id = null where store_id = v_store;
  delete from cash_moves where store_id = v_store;
  delete from sales where store_id = v_store;
  delete from purchases where store_id = v_store;
  delete from cash_shifts where store_id = v_store;
  delete from devices where store_id = v_store;
  delete from accessories where store_id = v_store;
  delete from clients where store_id = v_store;
  delete from store_counters where store_id = v_store;
  delete from audit_log where store_id = v_store;
  update stores set demo_since = null where id = v_store;
  perform log_event('Datos demo', 'Se borraron los datos de demostración. El local quedó en cero.');
  return v_photos;
end $$;

revoke execute on function cargar_demo() from public, anon;
revoke execute on function borrar_demo() from public, anon;
grant execute on function cargar_demo() to authenticated;
grant execute on function borrar_demo() to authenticated;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261007000000', 'demo') on conflict do nothing;
