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
