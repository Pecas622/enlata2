-- APPLE OPS · etapa 9: fotos de los equipos del catálogo y alta del primer local en producción.

-- Bucket público de fotos (solo lectura pública). Las subidas las hace el servidor de la app con la
-- clave de servicio, después de que catalogo_equipo_foto valida rol y equipo, así que el bucket no
-- necesita políticas de escritura. Si el proyecto no tiene Storage, se saltea.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('fotos-equipos', 'fotos-equipos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Guarda (o quita, con null) la foto de un equipo. La ruta tiene que ser <local>/<equipo>-<número>.<ext>
-- para que nadie apunte a la foto de otro local. Devuelve la ruta anterior para borrarla.
create or replace function catalogo_equipo_foto(p_device uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_dev devices%rowtype;
  v_old text;
begin
  if not is_manager() then raise exception 'Tu rol no puede cambiar el catálogo.' using errcode = '42501'; end if;
  select * into v_dev from devices where id = p_device and store_id = v_store;
  if not found then raise exception 'No se encontró el equipo.' using errcode = '22023'; end if;
  if p_path is not null and p_path !~ ('^' || v_store || '/' || p_device || '-[0-9]+\.(jpg|png|webp)$') then
    raise exception 'Ruta de foto inválida.' using errcode = '22023';
  end if;
  select photo_path into v_old from catalog_items where device_id = p_device;
  insert into catalog_items (device_id, store_id, photo_path) values (p_device, v_store, p_path)
  on conflict (device_id) do update set photo_path = excluded.photo_path;
  perform log_event('Catálogo',
    case when p_path is null then 'Se quitó la foto de ' else 'Nueva foto de ' end
    || v_dev.model || case when v_dev.capacity > 0 then ' ' || v_dev.capacity || 'GB' else '' end);
  return v_old;
end $$;

revoke execute on function catalogo_equipo_foto from public, anon;
grant execute on function catalogo_equipo_foto to authenticated;

-- Alta de un local nuevo con su primer Administrador. La cuenta de Auth la crea antes el script
-- `npm run crear-local`; esta función solo la corre la clave de servicio.
create or replace function crear_local(p_name text, p_slug text, p_admin uuid, p_admin_name text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_store uuid;
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_admin_name), '') = '' then
    raise exception 'Faltan el nombre del local o del administrador.' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$' then
    raise exception 'El link tiene que tener entre 3 y 40 letras, números o guiones.' using errcode = '22023';
  end if;
  if exists (select 1 from catalog_settings where slug = v_slug) then
    raise exception 'El link /catalogo/% ya lo usa otro local.', v_slug using errcode = '23505';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'El PIN tiene que tener 4 números.' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_admin) then raise exception 'No existe la cuenta del administrador.' using errcode = '22023'; end if;
  if exists (select 1 from profiles where id = p_admin) then raise exception 'Esa cuenta ya pertenece a un local.' using errcode = '23505'; end if;

  insert into stores (name) values (trim(p_name)) returning id into v_store;
  insert into catalog_settings (store_id, slug, published) values (v_store, v_slug, false);
  insert into profiles (id, store_id, name, role) values (p_admin, v_store, trim(p_admin_name), 'Administrador');
  insert into profile_pins (profile_id, pin_hash) values (p_admin, crypt(p_pin, gen_salt('bf')));
  insert into audit_log (store_id, profile_id, user_name, action, detail)
  values (v_store, p_admin, trim(p_admin_name), 'Usuarios', 'Alta del local y de su administrador');
  return v_store;
end $$;

revoke execute on function crear_local from public, anon, authenticated;
grant execute on function crear_local to service_role;
