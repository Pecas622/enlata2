-- Actualización para pegar en SQL Editor: venta por módulos (migración 20261007020000_modulos).

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

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261007020000', 'modulos') on conflict do nothing;
