-- MARKETING OPS · esquema base (etapa 1)
-- Un espacio de trabajo (la empresa, el emprendimiento o la agencia) tiene una o varias marcas y sus
-- piezas de contenido. Todas las tablas llevan workspace_id y se leen con RLS. Nada se escribe directo:
-- marcas y contenidos pasan por funciones SQL que validan el rol y dejan registro con usuario y hora.

create extension if not exists pgcrypto;

-- ---------- tipos ----------
create type user_role as enum ('Administrador', 'Creador', 'Revisor');
create type content_status as enum ('Idea', 'Borrador', 'En revisión', 'Aprobado', 'Publicado');
create type content_channel as enum ('Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'WhatsApp', 'Email');
create type content_format as enum ('Post', 'Carrusel', 'Reel', 'Historia', 'Anuncio', 'Mensaje');
create type content_goal as enum ('Vender', 'Conseguir consultas', 'Lanzamiento', 'Promoción', 'Comunidad', 'Educar');
create type content_source as enum ('ia', 'plantilla', 'manual');

-- ---------- espacio de trabajo y usuarios ----------
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  role user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on profiles (workspace_id);

-- ---------- helpers de sesión ----------
create or replace function current_workspace_id() returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from profiles where id = auth.uid() and active
$$;

create or replace function current_app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() = 'Administrador', false)
$$;

-- Crea y edita piezas: Administrador y Creador.
create or replace function can_create() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() in ('Administrador', 'Creador'), false)
$$;

-- Aprueba o pide cambios: Administrador y Revisor (el dueño o el cliente que da el ok).
create or replace function can_review() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() in ('Administrador', 'Revisor'), false)
$$;

-- Día local de Argentina, nunca UTC pelado.
create or replace function dia_ar(ts timestamptz) returns date
language sql immutable as $$
  select (ts at time zone 'America/Argentina/Mendoza')::date
$$;

-- ---------- marcas ----------
create table brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  industry text not null default '',
  city text not null default '',
  description text not null default '',
  audience text not null default '',
  value_prop text not null default '',
  products text not null default '',
  tone text[] not null default '{}',
  words_avoid text not null default '',
  cta text not null default '',
  hashtags text not null default '',
  website text not null default '',
  instagram text not null default '',
  whatsapp text not null default '',
  color text not null default '#5E5CE6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on brands (workspace_id);

-- ---------- contenidos ----------
create table contents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  channel content_channel not null,
  format content_format not null,
  goal content_goal not null,
  topic text not null default '',
  title text not null default '',
  body text not null default '',
  hashtags text not null default '',
  cta text not null default '',
  status content_status not null default 'Borrador',
  publish_on date,
  source content_source not null default 'manual',
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on contents (workspace_id, status);
create index on contents (brand_id);

create table content_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_id uuid not null references contents(id) on delete cascade,
  action text not null,
  note text not null default '',
  by_profile uuid references profiles(id),
  at timestamptz not null default now()
);
create index on content_events (content_id, at);

-- ---------- reglas del circuito (iguales a src/lib/workflow.ts) ----------
-- Idea/Borrador → En revisión (crea) · En revisión → Aprobado o Borrador (revisa) · Aprobado → Publicado (crea)
-- y Aprobado → Borrador (crea, para volver a editar). Publicado no cambia más.
create or replace function can_move(p_from content_status, p_to content_status, p_role user_role) returns boolean
language sql immutable as $$
  select case
    when p_from in ('Idea', 'Borrador') and p_to = 'En revisión' then p_role in ('Administrador', 'Creador')
    when p_from = 'En revisión' and p_to in ('Aprobado', 'Borrador') then p_role in ('Administrador', 'Revisor')
    when p_from = 'Aprobado' and p_to = 'Publicado' then p_role in ('Administrador', 'Creador')
    when p_from = 'Aprobado' and p_to = 'Borrador' then p_role in ('Administrador', 'Creador')
    else false
  end
$$;

-- ---------- funciones de escritura ----------
create or replace function save_brand(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
  v_tone text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'tone', '[]'))), '{}');
begin
  if not is_admin() then raise exception 'Solo el Administrador edita las marcas.'; end if;
  if length(trim(coalesce(p->>'name', ''))) = 0 then raise exception 'La marca necesita un nombre.'; end if;
  if p_id is null then
    insert into brands (workspace_id, name, industry, city, description, audience, value_prop, products, tone, words_avoid, cta, hashtags, website, instagram, whatsapp, color, updated_by)
    values (v_ws, trim(p->>'name'), coalesce(p->>'industry', ''), coalesce(p->>'city', ''), coalesce(p->>'description', ''), coalesce(p->>'audience', ''),
      coalesce(p->>'value_prop', ''), coalesce(p->>'products', ''), v_tone, coalesce(p->>'words_avoid', ''), coalesce(p->>'cta', ''),
      coalesce(p->>'hashtags', ''), coalesce(p->>'website', ''), coalesce(p->>'instagram', ''), coalesce(p->>'whatsapp', ''),
      coalesce(nullif(p->>'color', ''), '#5E5CE6'), auth.uid())
    returning id into v_id;
  else
    update brands set
      name = trim(p->>'name'), industry = coalesce(p->>'industry', ''), city = coalesce(p->>'city', ''),
      description = coalesce(p->>'description', ''), audience = coalesce(p->>'audience', ''), value_prop = coalesce(p->>'value_prop', ''),
      products = coalesce(p->>'products', ''), tone = v_tone, words_avoid = coalesce(p->>'words_avoid', ''), cta = coalesce(p->>'cta', ''),
      hashtags = coalesce(p->>'hashtags', ''), website = coalesce(p->>'website', ''), instagram = coalesce(p->>'instagram', ''),
      whatsapp = coalesce(p->>'whatsapp', ''), color = coalesce(nullif(p->>'color', ''), color), updated_at = now(), updated_by = auth.uid()
    where id = p_id and workspace_id = v_ws
    returning id into v_id;
    if v_id is null then raise exception 'Marca inexistente.'; end if;
  end if;
  return v_id;
