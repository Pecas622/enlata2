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
