-- Actualización para pegar en SQL Editor: módulos con stock con IMEI (migración 20261008000000_modulos_imei).
-- Pegala después de actualizacion-modulos.sql.

-- APPLE OPS · módulos, segunda versión.
-- El plan canje y los accesorios pasan a la base. Se suma el módulo "stock con IMEI": con él, cada
-- equipo se identifica por IMEI o serie obligatorio y sin repetidos en stock; sin él, el número es
-- opcional. Los módulos quedan: imei, reportes, catalogo, asistente y alertas.

-- Los locales que ya existen conservan lo que tenían y suman el módulo de IMEI, que ya usaban.
alter table stores drop constraint if exists stores_modules_check;
update stores set modules = (
  select coalesce(array_agg(m order by array_position(array['imei', 'reportes', 'catalogo', 'asistente', 'alertas'], m)), '{}')
  from (select distinct m from unnest(modules || array['imei']) m) x
  where m = any(array['imei', 'reportes', 'catalogo', 'asistente', 'alertas'])
);
alter table stores alter column modules set default array['imei', 'reportes', 'catalogo', 'asistente', 'alertas'];
alter table stores add constraint stores_modules_check check (modules <@ array['imei', 'reportes', 'catalogo', 'asistente', 'alertas']);

-- Canje y accesorios ya no dependen de un módulo.
drop trigger if exists trade_ins_modulo on trade_ins;
drop trigger if exists sale_lines_modulo on sale_lines;
drop function if exists chequear_modulo_canje();
drop function if exists chequear_modulo_accesorios();

-- Sin IMEI obligatorio puede haber varios equipos sin número: la unicidad cuenta solo los cargados.
drop index if exists devices_imei_en_stock;
create unique index devices_imei_en_stock on devices (store_id, imei) where status not in ('Vendido', 'Retirado') and imei <> '';

