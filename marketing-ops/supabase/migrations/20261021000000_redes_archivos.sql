-- Etapa 8: redes conectadas y archivos.
-- Redes: cada marca conecta su cuenta profesional de Instagram con el inicio de sesión oficial de Instagram (OAuth).
-- La app guarda el token cifrado (AES-256-GCM, la clave vive solo en el servidor) y nadie lo lee desde el navegador:
-- la columna no se le da a authenticated, y solo social_token lo devuelve, cifrado, a quien puede publicar.
-- Archivos: logo, fotos y videos de cada marca en el bucket privado "media" de Storage, en <espacio>/<marca>/...,
-- con una fila en media_files. El plan pone el tope de espacio.

-- ---------- redes ----------
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null check (platform in ('Instagram', 'Facebook', 'TikTok')),
  external_id text not null,                 -- el id de la cuenta en la red
  username text not null default '',
  name text not null default '',
  picture_url text not null default '',
  account_type text not null default '',
  followers int,
  status text not null default 'Conectada' check (status in ('Conectada', 'Vencida', 'Error')),
  last_error text not null default '',
  token_enc text not null,                   -- cifrado por la app; la base nunca ve el token en claro
  token_expires_at timestamptz,
  connected_by uuid references profiles(id),
  connected_at timestamptz not null default now(),
  checked_at timestamptz,
  unique (brand_id, platform)
);
create index on social_accounts (workspace_id);

create table social_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  action text not null,
  by_profile uuid references profiles(id),
  at timestamptz not null default now()
);
create index on social_events (workspace_id, at desc);

