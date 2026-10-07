-- Actualización para pegar en SQL Editor: dólar automático y alertas (migración 20261007010000_dolar_y_alertas).

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

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261007010000', 'dolar_y_alertas') on conflict do nothing;
