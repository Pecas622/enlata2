-- APPLE OPS: base para un proyecto nuevo de Supabase (parte 2 de 2, después de la parte 1). Pegar entero en SQL Editor y tocar Run. No incluye datos demo.

-- ===== 20261004020100_ventas_y_canje.sql =====
-- APPLE OPS · etapa 3: ventas, plan canje y anulaciones.
-- Todo se escribe por funciones transaccionales: la venta descuenta stock, cobra por caja, ingresa el
-- canje al stock y deja historial y registro; la anulación revierte las tres cosas.

alter table sales add column client_phone text not null default '';

alter table sale_lines drop constraint sale_lines_check;
alter table sale_lines add constraint sale_lines_ref_check check (
  (kind = 'device' and device_id is not null and accessory_id is null)
  or (kind = 'acc' and accessory_id is not null and device_id is null)
  or (kind = 'service' and device_id is null and accessory_id is null)
);

-- Tasación del canje en la base: réplica exacta de appraise() del prototipo (src/lib/appraise.ts).
-- Usa double precision y floor(x + 0.5) para redondear igual que Math.round de JavaScript.
create or replace function tasar_canje(
  p_model text,
  p_capacity int,
  p_cond text,
  p_battery int,
  p_defects text[] default '{}',
  p_icloud_free boolean default true,
  p_imei_clean boolean default true
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_cfg stores%rowtype;
  v_base float8;
  v_value float8;
  v_mult float8;
  v_adj float8;
  v_bat int := coalesce(nullif(p_battery, 0), 100);
  v_pen float8;
  v_def text;
  v_lines jsonb;
begin
  if v_store is null then raise exception 'Sesión inválida.' using errcode = '42501'; end if;
  if coalesce(p_model, '') = '' then
    return jsonb_build_object('ok', false, 'base', 0, 'value', 0, 'lines', '[]'::jsonb, 'reason', 'Elegí el modelo del equipo.');
  end if;
  if p_icloud_free is false then
    return jsonb_build_object('ok', false, 'blocked', true, 'base', 0, 'value', 0, 'lines', '[]'::jsonb,
      'reason', 'Equipo con bloqueo de iCloud o Buscar mi iPhone activo. No se puede tomar.');
  end if;
  if p_imei_clean is false then
    return jsonb_build_object('ok', false, 'blocked', true, 'base', 0, 'value', 0, 'lines', '[]'::jsonb,
      'reason', 'IMEI con denuncia o bloqueo. No se puede tomar.');
  end if;
  select value_usd into v_base from trade_in_values
  where store_id = v_store and model = p_model and capacity = coalesce(p_capacity, 0);
  if v_base is null then
    return jsonb_build_object('ok', false, 'base', 0, 'value', 0, 'lines', '[]'::jsonb,
      'reason', 'Este modelo no tiene valor de referencia. Cargalo en Configuración o ingresá el valor a mano.');
  end if;

  select * into v_cfg from stores where id = v_store;
  v_lines := jsonb_build_array(jsonb_build_object('label', 'Valor de referencia ' || p_model
    || case when coalesce(p_capacity, 0) > 0 then ' ' || p_capacity || 'GB' else '' end, 'amount', v_base));
  v_value := v_base;

  v_mult := (v_cfg.cond_mult ->> p_cond)::float8;
  if v_mult is not null and v_mult <> 1 then
    v_adj := floor(v_value * (v_mult - 1) + 0.5);
    v_lines := v_lines || jsonb_build_object('label', 'Condición ' || p_cond, 'amount', v_adj);
    v_value := v_value + v_adj;
  end if;

  v_pen := case when v_bat < 80 then 0.08 when v_bat < 90 then 0.03 else 0 end;
  if v_pen > 0 then
    v_adj := -floor(v_base * v_pen + 0.5);
    v_lines := v_lines || jsonb_build_object('label', 'Batería al ' || v_bat || '%', 'amount', v_adj);
    v_value := v_value + v_adj;
  end if;

  foreach v_def in array coalesce(p_defects, '{}') loop
    v_adj := coalesce((v_cfg.defect_costs ->> v_def)::float8, 0);
    v_lines := v_lines || jsonb_build_object('label', v_def, 'amount', -v_adj);
    v_value := v_value - v_adj;
  end loop;

  v_value := greatest(0, floor(v_value / 5 + 0.5) * 5);
  return jsonb_build_object('ok', true, 'base', v_base, 'value', v_value, 'lines', v_lines);
end $$;

-- Venta con canje opcional. Recibe un json:
-- { lines: [{ kind: 'device'|'acc'|'service', device_id?, accessory_id?, description?, qty?, unit_price? }],
--   discount_pct?, seller_id?, client_id?, client_name?, client_phone?, notes?,
--   payments: [{ method, amount }],
--   trade_in?: { kind, model, capacity, color, cond, battery, imei, defects, icloud_free, imei_clean, note, value_usd? } }
-- Los totales, el costo, la tasación y el tope del canje los calcula la base, no la pantalla.
create or replace function registrar_venta(p jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_uid uuid := auth.uid();
  v_role user_role := current_app_role();
  v_mgr boolean := is_manager();
  v_cfg stores%rowtype;
  v_shift uuid;
  v_sale uuid := gen_random_uuid();
  v_number text;
  v_seller uuid;
  v_client clients%rowtype;
  v_client_id uuid;
  v_client_name text := coalesce(trim(p ->> 'client_name'), '');
  v_client_phone text := coalesce(trim(p ->> 'client_phone'), '');
  v_disc numeric := coalesce(nullif(p ->> 'discount_pct', '')::numeric, 0);
  l jsonb;
  pay jsonb;
  t jsonb := p -> 'trade_in';
  d devices%rowtype;
  a accessories%rowtype;
  v_qty int;
  v_unit numeric;
  v_desc text;
  v_line uuid;
  v_sub numeric := 0;
  v_discount numeric;
  v_total numeric;
  v_due numeric;
  v_paid numeric := 0;
  v_ti numeric := 0;
  v_ap jsonb;
  v_ti_kind device_kind;
  v_ti_model text;
  v_ti_cap int;
  v_ti_cond device_condition;
  v_ti_imei text;
  v_ti_defects text[];
  v_ti_dev uuid;
  v_resale numeric;
  v_method pay_method;
  v_amount numeric;
begin
  if v_store is null then raise exception 'Sesión inválida.' using errcode = '42501'; end if;
  select * into v_cfg from stores where id = v_store;

  select id into v_shift from cash_shifts where store_id = v_store and status = 'Abierta';
  if v_shift is null then raise exception 'No hay caja abierta. Abrí la caja para registrar ventas.' using errcode = '22023'; end if;
  if jsonb_typeof(p -> 'lines') is distinct from 'array' or jsonb_array_length(p -> 'lines') = 0 then
    raise exception 'Agregá al menos un producto.' using errcode = '22023';
  end if;
  if v_disc < 0 or v_disc > 100 then raise exception 'El descuento tiene que estar entre 0 y 100%%.' using errcode = '22023'; end if;
  if not v_mgr and v_disc > v_cfg.max_discount_seller then
    raise exception using errcode = '42501', message = format('Tu rol permite hasta %s%% de descuento.', trim_scale(v_cfg.max_discount_seller));
  end if;

  -- Vendedor: por defecto quien registra la venta, si vende.
  v_seller := coalesce(nullif(p ->> 'seller_id', '')::uuid, case when v_role <> 'Cajero' then v_uid end);
  if v_seller is null or not exists (
    select 1 from profiles where id = v_seller and store_id = v_store and active and role in ('Vendedor', 'Encargado', 'Administrador')
  ) then
    raise exception 'Elegí el vendedor.' using errcode = '22023';
  end if;

  -- Cliente: uno existente, uno nuevo si se cargó el nombre, o consumidor final.
  if nullif(p ->> 'client_id', '') is not null then
    select * into v_client from clients where id = (p ->> 'client_id')::uuid and store_id = v_store;
    if not found then raise exception 'Cliente no encontrado.' using errcode = 'P0002'; end if;
    v_client_id := v_client.id;
    v_client_name := v_client.name;
    if v_client_phone = '' then v_client_phone := v_client.phone; end if;
  elsif v_client_name <> '' then
    insert into clients (store_id, name, phone) values (v_store, v_client_name, v_client_phone) returning id into v_client_id;
  else
    v_client_name := 'Consumidor final';
  end if;

  v_number := next_number(v_store, 'V');
  insert into sales (id, store_id, number, shift_id, client_id, client_name, client_phone, seller_id, cashier_id, discount_pct, fx,
    subtotal_usd, total_usd, notes)
  values (v_sale, v_store, v_number, v_shift, v_client_id, v_client_name, v_client_phone, v_seller, v_uid, v_disc, v_cfg.fx,
    0, 0, coalesce(trim(p ->> 'notes'), ''));

  for l in select * from jsonb_array_elements(p -> 'lines') loop
    v_unit := nullif(l ->> 'unit_price', '')::numeric;
    case l ->> 'kind'
    when 'device' then
      select * into d from devices where id = (l ->> 'device_id')::uuid and store_id = v_store for update;
      if not found then raise exception 'Equipo no encontrado.' using errcode = 'P0002'; end if;
      v_desc := d.model || case when d.capacity > 0 then ' ' || d.capacity || 'GB' else '' end
        || case when d.color <> '' then ' · ' || d.color else '' end;
      if d.status <> 'Disponible' then
        raise exception 'El % ya no está disponible (%).', v_desc, d.status using errcode = '22023';
      end if;
      v_unit := coalesce(v_unit, d.price_usd);
      if v_unit <> d.price_usd and not v_mgr then raise exception 'Tu rol no puede cambiar precios.' using errcode = '42501'; end if;
      if v_unit < 0 then raise exception 'El precio no puede ser negativo.' using errcode = '22023'; end if;

      insert into sale_lines (store_id, sale_id, kind, device_id, description, qty, unit_price, currency)
      values (v_store, v_sale, 'device', d.id, v_desc, 1, v_unit, 'USD') returning id into v_line;
      insert into sale_line_costs (sale_line_id, store_id, unit_cost, currency)
      values (v_line, v_store, coalesce((select cost_usd from device_costs where device_id = d.id), 0), 'USD');
      update devices set status = 'Vendido', sold_sale_id = v_sale where id = d.id;
      insert into device_events (store_id, device_id, action, by_profile) values (v_store, d.id, 'Vendido en ' || v_number, v_uid);
      v_sub := v_sub + v_unit;

    when 'acc' then
      select * into a from accessories where id = (l ->> 'accessory_id')::uuid and store_id = v_store for update;
      if not found then raise exception 'Accesorio no encontrado.' using errcode = 'P0002'; end if;
      v_qty := coalesce(nullif(l ->> 'qty', '')::int, 1);
      if v_qty < 1 then raise exception 'La cantidad tiene que ser al menos 1.' using errcode = '22023'; end if;
      if a.stock < v_qty then
        raise exception 'No hay stock suficiente de % (quedan %).', a.name, a.stock using errcode = '22023';
      end if;
      v_unit := coalesce(v_unit, a.price_ars);
      if v_unit <> a.price_ars and not v_mgr then raise exception 'Tu rol no puede cambiar precios.' using errcode = '42501'; end if;
      if v_unit < 0 then raise exception 'El precio no puede ser negativo.' using errcode = '22023'; end if;

      insert into sale_lines (store_id, sale_id, kind, accessory_id, description, qty, unit_price, currency)
      values (v_store, v_sale, 'acc', a.id, a.name, v_qty, v_unit, 'ARS') returning id into v_line;
      insert into sale_line_costs (sale_line_id, store_id, unit_cost, currency)
      values (v_line, v_store, coalesce((select cost_ars from accessory_costs where accessory_id = a.id), 0), 'ARS');
      update accessories set stock = stock - v_qty where id = a.id;
      insert into accessory_moves (store_id, accessory_id, qty, note, by_profile) values (v_store, a.id, -v_qty, 'Venta ' || v_number, v_uid);
      v_sub := v_sub + v_unit * v_qty / v_cfg.fx;

    when 'service' then
      v_desc := coalesce(trim(l ->> 'description'), '');
      if v_desc = '' then raise exception 'Escribí el concepto.' using errcode = '22023'; end if;
      if coalesce(v_unit, 0) <= 0 then raise exception 'El precio del concepto debe ser mayor a cero.' using errcode = '22023'; end if;
      insert into sale_lines (store_id, sale_id, kind, description, qty, unit_price, currency)
      values (v_store, v_sale, 'service', v_desc, 1, v_unit, 'ARS') returning id into v_line;
      insert into sale_line_costs (sale_line_id, store_id, unit_cost, currency) values (v_line, v_store, 0, 'ARS');
      v_sub := v_sub + v_unit / v_cfg.fx;

    else
      raise exception 'Línea de venta inválida.' using errcode = '22023';
    end case;
  end loop;

  -- Plan canje: se tasa acá, se controla el tope del rol y el equipo entra al stock al valor tomado.
  if jsonb_typeof(t) = 'object' then
    if v_role = 'Cajero' then raise exception 'Tu rol no puede tomar equipos en canje.' using errcode = '42501'; end if;
    v_ti_kind := coalesce(nullif(t ->> 'kind', ''), 'iPhone')::device_kind;
    if v_ti_kind not in ('iPhone', 'iPad', 'Mac') then raise exception 'En canje se toman iPhone, iPad o Mac.' using errcode = '22023'; end if;
    v_ti_model := coalesce(trim(t ->> 'model'), '');
    v_ti_cap := coalesce(nullif(t ->> 'capacity', '')::int, 0);
    v_ti_cond := coalesce(nullif(t ->> 'cond', ''), 'Usado B')::device_condition;
    v_ti_imei := coalesce(trim(t ->> 'imei'), '');
    v_ti_defects := coalesce((select array_agg(x) from jsonb_array_elements_text(t -> 'defects') x), '{}');
    if v_ti_model = '' then raise exception 'Elegí el modelo del equipo que entrega el cliente.' using errcode = '22023'; end if;
    if (v_ti_kind in ('iPhone', 'iPad') and v_ti_imei !~ '^\d{15}$') or (v_ti_kind = 'Mac' and length(v_ti_imei) < 6) then
      raise exception 'Ingresá un IMEI / serie válido del equipo que entrega el cliente.' using errcode = '22023';
    end if;
    if v_ti_cond = 'Nuevo sellado' then raise exception 'Un equipo de canje no entra como nuevo sellado.' using errcode = '22023'; end if;

    v_ap := tasar_canje(v_ti_model, v_ti_cap, v_ti_cond::text, nullif(t ->> 'battery', '')::int, v_ti_defects,
      coalesce((t ->> 'icloud_free')::boolean, true), coalesce((t ->> 'imei_clean')::boolean, true));
    if (v_ap ->> 'blocked')::boolean then raise exception '%', v_ap ->> 'reason' using errcode = '22023'; end if;

    v_ti := coalesce(nullif(t ->> 'value_usd', '')::numeric, case when (v_ap ->> 'ok')::boolean then (v_ap ->> 'value')::numeric end);
    if v_ti is null then raise exception 'Sin valor de referencia: ingresá el valor a mano.' using errcode = '22023'; end if;
    if exists (select 1 from devices where store_id = v_store and imei = v_ti_imei and status not in ('Vendido', 'Retirado')) then
      raise exception 'El IMEI del equipo que entrega el cliente ya está en stock.' using errcode = '23505';
    end if;
    if (v_ap ->> 'ok')::boolean and v_ti > (v_ap ->> 'value')::numeric and not v_mgr then
      raise exception 'Tu rol no permite tomar el equipo por encima de US$ %. Pedí autorización al encargado.', v_ap ->> 'value' using errcode = '42501';
    end if;
    if v_ti <= 0 then raise exception 'El valor tomado debe ser mayor a cero.' using errcode = '22023'; end if;

    v_resale := greatest(0, floor(v_ti::float8 * (1 + v_cfg.target_margin::float8) / 10 + 0.5) * 10);
    insert into devices (store_id, kind, model, capacity, color, condition, imei, battery, price_usd, origin, warranty_days, notes)
    values (v_store, v_ti_kind, v_ti_model, v_ti_cap, coalesce(t ->> 'color', ''), v_ti_cond, v_ti_imei,
      nullif(t ->> 'battery', '')::int, v_resale, 'Canje', v_cfg.warranty_used_days,
      coalesce(concat_ws(' · ',
        case when cardinality(v_ti_defects) > 0 then 'Defectos: ' || array_to_string(v_ti_defects, ', ') end,
        nullif(trim(t ->> 'note'), '')), ''))
    returning id into v_ti_dev;
    insert into device_costs (device_id, store_id, cost_usd) values (v_ti_dev, v_store, v_ti);
    insert into device_events (store_id, device_id, action, by_profile)
    values (v_store, v_ti_dev, 'Ingresó por plan canje (' || v_number || ') a US$ ' || round(v_ti), v_uid);
    insert into trade_ins (store_id, sale_id, device_id, appraisal, value_usd, resale_usd, icloud_free, imei_clean)
    values (v_store, v_sale, v_ti_dev, v_ap, v_ti, v_resale, true, true);
  end if;

  v_discount := v_sub * v_disc / 100;
  v_total := v_sub - v_discount;
  v_due := v_total - v_ti;
  if v_due < -0.5 then raise exception 'El valor del canje supera el total de la compra.' using errcode = '22023'; end if;

  if jsonb_typeof(p -> 'payments') = 'array' then
    for pay in select * from jsonb_array_elements(p -> 'payments') loop
      v_amount := coalesce(nullif(pay ->> 'amount', '')::numeric, 0);
      continue when v_amount <= 0;
      v_method := (pay ->> 'method')::pay_method;
      insert into sale_payments (store_id, sale_id, method, currency, amount)
      values (v_store, v_sale, v_method, case when v_method = 'Efectivo USD' then 'USD'::currency else 'ARS'::currency end, v_amount);
      insert into cash_moves (store_id, shift_id, type, concept, method, currency, amount, sale_id, by_profile)
      values (v_store, v_shift, 'Ingreso', 'Venta ' || v_number, v_method,
        case when v_method = 'Efectivo USD' then 'USD'::currency else 'ARS'::currency end, v_amount, v_sale, v_uid);
      v_paid := v_paid + case when v_method = 'Efectivo USD' then v_amount else v_amount / v_cfg.fx end;
    end loop;
  end if;
  if v_due - v_paid > 0.5 then
    raise exception 'Falta cobrar US$ %.', round(v_due - v_paid) using errcode = '22023';
  elsif v_paid - greatest(v_due, 0) > 0.5 then
    raise exception 'Hay US$ % de más: ajustá los pagos.', round(v_paid - greatest(v_due, 0)) using errcode = '22023';
  end if;

  update sales set subtotal_usd = round(v_sub, 2), discount_usd = round(v_discount, 2), total_usd = round(v_total, 2),
    trade_in_usd = v_ti, paid_usd = round(v_paid, 2)
  where id = v_sale;

  perform log_event('Venta', v_number || ' · US$ ' || round(v_total)
    || case when v_ti > 0 then ' · con canje US$ ' || round(v_ti) else '' end);
  return json_build_object('sale_id', v_sale, 'number', v_number);
end $$;

-- Anulación: devuelve los equipos y accesorios al stock, registra el egreso en caja de lo cobrado
-- y retira del stock el equipo recibido en canje. Solo Administrador y Encargado, con motivo.
create or replace function anular_venta(p_sale uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_uid uuid := auth.uid();
  s sales%rowtype;
  v_shift uuid;
  v_ti record;
  r record;
begin
  if not is_manager() then raise exception 'Tu rol no puede anular ventas.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Escribí el motivo de la anulación.' using errcode = '22023'; end if;
  select * into s from sales where id = p_sale and store_id = v_store for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if s.status = 'Anulada' then raise exception 'La venta % ya está anulada.', s.number using errcode = '22023'; end if;

  select id into v_shift from cash_shifts where store_id = v_store and status = 'Abierta';
  if v_shift is null and exists (select 1 from sale_payments where sale_id = p_sale) then
    raise exception 'Abrí la caja para registrar la devolución del dinero.' using errcode = '22023';
  end if;

  select t.device_id, d.status, d.model, d.capacity, (select number from sales where id = d.sold_sale_id) as sold_in
  into v_ti
  from trade_ins t join devices d on d.id = t.device_id
  where t.sale_id = p_sale
  for update of d;
  if found and v_ti.status = 'Vendido' then
    raise exception 'El equipo recibido en canje ya se vendió en %. Anulá esa venta primero.', v_ti.sold_in using errcode = '22023';
  end if;

  for r in update devices set status = 'Disponible', sold_sale_id = null where sold_sale_id = p_sale returning id loop
    insert into device_events (store_id, device_id, action, by_profile) values (v_store, r.id, 'Venta ' || s.number || ' anulada', v_uid);
  end loop;

  if v_ti.device_id is not null and v_ti.status <> 'Retirado' then
    update devices set status = 'Retirado' where id = v_ti.device_id;
    insert into device_events (store_id, device_id, action, by_profile)
    values (v_store, v_ti.device_id, 'Canje ' || s.number || ' anulado: equipo devuelto', v_uid);
  end if;

  for r in select accessory_id, sum(qty)::int as qty from sale_lines where sale_id = p_sale and kind = 'acc' group by accessory_id loop
    update accessories set stock = stock + r.qty where id = r.accessory_id;
    insert into accessory_moves (store_id, accessory_id, qty, note, by_profile) values (v_store, r.accessory_id, r.qty, 'Anulación ' || s.number, v_uid);
  end loop;

  insert into cash_moves (store_id, shift_id, type, concept, method, currency, amount, sale_id, by_profile)
  select v_store, v_shift, 'Egreso', 'Anulación ' || s.number, method, currency, amount, p_sale, v_uid
  from sale_payments where sale_id = p_sale;

  update sales set status = 'Anulada', void_reason = trim(p_reason), voided_by = v_uid, voided_at = now() where id = p_sale;
  perform log_event('Venta anulada', s.number || ' · ' || trim(p_reason));
end $$;

-- El vendedor no lee la caja, pero necesita saber si está abierta para vender.
create or replace function caja_abierta() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cash_shifts where store_id = current_store_id() and status = 'Abierta')
$$;

revoke execute on function caja_abierta from public, anon;
grant execute on function caja_abierta to authenticated;
revoke execute on function tasar_canje from public, anon;
revoke execute on function registrar_venta from public, anon;
revoke execute on function anular_venta from public, anon;
grant execute on function tasar_canje to authenticated;
grant execute on function registrar_venta to authenticated;
grant execute on function anular_venta to authenticated;

-- ===== 20261005000000_accesorios_y_clientes.sql =====
-- APPLE OPS · etapa 4: accesorios y clientes.
-- Altas, ediciones y reposiciones pasan por funciones que dejan movimiento de stock y registro.

-- SKU automático por categoría: FUN-001, VID-002... sigue al mayor número usado, no al conteo.
create or replace function next_sku(p_store uuid, p_category acc_category) returns text
language sql stable security definer set search_path = public as $$
  select upper(left(p_category::text, 3)) || '-' || lpad((coalesce(max(nullif(substring(sku from '^' || upper(left(p_category::text, 3)) || '-(\d+)$'), '')::int), 0) + 1)::text, 3, '0')
  from accessories where store_id = p_store
$$;
revoke execute on function next_sku(uuid, acc_category) from public, anon, authenticated;

-- Alta o edición de un accesorio. El stock inicial entra como movimiento; después solo cambia
-- por reposición, venta o anulación. El costo lo carga solo quien lo puede ver.
create or replace function guardar_accesorio(
  p_id uuid,
  p_name text,
  p_category acc_category,
  p_price_ars numeric,
  p_min_stock int default 0,
  p_supplier text default '',
  p_sku text default '',
  p_cost_ars numeric default null,
  p_stock int default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_id uuid := p_id;
  v_sku text := upper(coalesce(trim(p_sku), ''));
  a accessories%rowtype;
  v_changes text;
begin
  if not is_manager() then raise exception 'Tu rol no puede cargar ni editar accesorios.' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribí el nombre del accesorio.' using errcode = '22023'; end if;
  if coalesce(p_price_ars, 0) <= 0 then raise exception 'El precio debe ser mayor a cero.' using errcode = '22023'; end if;
  if coalesce(p_min_stock, 0) < 0 or coalesce(p_stock, 0) < 0 or coalesce(p_cost_ars, 0) < 0 then
    raise exception 'Stock y costo no pueden ser negativos.' using errcode = '22023';
  end if;
  if v_sku <> '' and exists (select 1 from accessories where store_id = v_store and sku = v_sku and id is distinct from p_id) then
    raise exception 'El SKU % ya existe.', v_sku using errcode = '23505';
  end if;

  if p_id is null then
    if v_sku = '' then v_sku := next_sku(v_store, p_category); end if;
    insert into accessories (store_id, sku, name, category, price_ars, stock, min_stock, supplier)
    values (v_store, v_sku, trim(p_name), p_category, p_price_ars, coalesce(p_stock, 0), coalesce(p_min_stock, 0), coalesce(trim(p_supplier), ''))
    returning id into v_id;
    insert into accessory_costs (accessory_id, store_id, cost_ars) values (v_id, v_store, coalesce(p_cost_ars, 0));
    if coalesce(p_stock, 0) > 0 then
      insert into accessory_moves (store_id, accessory_id, qty, note, by_profile) values (v_store, v_id, p_stock, 'Stock inicial', auth.uid());
    end if;
    perform log_event('Accesorio nuevo', v_sku || ' · ' || trim(p_name));
    return v_id;
  end if;

  select * into a from accessories where id = p_id and store_id = v_store for update;
  if not found then raise exception 'Accesorio no encontrado.' using errcode = 'P0002'; end if;
  v_changes := concat_ws(' · ',
    case when p_price_ars <> a.price_ars then 'precio $ ' || round(a.price_ars) || ' → $ ' || round(p_price_ars) end,
    case when trim(p_name) <> a.name then 'nombre' end,
    case when coalesce(p_min_stock, 0) <> a.min_stock then 'mínimo ' || a.min_stock || ' → ' || coalesce(p_min_stock, 0) end);
  update accessories set name = trim(p_name), category = p_category, price_ars = p_price_ars, min_stock = coalesce(p_min_stock, 0),
    supplier = coalesce(trim(p_supplier), ''), sku = case when v_sku = '' then sku else v_sku end
  where id = p_id;
  if p_cost_ars is not null then
    insert into accessory_costs (accessory_id, store_id, cost_ars) values (p_id, v_store, p_cost_ars)
    on conflict (accessory_id) do update set cost_ars = excluded.cost_ars;
  end if;
  perform log_event('Accesorio editado', a.sku || ' · ' || trim(p_name) || coalesce(' · ' || nullif(v_changes, ''), ''));
  return p_id;
end $$;

-- Reposición: suma stock y recalcula el costo promedio ponderado, como el prototipo.
create or replace function reponer_accesorio(p_id uuid, p_qty int, p_unit_cost numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  a accessories%rowtype;
  v_cost numeric;
  v_unit numeric;
begin
  if not is_manager() then raise exception 'Tu rol no puede reponer stock.' using errcode = '42501'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Ingresá una cantidad mayor a cero.' using errcode = '22023'; end if;
  if p_unit_cost is not null and p_unit_cost < 0 then raise exception 'El costo no puede ser negativo.' using errcode = '22023'; end if;
  select * into a from accessories where id = p_id and store_id = v_store for update;
  if not found then raise exception 'Accesorio no encontrado.' using errcode = 'P0002'; end if;

  v_cost := coalesce((select cost_ars from accessory_costs where accessory_id = p_id), 0);
  v_unit := coalesce(p_unit_cost, v_cost);
  insert into accessory_costs (accessory_id, store_id, cost_ars)
  values (p_id, v_store, round((a.stock * v_cost + p_qty * v_unit) / (a.stock + p_qty)))
  on conflict (accessory_id) do update set cost_ars = excluded.cost_ars;
  update accessories set stock = stock + p_qty where id = p_id;
  insert into accessory_moves (store_id, accessory_id, qty, note, by_profile)
  values (v_store, p_id, p_qty, 'Reposición a $ ' || round(v_unit) || ' c/u', auth.uid());
  perform log_event('Reposición', a.name || ' +' || p_qty);
end $$;

-- Carga masiva: una fila por accesorio { name, category, cost, price, stock }. Todo o nada.
create or replace function carga_masiva_accesorios(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_cat acc_category;
  n int := 0;
begin
  if not is_manager() then raise exception 'Tu rol no puede cargar accesorios.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No hay líneas para cargar.' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_cat := case when r ->> 'category' = any (enum_range(null::acc_category)::text[]) then (r ->> 'category')::acc_category else 'Otros' end;
    perform guardar_accesorio(null, r ->> 'name', v_cat, nullif(r ->> 'price', '')::numeric, 3, '', '',
      coalesce(nullif(r ->> 'cost', '')::numeric, 0), coalesce(nullif(r ->> 'stock', '')::int, 0));
    n := n + 1;
  end loop;
  perform log_event('Carga masiva', n || ' accesorios');
  return n;
end $$;

-- Cliente: alta o edición por cualquier rol del local, con registro.
create or replace function guardar_cliente(
  p_id uuid,
  p_name text,
  p_phone text default '',
  p_dni text default '',
  p_email text default '',
  p_notes text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_id uuid;
begin
  if v_store is null then raise exception 'Sesión inválida.' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Escribí el nombre del cliente.' using errcode = '22023'; end if;
  if nullif(trim(p_dni), '') is not null and exists (
    select 1 from clients where store_id = v_store and dni = trim(p_dni) and id is distinct from p_id
  ) then
    raise exception 'Ya hay un cliente con DNI %.', trim(p_dni) using errcode = '23505';
  end if;
  if p_id is null then
    insert into clients (store_id, name, phone, dni, email, notes)
    values (v_store, trim(p_name), coalesce(trim(p_phone), ''), coalesce(trim(p_dni), ''), coalesce(trim(p_email), ''), coalesce(trim(p_notes), ''))
    returning id into v_id;
    perform log_event('Cliente nuevo', trim(p_name));
  else
    update clients set name = trim(p_name), phone = coalesce(trim(p_phone), ''), dni = coalesce(trim(p_dni), ''),
      email = coalesce(trim(p_email), ''), notes = coalesce(trim(p_notes), '')
    where id = p_id and store_id = v_store
    returning id into v_id;
    if v_id is null then raise exception 'Cliente no encontrado.' using errcode = 'P0002'; end if;
    perform log_event('Cliente editado', trim(p_name));
  end if;
  return v_id;
end $$;

-- Resumen de compras por cliente (solo ventas cerradas). Respeta los permisos de quien consulta.
create view clientes_resumen with (security_invoker = true) as
select c.id, c.store_id, c.name, c.phone, c.dni, c.email, c.notes, c.created_at,
  coalesce(s.compras, 0)::int as compras, coalesce(s.total_usd, 0) as total_usd, s.ultima
from clients c
left join lateral (
  select count(*) as compras, sum(total_usd) as total_usd, max(at) as ultima
  from sales where client_id = c.id and status = 'Cerrada'
) s on true;
grant select on clientes_resumen to authenticated;

-- Escrituras directas cerradas: todo pasa por las funciones de arriba, que dejan registro.
drop policy accessories_write on accessories;
drop policy accessory_costs_mgr on accessory_costs;
create policy accessory_costs_select on accessory_costs for select to authenticated
  using (store_id = current_store_id() and is_manager());
drop policy clients_all on clients;
create policy clients_select on clients for select to authenticated using (store_id = current_store_id());

revoke execute on function guardar_accesorio from public, anon;
revoke execute on function reponer_accesorio from public, anon;
revoke execute on function carga_masiva_accesorios from public, anon;
revoke execute on function guardar_cliente from public, anon;
grant execute on function guardar_accesorio to authenticated;
grant execute on function reponer_accesorio to authenticated;
grant execute on function carga_masiva_accesorios to authenticated;
grant execute on function guardar_cliente to authenticated;

-- ===== 20261005010000_caja.sql =====
-- APPLE OPS · etapa 5: caja. Apertura, movimientos manuales y cierre con arqueo, por funciones.
-- Una sola caja abierta por local (índice cash_shifts_una_abierta). El Cajero cuenta a ciegas:
-- resumen_caja no le devuelve el efectivo esperado hasta que cierra.

create or replace function puede_caja() returns boolean
language sql stable security definer set search_path = public as $$
  select current_app_role() in ('Administrador', 'Encargado', 'Cajero')
$$;

-- Efectivo esperado: apertura + ingresos − egresos en efectivo, por moneda.
create or replace function efectivo_esperado(p_shift uuid, out ars numeric, out usd numeric)
language sql stable security definer set search_path = public as $$
  select s.opening_ars + coalesce(sum(case when m.type = 'Ingreso' then m.amount else -m.amount end) filter (where m.method = 'Efectivo ARS'), 0),
         s.opening_usd + coalesce(sum(case when m.type = 'Ingreso' then m.amount else -m.amount end) filter (where m.method = 'Efectivo USD'), 0)
  from cash_shifts s left join cash_moves m on m.shift_id = s.id
  where s.id = p_shift
  group by s.id
$$;

-- Desglose por medio de pago: [{ method, cur, cash, inc, out, net }] en el orden de los medios.
create or replace function desglose_caja(p_shift uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_agg(jsonb_build_object(
      'method', m.method,
      'cur', case when m.method = 'Efectivo USD' then 'USD' else 'ARS' end,
      'cash', m.method in ('Efectivo USD', 'Efectivo ARS'),
      'inc', coalesce(x.inc, 0), 'out', coalesce(x.out, 0), 'net', coalesce(x.inc, 0) - coalesce(x.out, 0)) order by m.ord)
  from unnest(enum_range(null::pay_method)) with ordinality m(method, ord)
  left join (
    select method, sum(amount) filter (where type = 'Ingreso') inc, sum(amount) filter (where type = 'Egreso') out
    from cash_moves where shift_id = p_shift group by method
  ) x on x.method = m.method
$$;
revoke execute on function efectivo_esperado(uuid) from public, anon, authenticated;
revoke execute on function desglose_caja(uuid) from public, anon, authenticated;

create or replace function abrir_caja(p_opening_ars numeric, p_opening_usd numeric) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_open text;
  v_id uuid;
  v_number text;
begin
  if not puede_caja() then raise exception 'Tu rol no maneja la caja.' using errcode = '42501'; end if;
  if coalesce(p_opening_ars, 0) < 0 or coalesce(p_opening_usd, 0) < 0 then
    raise exception 'El efectivo inicial no puede ser negativo.' using errcode = '22023';
  end if;
  select number into v_open from cash_shifts where store_id = v_store and status = 'Abierta';
  if v_open is not null then raise exception 'Ya hay una caja abierta (%).', v_open using errcode = '23505'; end if;
  v_number := next_number(v_store, 'T');
  insert into cash_shifts (store_id, number, opened_by, opening_ars, opening_usd)
  values (v_store, v_number, auth.uid(), coalesce(p_opening_ars, 0), coalesce(p_opening_usd, 0))
  returning id into v_id;
  perform log_event('Apertura de caja', v_number || ' · $ ' || round(coalesce(p_opening_ars, 0)) || ' + US$ ' || round(coalesce(p_opening_usd, 0)));
  return json_build_object('shift_id', v_id, 'number', v_number);
end $$;

-- Movimiento manual: retiros, gastos, pagos a proveedor, ingresos sueltos.
create or replace function movimiento_caja(p_type move_type, p_method pay_method, p_concept text, p_amount numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_shift uuid;
  v_id uuid;
  v_cur currency := case when p_method = 'Efectivo USD' then 'USD'::currency else 'ARS'::currency end;
begin
  if not puede_caja() then raise exception 'Tu rol no maneja la caja.' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Ingresá un monto mayor a cero.' using errcode = '22023'; end if;
  if coalesce(trim(p_concept), '') = '' then raise exception 'Elegí el concepto.' using errcode = '22023'; end if;
  select id into v_shift from cash_shifts where store_id = v_store and status = 'Abierta';
  if v_shift is null then raise exception 'No hay caja abierta.' using errcode = '22023'; end if;
  insert into cash_moves (store_id, shift_id, type, concept, method, currency, amount, by_profile)
  values (v_store, v_shift, p_type, trim(p_concept), p_method, v_cur, p_amount, auth.uid())
  returning id into v_id;
  perform log_event('Movimiento de caja', p_type || ' ' || case when v_cur = 'USD' then 'US$ ' else '$ ' end || round(p_amount) || ' · ' || trim(p_concept));
  return v_id;
end $$;

-- Estado de la caja abierta. Al Cajero no le muestra el efectivo esperado (arqueo ciego).
create or replace function resumen_caja() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  s cash_shifts%rowtype;
  e record;
  v_blind boolean := current_app_role() = 'Cajero';
  v_br jsonb;
begin
  if not puede_caja() then raise exception 'Tu rol no maneja la caja.' using errcode = '42501'; end if;
  select * into s from cash_shifts where store_id = v_store and status = 'Abierta';
  if not found then return null; end if;
  select * into e from efectivo_esperado(s.id);
  v_br := desglose_caja(s.id);
  if v_blind then
    v_br := (select jsonb_agg(b) from jsonb_array_elements(v_br) b where not (b ->> 'cash')::boolean);
  end if;
  return json_build_object(
    'id', s.id, 'number', s.number, 'opened_at', s.opened_at,
    'opened_by', (select name from profiles where id = s.opened_by),
    'opening_ars', s.opening_ars, 'opening_usd', s.opening_usd,
    'blind', v_blind,
    'expected_ars', case when v_blind then null else e.ars end,
    'expected_usd', case when v_blind then null else e.usd end,
    'breakdown', v_br);
end $$;

-- Cierre con arqueo: guarda esperado, contado, diferencia y desglose. Sin el Cajero, una
-- diferencia exige motivo (el Cajero no la ve, así que para él la nota es opcional).
create or replace function cerrar_caja(p_counted_ars numeric, p_counted_usd numeric, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  s cash_shifts%rowtype;
  e record;
  v_diff_ars numeric;
  v_diff_usd numeric;
begin
  if not puede_caja() then raise exception 'Tu rol no maneja la caja.' using errcode = '42501'; end if;
  if p_counted_ars is null or p_counted_usd is null then raise exception 'Cargá el efectivo contado en pesos y en dólares.' using errcode = '22023'; end if;
  if p_counted_ars < 0 or p_counted_usd < 0 then raise exception 'El efectivo contado no puede ser negativo.' using errcode = '22023'; end if;
  select * into s from cash_shifts where store_id = v_store and status = 'Abierta' for update;
  if not found then raise exception 'No hay caja abierta.' using errcode = '22023'; end if;
  select * into e from efectivo_esperado(s.id);
  v_diff_ars := p_counted_ars - e.ars;
  v_diff_usd := p_counted_usd - e.usd;
  if (v_diff_ars <> 0 or v_diff_usd <> 0) and current_app_role() <> 'Cajero' and coalesce(trim(p_note), '') = '' then
    raise exception 'Escribí el motivo de la diferencia.' using errcode = '22023';
  end if;
  update cash_shifts set status = 'Cerrada', closed_at = now(), closed_by = auth.uid(),
    expected_ars = e.ars, expected_usd = e.usd, counted_ars = p_counted_ars, counted_usd = p_counted_usd,
    diff_ars = v_diff_ars, diff_usd = v_diff_usd, note = coalesce(trim(p_note), ''), breakdown = desglose_caja(s.id)
  where id = s.id;
  perform log_event('Cierre de caja', s.number || case when v_diff_ars <> 0 or v_diff_usd <> 0 then ' · con diferencia' else ' · sin diferencias' end);
  return s.id;
end $$;

-- Quien cierra un turno ajeno también puede ver su reporte.
drop policy cash_shifts_select on cash_shifts;
create policy cash_shifts_select on cash_shifts for select to authenticated using (
  store_id = current_store_id() and (is_manager() or (current_app_role() = 'Cajero' and (opened_by = auth.uid() or closed_by = auth.uid() or status = 'Abierta')))
);

revoke execute on function puede_caja from public, anon;
revoke execute on function abrir_caja from public, anon;
revoke execute on function movimiento_caja from public, anon;
revoke execute on function resumen_caja from public, anon;
revoke execute on function cerrar_caja from public, anon;
grant execute on function puede_caja to authenticated;
grant execute on function abrir_caja to authenticated;
grant execute on function movimiento_caja to authenticated;
grant execute on function resumen_caja to authenticated;
grant execute on function cerrar_caja to authenticated;

-- ===== 20261005020000_usuarios_y_config.sql =====
-- APPLE OPS · etapa 6: usuarios, configuración y estado de caja para el dashboard.
-- Usuarios, local y tabla de tasación dejan de escribirse directo: pasan por funciones que
-- validan, dejan registro y cuidan que quede al menos un administrador activo.

drop policy profiles_write on profiles;
drop policy stores_update on stores;
drop policy tiv_write on trade_in_values;

-- Alta o edición de un usuario. En el alta, el servidor primero crea la cuenta de Auth (email y
-- contraseña, con la clave de servicio) y después llama a esta función con ese id.
create or replace function guardar_usuario(p_id uuid, p_name text, p_role user_role, p_commission numeric default 0,
  p_active boolean default true, p_pin text default '') returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_store uuid := current_store_id();
  v_old profiles%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_pin text := trim(coalesce(p_pin, ''));
begin
  if not is_admin() then raise exception 'Solo el administrador gestiona usuarios.' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Escribí el nombre del usuario.' using errcode = '22023'; end if;
  if coalesce(p_commission, 0) < 0 or coalesce(p_commission, 0) > 100 then
    raise exception 'La comisión va de 0 a 100%%.' using errcode = '22023';
  end if;
  if v_pin <> '' and v_pin !~ '^\d{4}$' then raise exception 'El PIN tiene que ser de 4 dígitos.' using errcode = '22023'; end if;

  select * into v_old from profiles where id = p_id;
  if found then
    if v_old.store_id <> v_store then raise exception 'Ese usuario no es de tu local.' using errcode = '42501'; end if;
    if v_old.role = 'Administrador' and v_old.active and (p_role <> 'Administrador' or not coalesce(p_active, true))
       and not exists (select 1 from profiles where store_id = v_store and role = 'Administrador' and active and id <> p_id) then
      raise exception 'Tiene que quedar al menos un administrador activo.' using errcode = '22023';
    end if;
    update profiles set name = v_name, role = p_role, commission_pct = coalesce(p_commission, 0), active = coalesce(p_active, true)
    where id = p_id;
  else
    if not exists (select 1 from auth.users where id = p_id) then raise exception 'Falta crear la cuenta del usuario.' using errcode = '22023'; end if;
    if v_pin = '' then raise exception 'Elegí un PIN de 4 dígitos para el usuario.' using errcode = '22023'; end if;
    insert into profiles (id, store_id, name, role, commission_pct, active)
    values (p_id, v_store, v_name, p_role, coalesce(p_commission, 0), coalesce(p_active, true));
  end if;

  if v_pin <> '' then
    insert into profile_pins (profile_id, pin_hash) values (p_id, crypt(v_pin, gen_salt('bf')))
    on conflict (profile_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;
  end if;

  perform log_event(case when v_old.id is null then 'Usuario nuevo' else 'Usuario editado' end,
    v_name || ' (' || p_role || ')' || case when not coalesce(p_active, true) then ' · inactivo' else '' end
    || case when v_pin <> '' and v_old.id is not null then ' · PIN nuevo' else '' end);
  return p_id;
end $$;

-- Datos del local, reglas comerciales y tabla de tasación, en una sola operación.
-- p: { name, cuit, address, phone, fx, target_margin, max_discount_seller, warranty_new_days,
--      warranty_used_days, cond_mult: {..}, defect_costs: {..}, base_values: [{model, capacity, value}] }
-- Los modelos que no vienen en base_values se borran de la tabla.
create or replace function guardar_config(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  s stores%rowtype;
  v_fx numeric := (p ->> 'fx')::numeric;
  r jsonb;
  v_changes text[] := '{}';
begin
  if not is_admin() then raise exception 'Solo el administrador cambia la configuración.' using errcode = '42501'; end if;
  if trim(coalesce(p ->> 'name', '')) = '' then raise exception 'Escribí el nombre del local.' using errcode = '22023'; end if;
  if v_fx is null or v_fx <= 0 then raise exception 'La cotización tiene que ser mayor a cero.' using errcode = '22023'; end if;
  if (p ->> 'target_margin')::numeric not between 0 and 1 then
    raise exception 'El margen objetivo va de 0 a 1 (por ejemplo 0.12 es 12%%).' using errcode = '22023';
  end if;
  if (p ->> 'max_discount_seller')::numeric not between 0 and 100 then
    raise exception 'El descuento máximo va de 0 a 100%%.' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p -> 'base_values', '[]')) loop
    if trim(coalesce(r ->> 'model', '')) = '' or (r ->> 'value')::numeric < 0 then
      raise exception 'Revisá la tabla de tasación: cada fila necesita modelo y un valor positivo.' using errcode = '22023';
    end if;
  end loop;

  select * into s from stores where id = v_store for update;
  if s.fx <> v_fx then v_changes := v_changes || format('cotización $ %s → $ %s', trim_scale(s.fx), trim_scale(v_fx)); end if;
  if s.max_discount_seller <> (p ->> 'max_discount_seller')::numeric then
    v_changes := v_changes || format('descuento máx. %s%% → %s%%', trim_scale(s.max_discount_seller), trim_scale((p ->> 'max_discount_seller')::numeric));
  end if;

  update stores set
    name = trim(p ->> 'name'), cuit = trim(coalesce(p ->> 'cuit', '')), address = trim(coalesce(p ->> 'address', '')),
    phone = trim(coalesce(p ->> 'phone', '')), fx = v_fx, target_margin = (p ->> 'target_margin')::numeric,
    max_discount_seller = (p ->> 'max_discount_seller')::numeric,
    warranty_new_days = coalesce((p ->> 'warranty_new_days')::int, warranty_new_days),
    warranty_used_days = coalesce((p ->> 'warranty_used_days')::int, warranty_used_days),
    cond_mult = coalesce(p -> 'cond_mult', cond_mult), defect_costs = coalesce(p -> 'defect_costs', defect_costs)
  where id = v_store;

  if p ? 'base_values' then
    delete from trade_in_values t where t.store_id = v_store and not exists (
      select 1 from jsonb_array_elements(p -> 'base_values') b
      where trim(b ->> 'model') = t.model and coalesce((b ->> 'capacity')::int, 0) = t.capacity);
    insert into trade_in_values (store_id, model, capacity, value_usd)
    select v_store, trim(b ->> 'model'), coalesce((b ->> 'capacity')::int, 0), (b ->> 'value')::numeric
    from jsonb_array_elements(p -> 'base_values') b
    on conflict (store_id, model, capacity) do update set value_usd = excluded.value_usd;
  end if;

  perform log_event('Configuración', case when cardinality(v_changes) = 0 then 'Se actualizaron los parámetros' else array_to_string(v_changes, ' · ') end);
end $$;

-- Estado de la caja para cualquier rol (el dashboard del Vendedor también lo muestra). Sin montos.
create or replace function estado_caja() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('number', s.number, 'opened_at', s.opened_at, 'opened_by', p.name)
  from cash_shifts s join profiles p on p.id = s.opened_by
  where s.store_id = current_store_id() and s.status = 'Abierta'
$$;

revoke execute on function guardar_usuario from public, anon;
revoke execute on function guardar_config from public, anon;
revoke execute on function estado_caja from public, anon;
grant execute on function guardar_usuario to authenticated;
grant execute on function guardar_config to authenticated;
grant execute on function estado_caja to authenticated;

-- ===== 20261005030000_catalogo.sql =====
-- APPLE OPS · etapa 7: catálogo público, panel del catálogo y cotizador "Cotizá tu iPhone".
-- El catálogo se arma solo desde el stock. Lo público sale de vistas que nunca exponen costos,
-- IMEI, clientes ni márgenes; las escrituras del panel pasan por funciones con registro.

drop policy catalog_settings_write on catalog_settings;
drop policy catalog_items_write on catalog_items;

-- Las vistas públicas suman lo que necesita la página (orden por ingreso, cotización, garantías).
create or replace view catalogo_publico with (security_barrier) as
select d.id, d.store_id, cs.slug, d.kind, d.model, d.capacity, d.color, d.condition,
       d.battery, d.price_usd, d.warranty_days, coalesce(ci.featured, false) as featured, ci.photo_path,
       d.entry_date
from devices d
join catalog_settings cs on cs.store_id = d.store_id and cs.published
left join catalog_items ci on ci.device_id = d.id
where d.status = 'Disponible' and coalesce(ci.visible, true);

create or replace view catalogo_config_publica with (security_barrier) as
select store_id, slug, s.name as store_name, s.address, whatsapp, headline, tagline,
       assistant_on, assistant_name, greeting,
       s.phone, s.fx, s.warranty_new_days, s.warranty_used_days
from catalog_settings join stores s on s.id = store_id
where published;

-- Valores de referencia del plan canje para el cotizador público. Son los mismos que se le
-- cotizan al cliente en el local: no son costos ni márgenes.
create view tasacion_publica with (security_barrier) as
select t.store_id, cs.slug, t.model, t.capacity, t.value_usd,
       coalesce((s.cond_mult ->> 'Usado A')::numeric, 1) as mult_usado_a
from trade_in_values t
join catalog_settings cs on cs.store_id = t.store_id and cs.published
join stores s on s.id = t.store_id;

-- Para mostrar "catálogo pausado" sin exponer nada más.
create view catalogo_estado with (security_barrier) as
select cs.slug, s.name as store_name, cs.published from catalog_settings cs join stores s on s.id = cs.store_id;

revoke all on catalogo_publico, catalogo_config_publica, tasacion_publica, catalogo_estado from public, anon, authenticated;
grant select on catalogo_publico, catalogo_config_publica, tasacion_publica, catalogo_estado to anon, authenticated;

-- Textos, contacto y opciones del catálogo.
create or replace function guardar_catalogo(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_slug text := lower(trim(coalesce(p ->> 'slug', '')));
  v_wa text := regexp_replace(coalesce(p ->> 'whatsapp', ''), '[^0-9]', '', 'g');
  v_old catalog_settings%rowtype;
begin
  if not is_manager() then raise exception 'Tu rol no puede cambiar el catálogo.' using errcode = '42501'; end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$' then
    raise exception 'El link tiene que tener entre 3 y 40 letras, números o guiones.' using errcode = '22023';
  end if;
  if v_wa <> '' and length(v_wa) < 8 then raise exception 'Revisá el WhatsApp: con código de país, por ejemplo 5492615550000.' using errcode = '22023'; end if;
  if exists (select 1 from catalog_settings where slug = v_slug and store_id <> v_store) then
    raise exception 'El link /catalogo/% ya lo usa otro local.', v_slug using errcode = '23505';
  end if;
  select * into v_old from catalog_settings where store_id = v_store;
  insert into catalog_settings (store_id, slug) values (v_store, v_slug) on conflict (store_id) do nothing;
  update catalog_settings set
    slug = v_slug,
    whatsapp = v_wa,
    headline = coalesce(nullif(trim(p ->> 'headline'), ''), headline),
    tagline = coalesce(trim(p ->> 'tagline'), tagline),
    published = coalesce((p ->> 'published')::boolean, published),
    show_accessories = coalesce((p ->> 'show_accessories')::boolean, show_accessories)
  where store_id = v_store;
  perform log_event('Catálogo',
    case
      when v_old.published is distinct from coalesce((p ->> 'published')::boolean, v_old.published)
        then case when (p ->> 'published')::boolean then 'Catálogo publicado' else 'Catálogo pausado' end
      else 'Se actualizaron textos y opciones'
    end);
end $$;

-- Visible y destacado por equipo.
create or replace function catalogo_equipo(p_device uuid, p_visible boolean, p_featured boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_store uuid := current_store_id();
begin
  if not is_manager() then raise exception 'Tu rol no puede cambiar el catálogo.' using errcode = '42501'; end if;
  if not exists (select 1 from devices where id = p_device and store_id = v_store) then
    raise exception 'No se encontró el equipo.' using errcode = '22023';
  end if;
  insert into catalog_items (device_id, store_id, visible, featured) values (p_device, v_store, coalesce(p_visible, true), coalesce(p_featured, false))
  on conflict (device_id) do update set visible = excluded.visible, featured = excluded.featured;
end $$;

-- Toque en "Consultar por WhatsApp" desde el catálogo público: se cuenta para el panel.
create or replace function registrar_consulta(p_slug text, p_item uuid, p_label text) returns void
language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  select store_id into v_store from catalog_settings where slug = p_slug and published;
  if v_store is null then return; end if;
  if p_item is not null and not exists (select 1 from devices where id = p_item and store_id = v_store)
     and not exists (select 1 from accessories where id = p_item and store_id = v_store) then
    p_item := null;
  end if;
  insert into assistant_chats (store_id, kind, topic, item_id)
  values (v_store, 'click', left(coalesce(nullif(trim(p_label), ''), 'Consulta general'), 120), p_item);
end $$;

revoke execute on function guardar_catalogo from public, anon;
revoke execute on function catalogo_equipo from public, anon;
revoke execute on function registrar_consulta from public;
grant execute on function guardar_catalogo to authenticated;
grant execute on function catalogo_equipo to authenticated;
grant execute on function registrar_consulta to anon, authenticated;

-- ===== 20261005040000_asistente.sql =====
-- APPLE OPS · etapa 8: asistente de chat del catálogo.
-- El asistente corre en el servidor de la app (la clave de la IA nunca llega al navegador) y
-- solo lee vistas públicas. Cada conversación queda registrada para el panel del catálogo.

-- La tasación del canje por chat usa estado y fallas, así que la vista pública suma los
-- multiplicadores por estado y los descuentos por falla. Son los mismos valores que se le
-- cotizan al cliente en el local: no son costos ni márgenes.
create or replace view tasacion_publica with (security_barrier) as
select t.store_id, cs.slug, t.model, t.capacity, t.value_usd,
       coalesce((s.cond_mult ->> 'Usado A')::numeric, 1) as mult_usado_a,
       s.cond_mult as mult_por_estado, s.defect_costs as descuentos_por_falla
from trade_in_values t
join catalog_settings cs on cs.store_id = t.store_id and cs.published
join stores s on s.id = t.store_id;

-- Opciones del asistente en el panel del catálogo.
create or replace function guardar_asistente(p_on boolean, p_name text, p_greeting text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_old catalog_settings%rowtype;
begin
  if not is_manager() then raise exception 'Tu rol no puede cambiar el catálogo.' using errcode = '42501'; end if;
  if length(coalesce(trim(p_greeting), '')) > 300 then raise exception 'El saludo puede tener hasta 300 caracteres.' using errcode = '22023'; end if;
  select * into v_old from catalog_settings where store_id = v_store;
  if not found then raise exception 'Primero guardá el link del catálogo.' using errcode = '22023'; end if;
  update catalog_settings set
    assistant_on = coalesce(p_on, assistant_on),
    assistant_name = coalesce(nullif(left(trim(p_name), 40), ''), 'Asistente'),
    greeting = coalesce(trim(p_greeting), '')
  where store_id = v_store;
  perform log_event('Catálogo',
    case
      when v_old.assistant_on is distinct from coalesce(p_on, v_old.assistant_on)
        then case when p_on then 'Asistente de chat activado' else 'Asistente de chat desactivado' end
      else 'Se actualizó el asistente de chat'
    end);
end $$;

-- Cada respuesta del asistente actualiza la fila de su conversación (una por visitante y sesión).
-- Se llama desde el servidor de la app con la clave pública: el id lo genera el navegador.
create or replace function registrar_chat(p_slug text, p_id uuid, p_topic text, p_messages jsonb, p_handoff boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_msgs jsonb;
  v_last text;
begin
  select store_id into v_store from catalog_settings where slug = p_slug and published and assistant_on;
  if v_store is null or p_id is null or jsonb_typeof(p_messages) is distinct from 'array' then return; end if;
  -- Solo texto, recortado: rol y contenido de los últimos 40 mensajes.
  select coalesce(jsonb_agg(jsonb_build_object('role', m ->> 'role', 'text', left(coalesce(m ->> 'text', ''), 600)) order by n), '[]')
    into v_msgs
  from (select m, n from jsonb_array_elements(p_messages) with ordinality as e(m, n)
        where m ->> 'role' in ('user', 'bot') order by n desc limit 40) x;
  select left(m ->> 'text', 200) into v_last
  from jsonb_array_elements(v_msgs) with ordinality as e(m, n) where m ->> 'role' = 'user' order by n desc limit 1;
  insert into assistant_chats (id, store_id, kind, topic, messages, last_message, handoff)
  values (p_id, v_store, 'chat', left(coalesce(nullif(trim(p_topic), ''), 'Consulta'), 60), v_msgs, coalesce(v_last, ''), coalesce(p_handoff, false))
  on conflict (id) do update set
    topic = case when assistant_chats.topic = 'Consulta' then excluded.topic else assistant_chats.topic end,
    messages = excluded.messages,
    last_message = excluded.last_message,
    handoff = assistant_chats.handoff or excluded.handoff,
    updated_at = now()
  where assistant_chats.store_id = v_store and assistant_chats.kind = 'chat';
end $$;

revoke execute on function guardar_asistente from public, anon;
grant execute on function guardar_asistente to authenticated;
revoke execute on function registrar_chat from public;
grant execute on function registrar_chat to anon, authenticated;

-- ===== 20261005050000_fotos_y_alta.sql =====
-- APPLE OPS · etapa 9: fotos de los equipos del catálogo y alta del primer local en producción.

-- Bucket público de fotos (solo lectura pública). Las subidas las hace el servidor de la app con la
-- clave de servicio, después de que catalogo_equipo_foto valida rol y equipo, así que el bucket no
-- necesita políticas de escritura. Si el proyecto no tiene Storage, se saltea.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('fotos-equipos', 'fotos-equipos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Guarda (o quita, con null) la foto de un equipo. La ruta tiene que ser <local>/<equipo>-<número>.<ext>
-- para que nadie apunte a la foto de otro local. Devuelve la ruta anterior para borrarla.
create or replace function catalogo_equipo_foto(p_device uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_dev devices%rowtype;
  v_old text;
begin
  if not is_manager() then raise exception 'Tu rol no puede cambiar el catálogo.' using errcode = '42501'; end if;
  select * into v_dev from devices where id = p_device and store_id = v_store;
  if not found then raise exception 'No se encontró el equipo.' using errcode = '22023'; end if;
  if p_path is not null and p_path !~ ('^' || v_store || '/' || p_device || '-[0-9]+\.(jpg|png|webp)$') then
    raise exception 'Ruta de foto inválida.' using errcode = '22023';
  end if;
  select photo_path into v_old from catalog_items where device_id = p_device;
  insert into catalog_items (device_id, store_id, photo_path) values (p_device, v_store, p_path)
  on conflict (device_id) do update set photo_path = excluded.photo_path;
  perform log_event('Catálogo',
    case when p_path is null then 'Se quitó la foto de ' else 'Nueva foto de ' end
    || v_dev.model || case when v_dev.capacity > 0 then ' ' || v_dev.capacity || 'GB' else '' end);
  return v_old;
end $$;

revoke execute on function catalogo_equipo_foto from public, anon;
grant execute on function catalogo_equipo_foto to authenticated;

-- Alta de un local nuevo con su primer Administrador. La cuenta de Auth la crea antes el script
-- `npm run crear-local`; esta función solo la corre la clave de servicio.
create or replace function crear_local(p_name text, p_slug text, p_admin uuid, p_admin_name text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_store uuid;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_admin_name), '') = '' then
    raise exception 'Faltan el nombre del local o del administrador.' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$' then
    raise exception 'El link tiene que tener entre 3 y 40 letras, números o guiones.' using errcode = '22023';
  end if;
  if exists (select 1 from catalog_settings where slug = v_slug) then
    raise exception 'El link /catalogo/% ya lo usa otro local.', v_slug using errcode = '23505';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'El PIN tiene que tener 4 números.' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_admin) then raise exception 'No existe la cuenta del administrador.' using errcode = '22023'; end if;
  if exists (select 1 from profiles where id = p_admin) then raise exception 'Esa cuenta ya pertenece a un local.' using errcode = '23505'; end if;

  insert into stores (name) values (trim(p_name)) returning id into v_store;
  insert into catalog_settings (store_id, slug, published) values (v_store, v_slug, false);
  insert into profiles (id, store_id, name, role) values (p_admin, v_store, trim(p_admin_name), 'Administrador');
  insert into profile_pins (profile_id, pin_hash) values (p_admin, crypt(p_pin, gen_salt('bf')));
  insert into audit_log (store_id, profile_id, user_name, action, detail)
  values (v_store, p_admin, trim(p_admin_name), 'Usuarios', 'Alta del local y de su administrador');
  return v_store;
end $$;

revoke execute on function crear_local from public, anon, authenticated;
grant execute on function crear_local to service_role;

-- ===== 20261007000000_demo.sql =====
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

-- ===== 20261007010000_dolar_y_alertas.sql =====
-- APPLE OPS · cotización del dólar automática y alertas de stock y margen.
-- La cotización puede seguir siendo manual o tomarse sola del dólar oficial, blue o MEP (venta),
-- más un ajuste en pesos. La app la consulta del lado del servidor y la aplica con
-- aplicar_cotizacion, que solo corre con la clave de servicio.

alter table stores
  add column if not exists fx_source text not null default 'manual' check (fx_source in ('manual', 'oficial', 'blue', 'bolsa')),
  add column if not exists fx_extra numeric(12,2) not null default 0,
  add column if not exists fx_updated_at timestamptz,
  add column if not exists stale_days int not null default 30 check (stale_days between 1 and 365);

-- Fuente de la cotización, ajuste y días para considerar un equipo "parado". Solo Administrador.
create or replace function guardar_cotizacion_y_alertas(p_source text, p_extra numeric, p_stale_days int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  s stores%rowtype;
  v_changes text[] := '{}';
  v_names jsonb := '{"manual": "manual", "oficial": "dólar oficial", "blue": "dólar blue", "bolsa": "dólar MEP"}';
begin
  if not is_admin() then raise exception 'Solo el administrador cambia la configuración.' using errcode = '42501'; end if;
  if p_source is null or not v_names ? p_source then raise exception 'Elegí de dónde sale la cotización.' using errcode = '22023'; end if;
  if p_extra is null or abs(p_extra) > 100000 then raise exception 'El ajuste de la cotización no es válido.' using errcode = '22023'; end if;
  if p_stale_days is null or p_stale_days not between 1 and 365 then
    raise exception 'Los días para avisar de un equipo parado van de 1 a 365.' using errcode = '22023';
  end if;

  select * into s from stores where id = v_store for update;
  if s.fx_source <> p_source then v_changes := v_changes || format('cotización %s → %s', v_names ->> s.fx_source, v_names ->> p_source); end if;
  if s.fx_extra <> p_extra then v_changes := v_changes || format('ajuste $ %s → $ %s', trim_scale(s.fx_extra), trim_scale(p_extra)); end if;
  if s.stale_days <> p_stale_days then v_changes := v_changes || format('equipo parado a los %s → %s días', s.stale_days, p_stale_days); end if;

  update stores set fx_source = p_source, fx_extra = p_extra, stale_days = p_stale_days,
    fx_updated_at = case when p_source <> s.fx_source then null else fx_updated_at end
  where id = v_store;
  if cardinality(v_changes) > 0 then perform log_event('Configuración', array_to_string(v_changes, ' · ')); end if;
end $$;

-- Aplica la cotización consultada por el servidor. Si cambió, queda en el historial como automática.
create or replace function aplicar_cotizacion(p_store uuid, p_fx numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s stores%rowtype;
  v_names jsonb := '{"oficial": "dólar oficial", "blue": "dólar blue", "bolsa": "dólar MEP"}';
begin
  if p_fx is null or p_fx <= 0 then raise exception 'Cotización inválida.' using errcode = '22023'; end if;
  select * into s from stores where id = p_store for update;
  if not found or s.fx_source = 'manual' then return false; end if;
  update stores set fx = p_fx, fx_updated_at = now() where id = p_store;
  if s.fx <> p_fx then
    insert into audit_log (store_id, profile_id, user_name, action, detail)
    values (p_store, null, 'Automático', 'Configuración',
      format('cotización $ %s → $ %s (%s)', trim_scale(s.fx), trim_scale(p_fx), v_names ->> s.fx_source));
  end if;
  return s.fx <> p_fx;
end $$;

revoke execute on function guardar_cotizacion_y_alertas from public, anon;
grant execute on function guardar_cotizacion_y_alertas to authenticated;
revoke execute on function aplicar_cotizacion from public, anon, authenticated;
grant execute on function aplicar_cotizacion to service_role;

-- APPLE OPS · venta por módulos.
-- Todo local tiene la base (ventas, stock, ingresos, clientes, caja, usuarios y configuración).
-- Encima se suman módulos: plan canje, accesorios, reportes, catálogo online, asistente de chat y
-- alertas con dólar automático. Los prende y apaga Enlata2 con set_modulos (clave de servicio o
-- SQL Editor); el local no puede cambiárselos. Lo que un módulo apagado bloquea se corta también
-- en la base, no solo en el menú.

alter table stores
  add column if not exists modules text[] not null
    default array['canje', 'accesorios', 'reportes', 'catalogo', 'asistente', 'alertas']
    check (modules <@ array['canje', 'accesorios', 'reportes', 'catalogo', 'asistente', 'alertas']);

create or replace function tiene_modulo(p_store uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p_module = any(modules) from stores where id = p_store), false);
$$;

-- Cambia los módulos de un local, identificado por el link de su catálogo. Queda en el historial.
create or replace function set_modulos(p_slug text, p_modules text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_all text[] := array['canje', 'accesorios', 'reportes', 'catalogo', 'asistente', 'alertas'];
  v_store uuid;
  v_old text[];
  v_new text[];
  v_bad text[];
begin
  select store_id into v_store from catalog_settings where slug = lower(trim(coalesce(p_slug, '')));
  if v_store is null then raise exception 'No hay ningún local con el link %.', p_slug using errcode = '22023'; end if;
  select array_agg(distinct m) into v_bad from unnest(coalesce(p_modules, '{}')) m where m <> all (v_all);
  if v_bad is not null then
    raise exception 'Módulo desconocido: %. Los módulos son: %.', array_to_string(v_bad, ', '), array_to_string(v_all, ', ') using errcode = '22023';
  end if;
  -- Mismo orden siempre, sin repetidos. El asistente vive en el catálogo: sin catálogo no hay asistente.
  select coalesce(array_agg(m order by array_position(v_all, m)), '{}') into v_new
  from (select distinct m from unnest(coalesce(p_modules, '{}')) m) x
  where m <> 'asistente' or 'catalogo' = any(p_modules);

  select modules into v_old from stores where id = v_store for update;
  -- Sin el módulo de alertas la cotización vuelve a ser manual (queda el último valor).
  update stores set modules = v_new,
    fx_source = case when 'alertas' = any(v_new) then fx_source else 'manual' end
  where id = v_store;
  if v_old is distinct from v_new then
    insert into audit_log (store_id, profile_id, user_name, action, detail)
    values (v_store, null, 'Enlata2', 'Configuración',
      format('módulos: %s → %s', coalesce(nullif(array_to_string(v_old, ', '), ''), 'solo base'), coalesce(nullif(array_to_string(v_new, ', '), ''), 'solo base')));
  end if;
  return v_new;
end $$;

-- Plan canje: sin el módulo no se registra canje en ninguna venta.
create or replace function chequear_modulo_canje() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_modulo(new.store_id, 'canje') then
    raise exception 'El plan canje no está incluido en tu plan.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trade_ins_modulo on trade_ins;
create trigger trade_ins_modulo before insert on trade_ins for each row execute function chequear_modulo_canje();

-- Accesorios: sin el módulo no se venden accesorios del stock.
create or replace function chequear_modulo_accesorios() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'acc' and not tiene_modulo(new.store_id, 'accesorios') then
    raise exception 'Los accesorios no están incluidos en tu plan.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists sale_lines_modulo on sale_lines;
create trigger sale_lines_modulo before insert on sale_lines for each row execute function chequear_modulo_accesorios();

-- Dólar automático: es parte del módulo de alertas.
create or replace function chequear_modulo_dolar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.fx_source <> 'manual' and new.fx_source is distinct from old.fx_source and not ('alertas' = any(new.modules)) then
    raise exception 'El dólar automático no está incluido en tu plan.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists stores_modulo_dolar on stores;
create trigger stores_modulo_dolar before update of fx_source on stores for each row execute function chequear_modulo_dolar();

-- Asistente: las charlas solo se registran si el local tiene catálogo y asistente.
create or replace function chequear_modulo_asistente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'chat' and not (tiene_modulo(new.store_id, 'catalogo') and tiene_modulo(new.store_id, 'asistente')) then
    raise exception 'El asistente no está incluido en el plan del local.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists assistant_chats_modulo on assistant_chats;
create trigger assistant_chats_modulo before insert on assistant_chats for each row execute function chequear_modulo_asistente();

-- Vistas públicas: sin catálogo el link no existe; el cotizador necesita además el plan canje, los
-- accesorios su módulo y el asistente el suyo. Las columnas nuevas van al final.
create or replace view catalogo_publico with (security_barrier) as
select d.id, d.store_id, cs.slug, d.kind, d.model, d.capacity, d.color, d.condition,
       d.battery, d.price_usd, d.warranty_days, coalesce(ci.featured, false) as featured, ci.photo_path,
       d.entry_date
from devices d
join catalog_settings cs on cs.store_id = d.store_id and cs.published
join stores s on s.id = d.store_id and 'catalogo' = any(s.modules)
left join catalog_items ci on ci.device_id = d.id
where d.status = 'Disponible' and coalesce(ci.visible, true);

create or replace view accesorios_publicos with (security_barrier) as
select a.id, a.store_id, cs.slug, a.name, a.category, a.price_ars
from accessories a
join catalog_settings cs on cs.store_id = a.store_id and cs.published and cs.show_accessories
join stores s on s.id = a.store_id and 'catalogo' = any(s.modules) and 'accesorios' = any(s.modules)
where a.stock > 0;

create or replace view catalogo_config_publica with (security_barrier) as
select store_id, slug, s.name as store_name, s.address, whatsapp, headline, tagline,
       assistant_on and 'asistente' = any(s.modules) as assistant_on, assistant_name, greeting,
       s.phone, s.fx, s.warranty_new_days, s.warranty_used_days,
       'canje' = any(s.modules) as quote_on
from catalog_settings join stores s on s.id = store_id
where published and 'catalogo' = any(s.modules);

create or replace view tasacion_publica with (security_barrier) as
select t.store_id, cs.slug, t.model, t.capacity, t.value_usd,
       coalesce((s.cond_mult ->> 'Usado A')::numeric, 1) as mult_usado_a,
       s.cond_mult as mult_por_estado, s.defect_costs as descuentos_por_falla
from trade_in_values t
join catalog_settings cs on cs.store_id = t.store_id and cs.published
join stores s on s.id = t.store_id and 'catalogo' = any(s.modules) and 'canje' = any(s.modules);

create or replace view catalogo_estado with (security_barrier) as
select cs.slug, s.name as store_name, cs.published
from catalog_settings cs join stores s on s.id = cs.store_id and 'catalogo' = any(s.modules);

revoke all on catalogo_publico, accesorios_publicos, catalogo_config_publica, tasacion_publica, catalogo_estado from public, anon, authenticated;
grant select on catalogo_publico, accesorios_publicos, catalogo_config_publica, tasacion_publica, catalogo_estado to anon, authenticated;

revoke execute on function tiene_modulo from public, anon;
grant execute on function tiene_modulo to authenticated;
revoke execute on function set_modulos from public, anon, authenticated;
grant execute on function set_modulos to service_role;
revoke execute on function chequear_modulo_canje, chequear_modulo_accesorios, chequear_modulo_dolar, chequear_modulo_asistente from public, anon, authenticated;

-- Registro de migraciones, para que un 'supabase db push' futuro no las repita.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261004020100', 'ventas_y_canje') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005000000', 'accesorios_y_clientes') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005010000', 'caja') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005020000', 'usuarios_y_config') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005030000', 'catalogo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005040000', 'asistente') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261005050000', 'fotos_y_alta') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261007000000', 'demo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261007010000', 'dolar_y_alertas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261007020000', 'modulos') on conflict do nothing;