-- Conecta (o reconecta) la cuenta de una red para una marca. Solo el Administrador.
create or replace function connect_social(p_brand_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_platform text := p->>'platform';
  v_id uuid;
begin
  if not is_admin() then raise exception 'Solo el Administrador conecta redes.'; end if;
  if not exists (select 1 from brands where id = p_brand_id and workspace_id = v_ws) then raise exception 'Marca inexistente.'; end if;
  if v_platform not in ('Instagram', 'Facebook', 'TikTok') then raise exception 'Esa red no existe.'; end if;
  if coalesce(p->>'external_id', '') = '' or coalesce(p->>'token_enc', '') = '' then raise exception 'La conexión vino incompleta.'; end if;
  if exists (select 1 from social_accounts where workspace_id = v_ws and platform = v_platform and external_id = p->>'external_id' and brand_id <> p_brand_id) then
    raise exception 'Esa cuenta ya está conectada a otra marca del espacio.';
  end if;
  insert into social_accounts (workspace_id, brand_id, platform, external_id, username, name, picture_url, account_type, followers,
    status, last_error, token_enc, token_expires_at, connected_by, connected_at, checked_at)
  values (v_ws, p_brand_id, v_platform, p->>'external_id', left(coalesce(p->>'username', ''), 100), left(coalesce(p->>'name', ''), 150),
    left(coalesce(p->>'picture_url', ''), 1000), left(coalesce(p->>'account_type', ''), 40), nullif(p->>'followers', '')::int,
    'Conectada', '', p->>'token_enc', nullif(p->>'token_expires_at', '')::timestamptz, auth.uid(), now(), now())
  on conflict (brand_id, platform) do update set external_id = excluded.external_id, username = excluded.username, name = excluded.name,
    picture_url = excluded.picture_url, account_type = excluded.account_type, followers = excluded.followers, status = 'Conectada',
    last_error = '', token_enc = excluded.token_enc, token_expires_at = excluded.token_expires_at, connected_by = auth.uid(),
    connected_at = now(), checked_at = now()
  returning id into v_id;
  insert into social_events (workspace_id, brand_id, action, by_profile)
  values (v_ws, p_brand_id, format('Conectó %s%s', v_platform, case when coalesce(p->>'username', '') <> '' then ' @' || (p->>'username') else '' end), auth.uid());
  return v_id;
end $$;

create or replace function disconnect_social(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_acc social_accounts;
begin
  if not is_admin() then raise exception 'Solo el Administrador desconecta redes.'; end if;
  delete from social_accounts where id = p_id and workspace_id = v_ws returning * into v_acc;
  if v_acc.id is null then raise exception 'Esa conexión no existe.'; end if;
  insert into social_events (workspace_id, brand_id, action, by_profile)
  values (v_ws, v_acc.brand_id, format('Desconectó %s%s', v_acc.platform, case when v_acc.username <> '' then ' @' || v_acc.username else '' end), auth.uid());
end $$;

-- El token cifrado, para que el servidor lo use (probar la conexión y, más adelante, publicar). Administrador y Creador.
create or replace function social_token(p_id uuid) returns table (token_enc text, token_expires_at timestamptz, external_id text, platform text, connected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.token_enc, s.token_expires_at, s.external_id, s.platform, s.connected_at from social_accounts s
  where s.id = p_id and s.workspace_id = current_workspace_id() and can_create() and can_see_brand(s.brand_id)
$$;

-- Lo que devolvió la red al probar la conexión: datos de la cuenta, estado y, si se renovó, el token nuevo.
create or replace function save_social_check(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
begin
  if not can_create() then raise exception 'Tu rol no maneja las redes.'; end if;
  if coalesce(p->>'status', '') not in ('Conectada', 'Vencida', 'Error') then raise exception 'Estado inválido.'; end if;
  update social_accounts set
    status = p->>'status',
    last_error = left(coalesce(p->>'last_error', ''), 300),
    username = coalesce(nullif(p->>'username', ''), username),
    name = coalesce(nullif(p->>'name', ''), name),
    picture_url = coalesce(nullif(p->>'picture_url', ''), picture_url),
    followers = coalesce(nullif(p->>'followers', '')::int, followers),
    token_enc = coalesce(nullif(p->>'token_enc', ''), token_enc),
    token_expires_at = case when p ? 'token_expires_at' then nullif(p->>'token_expires_at', '')::timestamptz else token_expires_at end,
    checked_at = now()
  where id = p_id and workspace_id = v_ws;
  if not found then raise exception 'Esa conexión no existe.'; end if;
end $$;

alter table social_accounts enable row level security;
alter table social_events enable row level security;
revoke all on social_accounts, social_events from anon, authenticated;
-- Todas las columnas menos el token.
grant select (id, workspace_id, brand_id, platform, external_id, username, name, picture_url, account_type, followers, status,
  last_error, token_expires_at, connected_by, connected_at, checked_at) on social_accounts to authenticated;
grant select on social_events to authenticated;
create policy social_accounts_select on social_accounts for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(brand_id));
create policy social_events_select on social_events for select to authenticated using (workspace_id = current_workspace_id() and (brand_id is null or can_see_brand(brand_id)));

-- ---------- archivos ----------
alter table plans add column max_storage_mb int not null default 200 check (max_storage_mb > 0);
update plans set max_storage_mb = case id when 'prueba' then 200 when 'emprendedor' then 2000 when 'agencia' then 20000 else max_storage_mb end;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- Storage: cada espacio solo ve y sube en su carpeta, <espacio>/<marca>/archivo. Subir: Administrador y Creador.
-- Ojo: adentro del exists, "name" sería brands.name; por eso objects.name.
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_workspace_id()::text
         and exists (select 1 from public.brands b where b.id::text = (storage.foldername(objects.name))[2] and public.can_see_brand(b.id)));
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_workspace_id()::text and public.can_create()
              and exists (select 1 from public.brands b where b.id::text = (storage.foldername(objects.name))[2] and b.workspace_id = public.current_workspace_id()));
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_workspace_id()::text and public.can_create());

