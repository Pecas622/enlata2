-- Etapa 9: publicar y programar en Instagram.
-- Una pieza aprobada de Instagram, con sus fotos o su video, se publica ahora o se programa para un día y hora.
-- La publicación vive en "publications" (una por pieza): Programada → Publicando → Publicada, o Error con el motivo.
-- La pieza pasa a Publicado solo cuando Instagram confirma la publicación; nunca antes.
-- Programar y cancelar lo hace la persona (Administrador o Creador). Publicar lo hace el servidor con la clave de
-- servicio (lo dispara "Publicar ahora" o el cron cada pocos minutos): esas funciones no se le dan a authenticated.

create table publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  content_id uuid not null unique references contents(id) on delete cascade,
  account_id uuid references social_accounts(id) on delete set null,
  platform text not null default 'Instagram' check (platform in ('Instagram')),
  status text not null default 'Programada' check (status in ('Programada', 'Publicando', 'Publicada', 'Error')),
  scheduled_at timestamptz not null,
  attempts int not null default 0,
  last_error text not null default '',
  container_id text not null default '',      -- el contenedor que armó Instagram, mientras procesa un video
  external_id text not null default '',       -- el id de la publicación en Instagram
  permalink text not null default '',
  locked_until timestamptz,                   -- mientras un proceso la está publicando
  published_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on publications (status, scheduled_at);
create index on publications (workspace_id, brand_id);

