-- Actualización para pegar en SQL Editor: venta online con Mercado Pago (migración 20261008010000_suscripciones).
-- Pegala después de actualizacion-modulos-imei.sql.

-- APPLE OPS · venta online del plan y de los módulos, con suscripción mensual de Mercado Pago.
-- Un local nuevo se da de alta solo desde /alta: queda "pendiente" hasta que Mercado Pago confirma
-- el débito del plan base. Cada módulo se compra desde la app con su propia suscripción y se prende
-- cuando Mercado Pago la autoriza; si se cancela o se pausa, se apaga. Los locales que ya existen y
-- los módulos que Enlata2 prende con set_modulos no dependen de esto.

-- Precios por mes, en pesos. Son públicos (los muestra el alta) y los cambia Enlata2 desde SQL Editor.
create table if not exists plan_prices (
  item text primary key check (item in ('base', 'imei', 'reportes', 'catalogo', 'asistente', 'alertas')),
  price_ars numeric(12,2) not null check (price_ars > 0)
);
insert into plan_prices (item, price_ars) values
  ('base', 29900), ('imei', 4900), ('reportes', 4900), ('catalogo', 7900), ('asistente', 14900), ('alertas', 4900)
on conflict (item) do nothing;
alter table plan_prices enable row level security;
drop policy if exists plan_prices_read on plan_prices;
create policy plan_prices_read on plan_prices for select to anon, authenticated using (true);
revoke all on plan_prices from public, anon, authenticated;
grant select on plan_prices to anon, authenticated;

-- Estado de cobro del local. Los que ya existen quedan activos.
alter table stores add column if not exists billing_status text not null default 'activo'
  check (billing_status in ('pendiente', 'activo', 'suspendido'));

-- Una fila por suscripción de Mercado Pago (plan base o módulo).
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  item text not null check (item in ('base', 'imei', 'reportes', 'catalogo', 'asistente', 'alertas')),
  mp_preapproval_id text not null unique,
  status text not null default 'pendiente' check (status in ('pendiente', 'activa', 'pausada', 'cancelada')),
  price_ars numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_store on subscriptions (store_id);
alter table subscriptions enable row level security;
drop policy if exists subscriptions_read on subscriptions;
create policy subscriptions_read on subscriptions for select to authenticated using (store_id = current_store_id() and is_admin());
revoke all on subscriptions from public, anon, authenticated;
grant select on subscriptions to authenticated;

-- Alta desde la web: el local nace sin módulos y pendiente de pago.
create or replace function crear_local_pendiente(p_name text, p_slug text, p_admin uuid, p_admin_name text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_store uuid;
begin
  v_store := crear_local(p_name, p_slug, p_admin, p_admin_name, p_pin);
  update stores set modules = '{}', billing_status = 'pendiente' where id = v_store;
  return v_store;
end $$;

-- Registra una suscripción recién creada en Mercado Pago (todavía sin pagar).
create or replace function registrar_suscripcion(p_store uuid, p_item text, p_preapproval text, p_price numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into subscriptions (store_id, item, mp_preapproval_id, price_ars)
  values (p_store, p_item, p_preapproval, p_price)
  on conflict (mp_preapproval_id) do nothing;
end $$;

-- Aplica el estado que informa Mercado Pago. Plan base: activa o suspende el local. Módulo: lo prende
-- o lo apaga (el asistente necesita el catálogo). Queda en el historial como "Mercado Pago".
create or replace function aplicar_suscripcion(p_preapproval text, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  sub subscriptions%rowtype;
  s stores%rowtype;
  v_all text[] := array['imei', 'reportes', 'catalogo', 'asistente', 'alertas'];
  v_mods text[];
  v_names jsonb := '{"base": "plan base", "imei": "stock con IMEI", "reportes": "reportes", "catalogo": "catálogo online", "asistente": "asistente de chat", "alertas": "alertas y dólar automático"}';
begin
  if p_status not in ('pendiente', 'activa', 'pausada', 'cancelada') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  select * into sub from subscriptions where mp_preapproval_id = p_preapproval for update;
  if not found or sub.status = p_status then return false; end if;
  update subscriptions set status = p_status, updated_at = now() where id = sub.id;
  select * into s from stores where id = sub.store_id for update;

  if sub.item = 'base' then
    update stores set billing_status = case
      when p_status = 'activa' then 'activo'
      when p_status in ('pausada', 'cancelada') and s.billing_status = 'activo' then 'suspendido'
      else s.billing_status end
    where id = s.id;
  else
    v_mods := case when p_status = 'activa' then array_append(array_remove(s.modules, sub.item), sub.item)
                   when p_status in ('pausada', 'cancelada') then array_remove(s.modules, sub.item)
                   else s.modules end;
    -- Si el asistente ya estaba pago, vuelve junto con el catálogo.
    if p_status = 'activa' and sub.item = 'catalogo' and exists (
      select 1 from subscriptions where store_id = s.id and item = 'asistente' and status = 'activa') then
      v_mods := array_append(array_remove(v_mods, 'asistente'), 'asistente');
    end if;
    select coalesce(array_agg(m order by array_position(v_all, m)), '{}') into v_mods
    from unnest(v_mods) m
    where m = any(v_all) and (m <> 'asistente' or 'catalogo' = any(v_mods));
    update stores set modules = v_mods,
      fx_source = case when 'alertas' = any(v_mods) then fx_source else 'manual' end
    where id = s.id;
  end if;

  insert into audit_log (store_id, profile_id, user_name, action, detail)
  values (s.id, null, 'Mercado Pago', 'Configuración', format('%s: suscripción %s', v_names ->> sub.item, p_status));
  return true;
end $$;

revoke execute on function crear_local_pendiente, registrar_suscripcion, aplicar_suscripcion from public, anon, authenticated;
grant execute on function crear_local_pendiente, registrar_suscripcion, aplicar_suscripcion to service_role;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261008010000', 'suscripciones') on conflict do nothing;