create table media_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  content_id uuid references contents(id) on delete set null,
  path text not null unique,
  name text not null default '',
  mime text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  kind text not null check (kind in ('logo', 'foto', 'video')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on media_files (workspace_id, brand_id, created_at desc);
create index on media_files (content_id);

-- Registra un archivo ya subido a Storage. Lee tamaño y tipo de Storage, no del navegador, y respeta el tope del plan.
create or replace function add_media(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_path text := p->>'path';
  v_brand uuid;
  v_size bigint;
  v_mime text;
  v_kind text;
  v_content uuid := nullif(p->>'content_id', '')::uuid;
  v_used bigint;
  v_id uuid;
begin
  if not can_create() then raise exception 'Tu rol no sube archivos.'; end if;
  if v_path is null or split_part(v_path, '/', 1) <> v_ws::text then raise exception 'El archivo no es de este espacio.'; end if;
  begin
    v_brand := split_part(v_path, '/', 2)::uuid;
  exception when invalid_text_representation then raise exception 'El archivo no es de una marca.'; end;
  if not exists (select 1 from brands where id = v_brand and workspace_id = v_ws) then raise exception 'Marca inexistente.'; end if;
  if v_content is not null and not exists (select 1 from contents where id = v_content and brand_id = v_brand) then
    raise exception 'La pieza no es de esa marca.';
  end if;
  select (metadata->>'size')::bigint, metadata->>'mimetype' into v_size, v_mime from storage.objects where bucket_id = 'media' and name = v_path;
  if v_mime is null then raise exception 'No encontré el archivo subido.'; end if;
  v_kind := case when p->>'kind' = 'logo' and v_mime like 'image/%' then 'logo' when v_mime like 'video/%' then 'video' else 'foto' end;
  select coalesce(sum(size_bytes), 0) into v_used from media_files where workspace_id = v_ws;
  if v_used + v_size > (plan_of(v_ws)).max_storage_mb::bigint * 1048576 then
    raise exception 'Tu plan % tiene % MB para archivos y este no entra. Borrá alguno o pasate a un plan más grande.', (plan_of(v_ws)).name, (plan_of(v_ws)).max_storage_mb;
  end if;
  insert into media_files (workspace_id, brand_id, content_id, path, name, mime, size_bytes, kind, created_by)
  values (v_ws, v_brand, v_content, v_path, left(coalesce(nullif(p->>'name', ''), split_part(v_path, '/', 3)), 200), v_mime, v_size, v_kind, auth.uid())
  returning id into v_id;
  if v_content is not null then
    insert into content_events (workspace_id, content_id, action, note, by_profile) values (v_ws, v_content, 'Sumó un archivo', left(coalesce(p->>'name', ''), 200), auth.uid());
  end if;
  return v_id;
end $$;

-- Saca el registro de un archivo y devuelve su ruta, para que la app lo borre de Storage.
create or replace function delete_media(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_path text;
begin
  if not can_create() then raise exception 'Tu rol no borra archivos.'; end if;
  delete from media_files where id = p_id and workspace_id = v_ws returning path into v_path;
  if v_path is null then raise exception 'Ese archivo no existe.'; end if;
  return v_path;
end $$;

alter table media_files enable row level security;
revoke all on media_files from anon;
revoke insert, update, delete on media_files from authenticated;
create policy media_files_select on media_files for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(brand_id));

-- plan_usage suma el espacio usado.
drop function plan_usage();
create function plan_usage()
returns table (plan text, plan_name text, max_brands int, brands int, max_members int, members int, ai_per_month int, ai_used int, max_storage_mb int, storage_bytes bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.max_brands, (select count(*)::int from brands b where b.workspace_id = w.id),
    p.max_members,
    (select count(*)::int from profiles pr where pr.workspace_id = w.id and pr.active)
      + (select count(*)::int from invitations i where i.workspace_id = w.id and i.status = 'Pendiente' and i.expires_at > now()),
    p.ai_per_month, coalesce((select sum(uses)::int from ai_usage u where u.workspace_id = w.id and u.month = to_char(dia_ar(now()), 'YYYY-MM')), 0),
    p.max_storage_mb, coalesce((select sum(size_bytes)::bigint from media_files m where m.workspace_id = w.id), 0)
  from workspaces w join plans p on p.id = w.plan_id
  where w.id = current_workspace_id()
$$;

revoke execute on function connect_social(uuid, jsonb), disconnect_social(uuid), social_token(uuid), save_social_check(uuid, jsonb),
  add_media(jsonb), delete_media(uuid), plan_usage() from public, anon;
grant execute on function connect_social(uuid, jsonb), disconnect_social(uuid), social_token(uuid), save_social_check(uuid, jsonb),
  add_media(jsonb), delete_media(uuid), plan_usage() to authenticated;