-- Programa (o reprograma) la publicación de una pieza. "Publicar ahora" es programarla para ya.
create or replace function schedule_publication(p_content_id uuid, p_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_c contents;
  v_acc social_accounts;
  v_pub publications;
  v_id uuid;
begin
  if not can_create() then raise exception 'Tu rol no publica.'; end if;
  select * into v_c from contents where id = p_content_id and workspace_id = v_ws for update;
  if v_c.id is null or not can_see_brand(v_c.brand_id) then raise exception 'Contenido inexistente.'; end if;
  if v_c.status <> 'Aprobado' then raise exception 'Solo se publica una pieza aprobada.'; end if;
  if v_c.channel <> 'Instagram' then raise exception 'Por ahora se publica solo en Instagram.'; end if;
  if v_c.format not in ('Post', 'Carrusel', 'Reel', 'Historia') then raise exception 'Los anuncios se cargan en Meta Ads, no se publican desde acá.'; end if;
  select * into v_acc from social_accounts where brand_id = v_c.brand_id and platform = 'Instagram';
  if v_acc.id is null then raise exception 'Conectá el Instagram de la marca en Redes.'; end if;
  if v_acc.status <> 'Conectada' then raise exception 'La conexión con Instagram está %: reconectala en Redes.', lower(v_acc.status); end if;
  if not exists (select 1 from media_files where content_id = p_content_id and kind <> 'logo') then
    raise exception 'Subí las fotos o el video de la pieza antes de publicarla.';
  end if;
  if p_at is null or p_at < now() - interval '5 minutes' then raise exception 'Elegí un día y hora que no hayan pasado.'; end if;
  if p_at > now() + interval '90 days' then raise exception 'Se programa hasta 90 días para adelante.'; end if;
  select * into v_pub from publications where content_id = p_content_id for update;
  if v_pub.status in ('Publicando', 'Publicada') then raise exception 'Esta pieza ya se está publicando.'; end if;
  insert into publications (workspace_id, brand_id, content_id, account_id, status, scheduled_at, created_by)
  values (v_ws, v_c.brand_id, p_content_id, v_acc.id, 'Programada', p_at, auth.uid())
  on conflict (content_id) do update set account_id = excluded.account_id, status = 'Programada', scheduled_at = excluded.scheduled_at,
    attempts = 0, last_error = '', container_id = '', locked_until = null, created_by = auth.uid(), updated_at = now()
  returning id into v_id;
  -- El calendario muestra el día y la hora reales.
  update contents set publish_on = dia_ar(p_at), post_time = (p_at at time zone 'America/Argentina/Mendoza')::time, updated_at = now()
  where id = p_content_id;
  insert into content_events (workspace_id, content_id, action, note, by_profile)
  values (v_ws, p_content_id,
    case when p_at <= now() + interval '1 minute' then 'Mandó a publicar en Instagram' else 'Programó en Instagram' end,
    to_char(p_at at time zone 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI') || coalesce(' · @' || nullif(v_acc.username, ''), ''), auth.uid());
  return v_id;
end $$;

create or replace function cancel_publication(p_content_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_pub publications;
begin
  if not can_create() then raise exception 'Tu rol no publica.'; end if;
  select * into v_pub from publications where content_id = p_content_id and workspace_id = v_ws for update;
  if v_pub.id is null or not can_see_brand(v_pub.brand_id) then raise exception 'Esa pieza no está programada.'; end if;
  if v_pub.status not in ('Programada', 'Error') then raise exception 'Ya se está publicando: no se puede cancelar.'; end if;
  delete from publications where id = v_pub.id;
  insert into content_events (workspace_id, content_id, action, by_profile) values (v_ws, p_content_id, 'Canceló la publicación', auth.uid());
end $$;

-- Si la pieza cambia de día en el calendario, la publicación programada se mueve con ella, a la misma hora.
create or replace function move_publication() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.publish_on is not null and new.publish_on is distinct from old.publish_on then
    update publications
    set scheduled_at = greatest(now(), (new.publish_on + (scheduled_at at time zone 'America/Argentina/Mendoza')::time) at time zone 'America/Argentina/Mendoza'),
        updated_at = now()
    where content_id = new.id and status = 'Programada' and dia_ar(scheduled_at) <> new.publish_on;
  end if;
  return new;
end $$;
create trigger contents_move_publication after update of publish_on on contents for each row execute function move_publication();

-- ---------- lo que corre el servidor (clave de servicio) ----------

-- Toma las publicaciones que ya tocan y las marca "Publicando" por unos minutos para que otro proceso no las repita.
-- Antes descarta las que ya no se pueden publicar, con el motivo.
create or replace function claim_publications(p_limit int default 5, p_only uuid default null)
returns table (id uuid, workspace_id uuid, content_id uuid, account_id uuid, format text, caption text, container_id text,
  token_enc text, token_expires_at timestamptz, connected_at timestamptz, ig_user_id text, media jsonb)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  update publications p set status = 'Error', locked_until = null, updated_at = now(),
    last_error = case
      when c.status <> 'Aprobado' then 'La pieza dejó de estar aprobada: aprobala y programala de nuevo.'
      when a.id is null then 'El Instagram de la marca se desconectó: conectalo en Redes y programala de nuevo.'
      else 'La conexión con Instagram está ' || lower(a.status) || ': reconectala en Redes y programala de nuevo.'
    end
  from contents c left join social_accounts a on a.brand_id = c.brand_id and a.platform = 'Instagram'
  where c.id = p.content_id and p.status = 'Programada' and p.scheduled_at <= now() and (p_only is null or p.content_id = p_only)
    and (c.status <> 'Aprobado' or a.id is null or a.status <> 'Conectada');

  -- Un video que Instagram no termina de procesar después de muchas vueltas queda en error.
  update publications p set status = 'Error', locked_until = null, updated_at = now(),
    last_error = 'Instagram no terminó de procesar el archivo. Probá de nuevo o con un archivo más liviano.'
  where p.status = 'Publicando' and p.attempts >= 12 and (p.locked_until is null or p.locked_until < now());

  return query
  with picked as (
    select p.id from publications p
    where p.status in ('Programada', 'Publicando') and p.scheduled_at <= now()
      and (p.locked_until is null or p.locked_until < now()) and (p_only is null or p.content_id = p_only)
    order by p.scheduled_at
    limit greatest(1, least(coalesce(p_limit, 5), 20))
    for update skip locked
  ), upd as (
    update publications p set status = 'Publicando', attempts = p.attempts + 1, locked_until = now() + interval '4 minutes', updated_at = now()
    from picked where p.id = picked.id
    returning p.*
  )
  select u.id, u.workspace_id, u.content_id, a.id, c.format::text,
    case when c.format = 'Historia' then '' else left(trim(c.body || case when c.hashtags <> '' then E'\n\n' || c.hashtags else '' end), 2200) end,
    u.container_id, a.token_enc, a.token_expires_at, a.connected_at, a.external_id,
    coalesce((select jsonb_agg(jsonb_build_object('path', m.path, 'mime', m.mime) order by m.created_at)
              from media_files m where m.content_id = u.content_id and m.kind <> 'logo'), '[]'::jsonb)
  from upd u join contents c on c.id = u.content_id join social_accounts a on a.brand_id = c.brand_id and a.platform = 'Instagram';
end $$;

-- Guarda el contenedor que armó Instagram, para seguir en la próxima vuelta si el video todavía se procesa.
create or replace function save_publication_container(p_id uuid, p_container_id text) returns void
language sql security definer set search_path = public as $$
  update publications set container_id = left(coalesce(p_container_id, ''), 100), updated_at = now() where id = p_id and status = 'Publicando'
$$;

-- El token renovado por el servidor antes de publicar.
create or replace function save_publication_token(p_account_id uuid, p_token_enc text, p_expires_at timestamptz) returns void
language sql security definer set search_path = public as $$
  update social_accounts set token_enc = p_token_enc, token_expires_at = p_expires_at, checked_at = now()
  where id = p_account_id and coalesce(p_token_enc, '') <> ''
$$;

-- Cierra una vuelta del publicador:
--   { "ok": true, "external_id", "permalink" }  Instagram confirmó: publicación Publicada y pieza Publicado.
--   { "retry": true }                            el video sigue procesándose: se reintenta en un minuto.
--   { "error": "...", "expired": bool }          no se pudo: Error con el motivo (y la conexión Vencida si el token murió).
create or replace function finish_publication(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pub publications;
begin
  select * into v_pub from publications where id = p_id for update;
  if v_pub.id is null or v_pub.status <> 'Publicando' then return; end if;
  if coalesce((p->>'ok')::boolean, false) then
    update publications set status = 'Publicada', external_id = left(coalesce(p->>'external_id', ''), 100),
      permalink = left(coalesce(p->>'permalink', ''), 500), published_at = now(), locked_until = null, last_error = '', updated_at = now()
    where id = p_id;
    update contents set status = 'Publicado', publish_on = dia_ar(now()), updated_at = now(), updated_by = v_pub.created_by where id = v_pub.content_id;
    insert into content_events (workspace_id, content_id, action, note, by_profile)
    values (v_pub.workspace_id, v_pub.content_id, 'Publicó en Instagram', coalesce(p->>'permalink', ''), v_pub.created_by);
  elsif coalesce((p->>'retry')::boolean, false) then
    update publications set locked_until = now() + interval '1 minute', updated_at = now() where id = p_id;
  else
    update publications set status = 'Error', last_error = left(coalesce(nullif(p->>'error', ''), 'Instagram no publicó la pieza.'), 500),
      locked_until = null, updated_at = now()
    where id = p_id;
    insert into content_events (workspace_id, content_id, action, note, by_profile)
    values (v_pub.workspace_id, v_pub.content_id, 'No se pudo publicar en Instagram', left(coalesce(p->>'error', ''), 500), v_pub.created_by);
    if coalesce((p->>'expired')::boolean, false) and v_pub.account_id is not null then
      update social_accounts set status = 'Vencida', last_error = left(coalesce(p->>'error', ''), 300), checked_at = now() where id = v_pub.account_id;
    end if;
  end if;
end $$;

alter table publications enable row level security;
revoke all on publications from anon;
revoke insert, update, delete on publications from authenticated;
create policy publications_select on publications for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(brand_id));

revoke execute on function schedule_publication(uuid, timestamptz), cancel_publication(uuid) from public, anon;
grant execute on function schedule_publication(uuid, timestamptz), cancel_publication(uuid) to authenticated;
revoke execute on function claim_publications(int, uuid), save_publication_container(uuid, text), save_publication_token(uuid, text, timestamptz),
  finish_publication(uuid, jsonb) from public, anon, authenticated;
grant execute on function claim_publications(int, uuid), save_publication_container(uuid, text), save_publication_token(uuid, text, timestamptz),
  finish_publication(uuid, jsonb) to service_role;
