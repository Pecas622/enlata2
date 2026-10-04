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