end $$;

-- Crea o edita una pieza. Una pieza aprobada que se edita vuelve a Borrador; una publicada no se toca.
create or replace function save_content(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
  v_status content_status;
  v_source content_source := coalesce(nullif(p->>'source', ''), 'manual')::content_source;
begin
  if not can_create() then raise exception 'Tu rol no crea ni edita contenidos.'; end if;
  if p_id is null then
    if not exists (select 1 from brands where id = (p->>'brand_id')::uuid and workspace_id = v_ws) then
      raise exception 'Marca inexistente.';
    end if;
    insert into contents (workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, source, created_by, updated_by)
    values (v_ws, (p->>'brand_id')::uuid, (p->>'channel')::content_channel, (p->>'format')::content_format, (p->>'goal')::content_goal,
      coalesce(p->>'topic', ''), coalesce(p->>'title', ''), coalesce(p->>'body', ''), coalesce(p->>'hashtags', ''), coalesce(p->>'cta', ''),
      case when length(trim(coalesce(p->>'body', ''))) = 0 then 'Idea' else 'Borrador' end::content_status,
      nullif(p->>'publish_on', '')::date, v_source, auth.uid(), auth.uid())
    returning id into v_id;
    insert into content_events (workspace_id, content_id, action, by_profile)
    values (v_ws, v_id, case v_source when 'ia' then 'Creada con IA' when 'plantilla' then 'Creada con plantilla' else 'Creada' end, auth.uid());
  else
    select status into v_status from contents where id = p_id and workspace_id = v_ws for update;
    if v_status is null then raise exception 'Contenido inexistente.'; end if;
    if v_status = 'Publicado' then raise exception 'Una pieza publicada no se edita.'; end if;
    update contents set
      title = coalesce(p->>'title', title), body = coalesce(p->>'body', body), hashtags = coalesce(p->>'hashtags', hashtags),
      cta = coalesce(p->>'cta', cta), topic = coalesce(p->>'topic', topic),
      publish_on = case when p ? 'publish_on' then nullif(p->>'publish_on', '')::date else publish_on end,
      status = case
        when status = 'Aprobado' then 'Borrador'
        when status = 'Idea' and length(trim(coalesce(p->>'body', body))) > 0 then 'Borrador'
        else status end,
      updated_at = now(), updated_by = auth.uid()
    where id = p_id;
    insert into content_events (workspace_id, content_id, action, by_profile)
    values (v_ws, p_id, case when v_status = 'Aprobado' then 'Editada (vuelve a borrador)' else 'Editada' end, auth.uid());
  end if;
  return coalesce(v_id, p_id);
end $$;

-- Mueve una pieza en el circuito según el rol. "Pedir cambios" vuelve a Borrador con una nota.
create or replace function set_content_status(p_id uuid, p_status content_status, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_role user_role := current_app_role();
  v_from content_status;
begin
  select status into v_from from contents where id = p_id and workspace_id = v_ws for update;
  if v_from is null then raise exception 'Contenido inexistente.'; end if;
  if v_role is null or not can_move(v_from, p_status, v_role) then
    raise exception 'No podés pasar esta pieza de % a %.', v_from, p_status;
  end if;
  if p_status = 'En revisión' and length(trim((select body from contents where id = p_id))) = 0 then
    raise exception 'Escribí el texto antes de mandarla a revisión.';
  end if;
  update contents set status = p_status, updated_at = now(), updated_by = auth.uid() where id = p_id;
  insert into content_events (workspace_id, content_id, action, note, by_profile)
  values (v_ws, p_id,
    case
      when v_from = 'En revisión' and p_status = 'Borrador' then 'Pidió cambios'
      when p_status = 'En revisión' then 'Mandó a revisión'
      when p_status = 'Aprobado' then 'Aprobó'
      when p_status = 'Publicado' then 'Marcó como publicada'
      else 'Volvió a borrador'
    end,
    left(coalesce(p_note, ''), 500), auth.uid());
end $$;

-- ---------- permisos ----------
alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table brands enable row level security;
alter table contents enable row level security;
alter table content_events enable row level security;

revoke all on all tables in schema public from anon;
revoke insert, update, delete on workspaces, profiles, brands, contents, content_events from authenticated;

create policy workspaces_select on workspaces for select to authenticated using (id = current_workspace_id());
create policy profiles_select on profiles for select to authenticated using (workspace_id = current_workspace_id());
create policy brands_select on brands for select to authenticated using (workspace_id = current_workspace_id());
create policy contents_select on contents for select to authenticated using (workspace_id = current_workspace_id());
create policy content_events_select on content_events for select to authenticated using (workspace_id = current_workspace_id());

revoke execute on function save_brand(uuid, jsonb), save_content(uuid, jsonb), set_content_status(uuid, content_status, text) from public, anon;
grant execute on function save_brand(uuid, jsonb), save_content(uuid, jsonb), set_content_status(uuid, content_status, text) to authenticated;
