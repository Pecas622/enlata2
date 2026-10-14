-- MARKETING OPS · base completa para un Supabase nuevo.
-- Pegala entera en SQL Editor y corré. Son las migraciones de supabase/migrations, en orden:
--   20261013000000_esquema_base.sql
--   20261014000000_calendario.sql
--   20261015000000_campanas.sql
--   20261016000000_metricas.sql
--   20261017000000_investigacion.sql
-- Al final las registra, así que un `npx supabase db push` posterior no las repite. No trae datos demo.
-- Generada desde las migraciones: si agregás una, regenerá este archivo (ver README.md de esta carpeta).

-- Freno: solo corre en una base vacía. Si el proyecto ya tiene tablas (por ejemplo, el de APPLE OPS), corta acá
-- y no toca nada: varios nombres se pisan (profiles, user_role, is_admin, dia_ar) y cambiarían sus permisos.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public') or exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'user_role') then
    raise exception 'Esta base ya tiene tablas: base.sql va en un proyecto de Supabase nuevo y vacío. No se aplicó nada.';
  end if;
end $$;

-- ======================================================================
-- 20261013000000_esquema_base.sql
-- ======================================================================
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

-- ======================================================================
-- 20261014000000_calendario.sql
-- ======================================================================
-- Etapa 2: calendario de contenidos.
-- Reprogramar no cambia el texto, así que una pieza aprobada sigue aprobada (save_content, en cambio, la vuelve a Borrador).
-- El plan del mes agrega varias ideas con fecha en una sola transacción.

