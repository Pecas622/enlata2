-- APPLE OPS · etapa 2: stock e ingresos de equipos.

alter type device_origin add value if not exists 'Otro';

-- Ingreso de un equipo al stock, en una sola transacción: equipo, costo, historial, comprobante
-- de ingreso (I-0001), egreso de caja si se paga y registro. Solo Administrador y Encargado.
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
  if p_kind in ('iPhone', 'iPad') and v_imei !~ '^\d{15}$' then raise exception 'Ingresá un IMEI válido de 15 dígitos.' using errcode = '22023'; end if;
  if p_kind not in ('iPhone', 'iPad') and length(v_imei) < 6 then raise exception 'Ingresá un número de serie válido.' using errcode = '22023'; end if;
  if p_origin = 'Canje' then raise exception 'Los canjes entran desde una venta.' using errcode = '22023'; end if;
  if p_origin <> 'Proveedor' and not p_icloud_free then raise exception 'No se puede comprar un equipo con iCloud activo.' using errcode = '22023'; end if;
  if p_origin <> 'Proveedor' and not p_imei_clean then raise exception 'IMEI con denuncia o bloqueo. No se puede tomar.' using errcode = '22023'; end if;
  if p_origin = 'Compra a particular' and (coalesce(trim(p_person_name), '') = '' or coalesce(trim(p_person_dni), '') = '') then
    raise exception 'Cargá nombre y DNI de quien vende.' using errcode = '22023';
  end if;
  if coalesce(p_cost_usd, 0) <= 0 then raise exception 'Ingresá el valor de compra.' using errcode = '22023'; end if;
  if coalesce(p_price_usd, 0) <= 0 then raise exception 'Ingresá el precio de venta.' using errcode = '22023'; end if;
  if exists (select 1 from devices where store_id = v_store and imei = v_imei and status not in ('Vendido', 'Retirado')) then
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

-- Edición de un equipo en stock: precio, estado y notas. Deja historial y registro.
-- Un equipo vendido no se edita, y "Vendido" solo lo pone una venta.
create or replace function editar_equipo(p_device uuid, p_price_usd numeric, p_status device_status, p_notes text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d devices%rowtype;
  v_changes text;
begin
  if not is_manager() then raise exception 'Tu rol no puede editar el stock.' using errcode = '42501'; end if;
  select * into d from devices where id = p_device and store_id = current_store_id() for update;
  if not found then raise exception 'Equipo no encontrado.' using errcode = 'P0002'; end if;
  if d.status = 'Vendido' then raise exception 'Un equipo vendido no se puede editar.' using errcode = '22023'; end if;
  if p_status = 'Vendido' then raise exception 'Un equipo se marca vendido solo desde una venta.' using errcode = '22023'; end if;
  if coalesce(p_price_usd, 0) <= 0 then raise exception 'El precio debe ser mayor a cero.' using errcode = '22023'; end if;

  v_changes := concat_ws(' ',
    case when p_price_usd <> d.price_usd then 'precio US$ ' || round(d.price_usd) || ' → US$ ' || round(p_price_usd) end,
    case when p_status <> d.status then 'estado ' || d.status || ' → ' || p_status end);

  update devices set price_usd = p_price_usd, status = p_status, notes = coalesce(p_notes, '') where id = p_device;

  if v_changes <> '' then
    insert into device_events (store_id, device_id, action, by_profile)
    values (d.store_id, p_device, 'Editado: ' || v_changes, auth.uid());
  end if;
  perform log_event('Equipo editado', d.model || case when d.capacity > 0 then ' ' || d.capacity || 'GB' else '' end
    || coalesce(' · ' || nullif(v_changes, ''), ''));
end $$;

revoke execute on function registrar_ingreso from public, anon;
revoke execute on function editar_equipo from public, anon;
grant execute on function registrar_ingreso to authenticated;
grant execute on function editar_equipo to authenticated;

-- La edición directa de equipos queda cerrada: todo pasa por editar_equipo, que deja historial.
drop policy devices_write on devices;
