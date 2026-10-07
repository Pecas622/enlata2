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