-- IMEI obligatorio solo con el módulo.
create or replace function registrar_ingreso(
  p_kind device_kind,
  p_model text,
  p_capacity int,
  p_color text,
  p_condition device_condition,
  p_imei text,
  p_battery int,
  p_origin device_origin,
  p_cost_usd numeric,
  p_price_usd numeric,
  p_person_name text default '',
  p_person_dni text default '',
  p_person_phone text default '',
  p_icloud_free boolean default true,
  p_imei_clean boolean default true,
  p_defects text[] default '{}',
  p_note text default '',
  p_pay_method pay_method default null,
  p_pay_amount numeric default 0
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_user profiles%rowtype;
  v_cfg stores%rowtype;
  v_imei text := trim(coalesce(p_imei, ''));
  v_shift uuid;
  v_device uuid;
  v_purchase uuid;
  v_number text;
  v_desc text;
  v_notes text;
begin
  if not is_manager() then raise exception 'Tu rol no puede ingresar equipos.' using errcode = '42501'; end if;
  select * into v_user from profiles where id = auth.uid();
  select * into v_cfg from stores where id = v_store;

  if coalesce(trim(p_model), '') = '' then raise exception 'Elegí el modelo.' using errcode = '22023'; end if;
  -- Sin el módulo de stock con IMEI el número es opcional; si se carga, se valida igual.
  if (v_imei <> '' or tiene_modulo(v_store, 'imei')) and p_kind in ('iPhone', 'iPad') and v_imei !~ '^\d{15}$' then raise exception 'Ingresá un IMEI válido de 15 dígitos.' using errcode = '22023'; end if;
  if (v_imei <> '' or tiene_modulo(v_store, 'imei')) and p_kind not in ('iPhone', 'iPad') and length(v_imei) < 6 then raise exception 'Ingresá un número de serie válido.' using errcode = '22023'; end if;
  if p_origin = 'Canje' then raise exception 'Los canjes entran desde una venta.' using errcode = '22023'; end if;
  if p_origin <> 'Proveedor' and not p_icloud_free then raise exception 'No se puede comprar un equipo con iCloud activo.' using errcode = '22023'; end if;
  if p_origin <> 'Proveedor' and not p_imei_clean then raise exception 'IMEI con denuncia o bloqueo. No se puede tomar.' using errcode = '22023'; end if;
  if p_origin = 'Compra a particular' and (coalesce(trim(p_person_name), '') = '' or coalesce(trim(p_person_dni), '') = '') then
    raise exception 'Cargá nombre y DNI de quien vende.' using errcode = '22023';
  end if;
  if coalesce(p_cost_usd, 0) <= 0 then raise exception 'Ingresá el valor de compra.' using errcode = '22023'; end if;
  if coalesce(p_price_usd, 0) <= 0 then raise exception 'Ingresá el precio de venta.' using errcode = '22023'; end if;
  if v_imei <> '' and exists (select 1 from devices where store_id = v_store and imei = v_imei and status not in ('Vendido', 'Retirado')) then
    raise exception 'El IMEI ya está en stock.' using errcode = '23505';
  end if;
  if coalesce(p_pay_amount, 0) > 0 then
    if p_pay_method is null then raise exception 'Elegí el medio de pago.' using errcode = '22023'; end if;
    select id into v_shift from cash_shifts where store_id = v_store and status = 'Abierta';
    if v_shift is null then raise exception 'Abrí la caja para registrar el pago.' using errcode = '22023'; end if;
  end if;

  v_notes := concat_ws(' · ',
    case when cardinality(p_defects) > 0 then 'Defectos: ' || array_to_string(p_defects, ', ') end,
    nullif(trim(p_note), ''));

  insert into devices (store_id, kind, model, capacity, color, condition, imei, battery, price_usd, origin, warranty_days, notes)
  values (v_store, p_kind, trim(p_model), coalesce(p_capacity, 0), coalesce(p_color, ''), p_condition, v_imei,
    case when p_kind in ('iPhone', 'iPad', 'Mac') and p_condition <> 'Nuevo sellado' then p_battery end,
    p_price_usd, p_origin,
    case when p_condition = 'Nuevo sellado' then v_cfg.warranty_new_days else v_cfg.warranty_used_days end,
    coalesce(v_notes, ''))
  returning id into v_device;

  insert into device_costs (device_id, store_id, cost_usd) values (v_device, v_store, p_cost_usd);

  v_number := next_number(v_store, 'I');
  v_desc := trim(p_model) || case when coalesce(p_capacity, 0) > 0 then ' ' || p_capacity || 'GB' else '' end;

  insert into purchases (store_id, number, device_id, origin, person_name, person_dni, person_phone, cost_usd, pay_method, pay_amount, by_profile)
  values (v_store, v_number, v_device, p_origin, coalesce(trim(p_person_name), ''), coalesce(trim(p_person_dni), ''),
    coalesce(trim(p_person_phone), ''), p_cost_usd, p_pay_method, coalesce(p_pay_amount, 0), v_user.id)
  returning id into v_purchase;

  insert into device_events (store_id, device_id, action, by_profile)
  values (v_store, v_device, 'Ingreso (' || p_origin || ') ' || v_number || ' a US$ ' || round(p_cost_usd), v_user.id);

  if coalesce(p_pay_amount, 0) > 0 then
    insert into cash_moves (store_id, shift_id, type, concept, method, currency, amount, purchase_id, by_profile)
    values (v_store, v_shift, 'Egreso', 'Compra de equipo ' || v_number || ' · ' || v_desc, p_pay_method,
      case when p_pay_method = 'Efectivo USD' then 'USD'::currency else 'ARS'::currency end, p_pay_amount, v_purchase, v_user.id);
  end if;

  perform log_event('Ingreso de equipo', v_number || ' · ' || v_desc || ' a US$ ' || round(p_cost_usd));
  return json_build_object('purchase_id', v_purchase, 'device_id', v_device, 'number', v_number);
end $$;

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
    if (v_ti_imei <> '' or tiene_modulo(v_store, 'imei'))
       and ((v_ti_kind in ('iPhone', 'iPad') and v_ti_imei !~ '^\d{15}$') or (v_ti_kind = 'Mac' and length(v_ti_imei) < 6)) then
      raise exception 'Ingresá un IMEI / serie válido del equipo que entrega el cliente.' using errcode = '22023';
    end if;
    if v_ti_cond = 'Nuevo sellado' then raise exception 'Un equipo de canje no entra como nuevo sellado.' using errcode = '22023'; end if;

    v_ap := tasar_canje(v_ti_model, v_ti_cap, v_ti_cond::text, nullif(t ->> 'battery', '')::int, v_ti_defects,
      coalesce((t ->> 'icloud_free')::boolean, true), coalesce((t ->> 'imei_clean')::boolean, true));
    if (v_ap ->> 'blocked')::boolean then raise exception '%', v_ap ->> 'reason' using errcode = '22023'; end if;

    v_ti := coalesce(nullif(t ->> 'value_usd', '')::numeric, case when (v_ap ->> 'ok')::boolean then (v_ap ->> 'value')::numeric end);
    if v_ti is null then raise exception 'Sin valor de referencia: ingresá el valor a mano.' using errcode = '22023'; end if;
    if v_ti_imei <> '' and exists (select 1 from devices where store_id = v_store and imei = v_ti_imei and status not in ('Vendido', 'Retirado')) then
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

-- Lista nueva de módulos.
create or replace function set_modulos(p_slug text, p_modules text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_all text[] := array['imei', 'reportes', 'catalogo', 'asistente', 'alertas'];
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

-- Vistas públicas: el cotizador y los accesorios solo dependen del catálogo.
create or replace view accesorios_publicos with (security_barrier) as
select a.id, a.store_id, cs.slug, a.name, a.category, a.price_ars
from accessories a
join catalog_settings cs on cs.store_id = a.store_id and cs.published and cs.show_accessories
join stores s on s.id = a.store_id and 'catalogo' = any(s.modules)
where a.stock > 0;

create or replace view catalogo_config_publica with (security_barrier) as
select store_id, slug, s.name as store_name, s.address, whatsapp, headline, tagline,
       assistant_on and 'asistente' = any(s.modules) as assistant_on, assistant_name, greeting,
       s.phone, s.fx, s.warranty_new_days, s.warranty_used_days,
       true as quote_on
from catalog_settings join stores s on s.id = store_id
where published and 'catalogo' = any(s.modules);

create or replace view tasacion_publica with (security_barrier) as
select t.store_id, cs.slug, t.model, t.capacity, t.value_usd,
       coalesce((s.cond_mult ->> 'Usado A')::numeric, 1) as mult_usado_a,
       s.cond_mult as mult_por_estado, s.defect_costs as descuentos_por_falla
from trade_in_values t
join catalog_settings cs on cs.store_id = t.store_id and cs.published
join stores s on s.id = t.store_id and 'catalogo' = any(s.modules);

revoke all on accesorios_publicos, catalogo_config_publica, tasacion_publica from public, anon, authenticated;
grant select on accesorios_publicos, catalogo_config_publica, tasacion_publica to anon, authenticated;

revoke execute on function set_modulos from public, anon, authenticated;
grant execute on function set_modulos to service_role;
revoke execute on function registrar_ingreso from public, anon;
grant execute on function registrar_ingreso to authenticated;
revoke execute on function registrar_venta from public, anon;
grant execute on function registrar_venta to authenticated;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261008000000', 'modulos_imei') on conflict do nothing;
