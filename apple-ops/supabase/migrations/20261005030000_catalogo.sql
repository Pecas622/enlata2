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