create or replace function schedule_content(p_id uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_status content_status;
  v_prev date;
begin
  if not can_create() then raise exception 'Tu rol no reprograma contenidos.'; end if;
  select status, publish_on into v_status, v_prev from contents where id = p_id and workspace_id = v_ws for update;
  if v_status is null then raise exception 'Contenido inexistente.'; end if;
  if v_status = 'Publicado' then raise exception 'Una pieza publicada no se mueve.'; end if;
  if v_prev is not distinct from p_day then return; end if;
  update contents set publish_on = p_day, updated_at = now(), updated_by = auth.uid() where id = p_id;
  insert into content_events (workspace_id, content_id, action, by_profile)
  values (v_ws, p_id, case when p_day is null then 'Sacó del calendario' else 'Programó para el ' || to_char(p_day, 'DD/MM/YYYY') end, auth.uid());
end $$;

-- p_items: [{ "publish_on": "2026-10-15", "channel": "Instagram", "format": "Post", "goal": "Vender", "topic": "..." }, ...]
create or replace function add_plan_ideas(p_brand_id uuid, p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_item jsonb;
  v_id uuid;
  v_n integer := 0;
begin
  if not can_create() then raise exception 'Tu rol no crea contenidos.'; end if;
  if not exists (select 1 from brands where id = p_brand_id and workspace_id = v_ws) then raise exception 'Marca inexistente.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Elegí al menos una idea.'; end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'Son demasiadas ideas para un mes.'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if length(trim(coalesce(v_item->>'topic', ''))) = 0 or nullif(v_item->>'publish_on', '') is null then
      raise exception 'Cada idea necesita tema y fecha.';
    end if;
    insert into contents (workspace_id, brand_id, channel, format, goal, topic, title, status, publish_on, source, created_by, updated_by)
    values (v_ws, p_brand_id, (v_item->>'channel')::content_channel, (v_item->>'format')::content_format, (v_item->>'goal')::content_goal,
      left(trim(v_item->>'topic'), 300), left(trim(v_item->>'topic'), 120), 'Idea', (v_item->>'publish_on')::date, 'plantilla', auth.uid(), auth.uid())
    returning id into v_id;
    insert into content_events (workspace_id, content_id, action, note, by_profile)
    values (v_ws, v_id, 'Sugerida en el plan del mes', left(coalesce(v_item->>'reason', ''), 200), auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function schedule_content(uuid, date), add_plan_ideas(uuid, jsonb) from public, anon;
grant execute on function schedule_content(uuid, date), add_plan_ideas(uuid, jsonb) to authenticated;

-- ======================================================================
-- 20261015000000_campanas.sql
-- ======================================================================
-- Etapa 3: campañas. Una campaña tiene objetivo, fechas, presupuesto y público, y agrupa piezas de una misma marca.
-- Se escribe solo por funciones que validan el rol y dejan registro.

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  goal content_goal not null default 'Vender',
  starts_on date not null,
  ends_on date not null,
  budget numeric(14, 2) not null default 0 check (budget >= 0), -- en pesos, para pauta
  offer text not null default '',        -- la oferta o el dato concreto, tal cual lo escribió la persona
  audience text not null default '',     -- a quién apunta esta campaña
  locations text not null default '',    -- dónde: ciudades o barrios
  age_min integer not null default 18 check (age_min between 13 and 65),
  age_max integer not null default 65 check (age_max between 13 and 65),
  interests text not null default '',
  notes text not null default '',
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (age_max >= age_min)
);
create index on campaigns (workspace_id, starts_on);

create table campaign_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  action text not null,
  by_profile uuid references profiles(id),
  at timestamptz not null default now()
);
create index on campaign_events (campaign_id, at);

alter table contents add column campaign_id uuid references campaigns(id) on delete set null;
create index on contents (campaign_id);

create or replace function save_campaign(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
  v_brand uuid;
begin
  if not can_create() then raise exception 'Tu rol no crea ni edita campañas.'; end if;
  if length(trim(coalesce(p->>'name', ''))) = 0 then raise exception 'Poné un nombre a la campaña.'; end if;
  if nullif(p->>'starts_on', '') is null or nullif(p->>'ends_on', '') is null then raise exception 'Elegí desde y hasta cuándo.'; end if;
  if (p->>'ends_on')::date < (p->>'starts_on')::date then raise exception 'La campaña termina antes de empezar.'; end if;
  if coalesce(nullif(p->>'budget', '')::numeric, 0) < 0 then raise exception 'El presupuesto no puede ser negativo.'; end if;
  if p_id is null then
    v_brand := (p->>'brand_id')::uuid;
    if not exists (select 1 from brands where id = v_brand and workspace_id = v_ws) then raise exception 'Marca inexistente.'; end if;
    insert into campaigns (workspace_id, brand_id, name, goal, starts_on, ends_on, budget, offer, audience, locations, age_min, age_max, interests, notes, created_by, updated_by)
    values (v_ws, v_brand, left(trim(p->>'name'), 120), coalesce(nullif(p->>'goal', ''), 'Vender')::content_goal,
      (p->>'starts_on')::date, (p->>'ends_on')::date, coalesce(nullif(p->>'budget', '')::numeric, 0),
      left(coalesce(p->>'offer', ''), 300), left(coalesce(p->>'audience', ''), 500), left(coalesce(p->>'locations', ''), 300),
      coalesce(nullif(p->>'age_min', '')::int, 18), coalesce(nullif(p->>'age_max', '')::int, 65),
      left(coalesce(p->>'interests', ''), 500), left(coalesce(p->>'notes', ''), 1000), auth.uid(), auth.uid())
    returning id into v_id;
    insert into campaign_events (workspace_id, campaign_id, action, by_profile) values (v_ws, v_id, 'Creó la campaña', auth.uid());
  else
    -- La marca no se cambia: las piezas de la campaña son de esa marca.
    update campaigns set
      name = left(trim(p->>'name'), 120), goal = coalesce(nullif(p->>'goal', ''), goal::text)::content_goal,
      starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date, budget = coalesce(nullif(p->>'budget', '')::numeric, 0),
      offer = left(coalesce(p->>'offer', offer), 300), audience = left(coalesce(p->>'audience', audience), 500),
      locations = left(coalesce(p->>'locations', locations), 300),
      age_min = coalesce(nullif(p->>'age_min', '')::int, age_min), age_max = coalesce(nullif(p->>'age_max', '')::int, age_max),
      interests = left(coalesce(p->>'interests', interests), 500), notes = left(coalesce(p->>'notes', notes), 1000),
      updated_at = now(), updated_by = auth.uid()
    where id = p_id and workspace_id = v_ws
    returning id into v_id;
    if v_id is null then raise exception 'Campaña inexistente.'; end if;
    insert into campaign_events (workspace_id, campaign_id, action, by_profile) values (v_ws, v_id, 'Editó la campaña', auth.uid());
  end if;
  return v_id;
end $$;

-- Suma una pieza a una campaña (o la saca, con p_campaign_id null). La pieza y la campaña tienen que ser de la misma marca.
create or replace function set_content_campaign(p_content_id uuid, p_campaign_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_brand uuid;
  v_prev uuid;
  v_name text;
begin
  if not can_create() then raise exception 'Tu rol no arma campañas.'; end if;
  select brand_id, campaign_id into v_brand, v_prev from contents where id = p_content_id and workspace_id = v_ws for update;
  if v_brand is null then raise exception 'Contenido inexistente.'; end if;
  if v_prev is not distinct from p_campaign_id then return; end if;
  if p_campaign_id is not null then
    select name into v_name from campaigns where id = p_campaign_id and workspace_id = v_ws and brand_id = v_brand;
    if v_name is null then raise exception 'La campaña no existe o es de otra marca.'; end if;
  end if;
  update contents set campaign_id = p_campaign_id, updated_at = now(), updated_by = auth.uid() where id = p_content_id;
  insert into content_events (workspace_id, content_id, action, by_profile)
  values (v_ws, p_content_id, case when p_campaign_id is null then 'Sacó de la campaña' else 'Sumó a la campaña ' || v_name end, auth.uid());
  if p_campaign_id is not null then
    insert into campaign_events (workspace_id, campaign_id, action, by_profile) values (v_ws, p_campaign_id, 'Sumó una pieza', auth.uid());
  end if;
  if v_prev is not null then
    insert into campaign_events (workspace_id, campaign_id, action, by_profile) values (v_ws, v_prev, 'Sacó una pieza', auth.uid());
  end if;
end $$;

alter table campaigns enable row level security;
alter table campaign_events enable row level security;
revoke all on campaigns, campaign_events from anon;
revoke insert, update, delete on campaigns, campaign_events from authenticated;
create policy campaigns_select on campaigns for select to authenticated using (workspace_id = current_workspace_id());
create policy campaign_events_select on campaign_events for select to authenticated using (workspace_id = current_workspace_id());

revoke execute on function save_campaign(uuid, jsonb), set_content_campaign(uuid, uuid) from public, anon;
grant execute on function save_campaign(uuid, jsonb), set_content_campaign(uuid, uuid) to authenticated;

-- ======================================================================
-- 20261016000000_metricas.sql
-- ======================================================================
-- Etapa 4: métricas. Los resultados de cada pieza publicada (alcance, interacciones, clics, consultas, ventas e inversión),
-- cargados a mano desde las estadísticas de Meta. Se escriben solo por save_results, que valida el rol y deja registro.

create table content_results (
  content_id uuid primary key references contents(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  reach integer not null default 0 check (reach >= 0),               -- personas alcanzadas (o enviados, en un mensaje)
  interactions integer not null default 0 check (interactions >= 0), -- me gusta, comentarios, guardados y compartidos
  clicks integer not null default 0 check (clicks >= 0),             -- clics en el enlace o al perfil
  inquiries integer not null default 0 check (inquiries >= 0),       -- consultas por mensaje o llamada
  sales integer not null default 0 check (sales >= 0),               -- ventas que se sabe que vinieron de la pieza
  spend numeric(14, 2) not null default 0 check (spend >= 0),        -- en pesos, lo pagado para promocionarla
  notes text not null default '',
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
create index on content_results (workspace_id);

-- Carga o corrige los resultados de una pieza publicada. Una fila por pieza: la última carga pisa la anterior.
create or replace function save_results(p_content_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_status content_status;
  v_had boolean;
  v_reach int; v_inter int; v_clicks int; v_inq int; v_sales int; v_spend numeric;
begin
  if not can_create() then raise exception 'Tu rol no carga resultados.'; end if;
  select status into v_status from contents where id = p_content_id and workspace_id = v_ws;
  if v_status is null then raise exception 'Contenido inexistente.'; end if;
  if v_status <> 'Publicado' then raise exception 'Los resultados se cargan cuando la pieza está publicada.'; end if;
  begin
    v_reach := coalesce(nullif(p->>'reach', '')::int, 0);
    v_inter := coalesce(nullif(p->>'interactions', '')::int, 0);
    v_clicks := coalesce(nullif(p->>'clicks', '')::int, 0);
    v_inq := coalesce(nullif(p->>'inquiries', '')::int, 0);
    v_sales := coalesce(nullif(p->>'sales', '')::int, 0);
    v_spend := coalesce(nullif(p->>'spend', '')::numeric, 0);
  exception when others then
    raise exception 'Los resultados tienen que ser números enteros.';
  end;
  if least(v_reach, v_inter, v_clicks, v_inq, v_sales) < 0 or v_spend < 0 then raise exception 'Los resultados no pueden ser negativos.'; end if;
  v_had := exists (select 1 from content_results where content_id = p_content_id);
  insert into content_results (content_id, workspace_id, reach, interactions, clicks, inquiries, sales, spend, notes, updated_by, updated_at)
  values (p_content_id, v_ws, v_reach, v_inter, v_clicks, v_inq, v_sales, round(v_spend, 2), left(coalesce(p->>'notes', ''), 500), auth.uid(), now())
  on conflict (content_id) do update set
    reach = excluded.reach, interactions = excluded.interactions, clicks = excluded.clicks, inquiries = excluded.inquiries,
    sales = excluded.sales, spend = excluded.spend, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();
  insert into content_events (workspace_id, content_id, action, note, by_profile)
  values (v_ws, p_content_id, case when v_had then 'Corrigió los resultados' else 'Cargó los resultados' end,
    format('Alcance %s · %s interacciones · %s consultas', v_reach, v_inter, v_inq), auth.uid());
end $$;

-- Una pieza que se marca como publicada sin fecha queda con el día de hoy, así cuenta en las métricas del mes.
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
  update contents set status = p_status, updated_at = now(), updated_by = auth.uid(),
    publish_on = case when p_status = 'Publicado' then coalesce(publish_on, dia_ar(now())) else publish_on end
  where id = p_id;
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

alter table content_results enable row level security;
revoke all on content_results from anon;
revoke insert, update, delete on content_results from authenticated;
create policy content_results_select on content_results for select to authenticated using (workspace_id = current_workspace_id());

revoke execute on function save_results(uuid, jsonb) from public, anon;
grant execute on function save_results(uuid, jsonb) to authenticated;

-- ======================================================================
-- 20261017000000_investigacion.sql
-- ======================================================================
-- Etapa 5: investigar con IA. Antes de generar, Claude busca en internet qué publica la competencia y de qué se habla
-- en el rubro, y propone ideas con sus fuentes. Cada investigación se guarda (cuesta búsquedas y tiempo) para volver a
-- leerla y para pasar sus ideas al calendario. Se escribe solo por save_research y add_research_idea.

create table brand_research (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  focus text not null default '',              -- lo que pidió mirar la persona (competidores, una fecha, un producto)
  summary text not null default '',
  trends jsonb not null default '[]',          -- [{ "title", "detail", "sources": [url] }]  de qué se habla en el rubro
  competitors jsonb not null default '[]',     -- [{ "name", "detail", "sources": [url] }]   qué publica la competencia
  ideas jsonb not null default '[]',           -- [{ "topic", "why", "channel", "format", "goal", "sources": [url], "content_id"? }]
  sources jsonb not null default '[]',         -- [{ "url", "title" }] lo que encontró la búsqueda
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on brand_research (workspace_id, brand_id, created_at desc);

alter table brand_research enable row level security;
create policy brand_research_select on brand_research for select to authenticated using (workspace_id = current_workspace_id());

-- Guarda una investigación ya validada en el servidor. Devuelve su id.
create or replace function save_research(p_brand_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
  v_arr text;
begin
  if not can_create() then raise exception 'Tu rol no investiga.'; end if;
  if not exists (select 1 from brands where id = p_brand_id and workspace_id = v_ws) then raise exception 'Marca inexistente.'; end if;
  foreach v_arr in array array['trends', 'competitors', 'ideas', 'sources'] loop
    if jsonb_typeof(coalesce(p->v_arr, '[]')) <> 'array' then raise exception 'Investigación mal armada.'; end if;
    if jsonb_array_length(coalesce(p->v_arr, '[]')) > 30 then raise exception 'La investigación trae demasiados puntos.'; end if;
  end loop;
  if jsonb_array_length(coalesce(p->'trends', '[]')) + jsonb_array_length(coalesce(p->'competitors', '[]')) + jsonb_array_length(coalesce(p->'ideas', '[]')) = 0 then
    raise exception 'La investigación no trajo nada para guardar.';
  end if;
  insert into brand_research (workspace_id, brand_id, focus, summary, trends, competitors, ideas, sources, created_by)
  values (v_ws, p_brand_id, left(coalesce(p->>'focus', ''), 300), left(coalesce(p->>'summary', ''), 2000),
    coalesce(p->'trends', '[]'), coalesce(p->'competitors', '[]'), coalesce(p->'ideas', '[]'), coalesce(p->'sources', '[]'), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Pasa una idea de la investigación al calendario como Idea, en el día elegido. La idea sale de la base (no del
-- navegador), queda marcada con la pieza creada para no sumarla dos veces y la pieza registra de dónde salió.
create or replace function add_research_idea(p_research_id uuid, p_index integer, p_day date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_r brand_research%rowtype;
  v_idea jsonb;
  v_id uuid;
begin
  if not can_create() then raise exception 'Tu rol no crea contenidos.'; end if;
  select * into v_r from brand_research where id = p_research_id and workspace_id = v_ws for update;
  if v_r.id is null then raise exception 'Investigación inexistente.'; end if;
  v_idea := v_r.ideas->p_index;
  if v_idea is null or p_index < 0 or length(trim(coalesce(v_idea->>'topic', ''))) = 0 then raise exception 'Idea inexistente.'; end if;
  if nullif(v_idea->>'content_id', '') is not null then raise exception 'Esa idea ya está en el calendario.'; end if;
  if p_day is null then raise exception 'Elegí un día.'; end if;
  if p_day < dia_ar(now()) then raise exception 'Elegí un día de hoy en adelante.'; end if;
  begin
    insert into contents (workspace_id, brand_id, channel, format, goal, topic, title, status, publish_on, source, created_by, updated_by)
    values (v_ws, v_r.brand_id, (v_idea->>'channel')::content_channel, (v_idea->>'format')::content_format, (v_idea->>'goal')::content_goal,
      left(trim(v_idea->>'topic'), 300), left(trim(v_idea->>'topic'), 120), 'Idea', p_day, 'ia', auth.uid(), auth.uid())
    returning id into v_id;
  exception when invalid_text_representation then
    raise exception 'La idea tiene una red, formato u objetivo que no existe.';
  end;
  insert into content_events (workspace_id, content_id, action, note, by_profile)
  values (v_ws, v_id, 'Sugerida por la investigación', left(coalesce(v_idea->>'why', ''), 200), auth.uid());
  update brand_research set ideas = jsonb_set(ideas, array[p_index::text, 'content_id'], to_jsonb(v_id)) where id = p_research_id;
  return v_id;
end $$;

revoke execute on function save_research(uuid, jsonb), add_research_idea(uuid, integer, date) from public, anon;
grant execute on function save_research(uuid, jsonb), add_research_idea(uuid, integer, date) to authenticated;

-- ---------- registro de migraciones ----------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261013000000', 'esquema_base') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261014000000', 'calendario') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261015000000', 'campanas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261016000000', 'metricas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261017000000', 'investigacion') on conflict do nothing;
