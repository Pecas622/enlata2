-- MARKETING OPS · base completa para un Supabase nuevo.
-- Pegala entera en SQL Editor y corré. Son las migraciones de supabase/migrations, en orden:
--   20261013000000_esquema_base.sql
--   20261014000000_calendario.sql
--   20261015000000_campanas.sql
--   20261016000000_metricas.sql
--   20261017000000_investigacion.sql
--   20261018000000_plan_mensual.sql
--   20261019000000_acciones_piezas.sql
--   20261020000000_equipo.sql
--   20261021000000_redes_archivos.sql
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

-- ======================================================================
-- 20261018000000_plan_mensual.sql
-- ======================================================================
-- Etapa 6: plan mensual con IA. La marca suma lo que hace falta para planificar (objetivos, redes, frecuencia,
-- presupuesto, mercado e identidad visual) y cada pieza suma horario sugerido, gancho, guion o estructura, recursos y
-- por qué se propone. El plan del mes se arma en el servidor (Claude o reglas), se guarda en content_plans y sus
-- piezas pasan al calendario con add_plan_pieces, que las lee de la base y no del navegador.

alter table brands
  add column goals text not null default '',                          -- qué quiere lograr la marca este tiempo
  add column channels content_channel[] not null default '{Instagram}', -- dónde publica
  add column posts_per_week integer not null default 3 check (posts_per_week between 1 and 7),
  add column ad_budget numeric(14,2) not null default 0 check (ad_budget >= 0), -- presupuesto mensual de publicidad, en pesos
  add column market text not null default '',                         -- mercado o zona donde vende
  add column visual_style text not null default '';                   -- colores, tipografía, estilo de fotos

alter table contents
  add column post_time time,                        -- horario sugerido (una sugerencia, no una programación)
  add column hook text not null default '',         -- la primera frase o los primeros segundos
  add column structure text not null default '',    -- guion o estructura por placas, escenas o partes
  add column resources text not null default '',    -- qué hace falta: fotos, video, placas
  add column rationale text not null default '';    -- por qué se propone esta pieza

create table content_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source content_source not null,                   -- 'ia' o 'plantilla'
  summary text not null default '',                 -- la estrategia del mes en pocas frases
  items jsonb not null default '[]',                -- [{ publish_on, post_time, channel, format, goal, topic, title, hook, structure, body, hashtags, cta, resources, rationale, content_id? }]
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on content_plans (workspace_id, brand_id, month, created_at desc);

alter table content_plans enable row level security;
create policy content_plans_select on content_plans for select to authenticated using (workspace_id = current_workspace_id());

-- ---------- marca ----------
create or replace function save_brand(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
  v_tone text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'tone', '[]'))), '{}');
  v_channels content_channel[];
  v_ppw integer;
  v_budget numeric;
begin
  if not is_admin() then raise exception 'Solo el Administrador edita las marcas.'; end if;
  if length(trim(coalesce(p->>'name', ''))) = 0 then raise exception 'La marca necesita un nombre.'; end if;
  if p ? 'channels' then
    begin
      v_channels := array(select distinct c::content_channel from jsonb_array_elements_text(p->'channels') c order by 1);
    exception when invalid_text_representation then
      raise exception 'Una de las redes no existe.';
    end;
    if cardinality(v_channels) = 0 then raise exception 'Elegí al menos una red.'; end if;
  end if;
  v_ppw := nullif(p->>'posts_per_week', '')::integer;
  if v_ppw is not null and (v_ppw < 1 or v_ppw > 7) then raise exception 'Las publicaciones por semana van de 1 a 7.'; end if;
  v_budget := nullif(p->>'ad_budget', '')::numeric;
  if v_budget is not null and v_budget < 0 then raise exception 'El presupuesto no puede ser negativo.'; end if;
  if p_id is null then
    insert into brands (workspace_id, name, industry, city, description, audience, value_prop, products, tone, words_avoid, cta, hashtags, website, instagram, whatsapp, color,
      goals, channels, posts_per_week, ad_budget, market, visual_style, updated_by)
    values (v_ws, trim(p->>'name'), coalesce(p->>'industry', ''), coalesce(p->>'city', ''), coalesce(p->>'description', ''), coalesce(p->>'audience', ''),
      coalesce(p->>'value_prop', ''), coalesce(p->>'products', ''), v_tone, coalesce(p->>'words_avoid', ''), coalesce(p->>'cta', ''),
      coalesce(p->>'hashtags', ''), coalesce(p->>'website', ''), coalesce(p->>'instagram', ''), coalesce(p->>'whatsapp', ''),
      coalesce(nullif(p->>'color', ''), '#5E5CE6'),
      coalesce(p->>'goals', ''), coalesce(v_channels, '{Instagram}'), coalesce(v_ppw, 3), coalesce(v_budget, 0),
      coalesce(p->>'market', ''), coalesce(p->>'visual_style', ''), auth.uid())
    returning id into v_id;
  else
    -- Los campos nuevos solo cambian si vienen: así una llamada vieja no los borra.
    update brands set
      name = trim(p->>'name'), industry = coalesce(p->>'industry', ''), city = coalesce(p->>'city', ''),
      description = coalesce(p->>'description', ''), audience = coalesce(p->>'audience', ''), value_prop = coalesce(p->>'value_prop', ''),
      products = coalesce(p->>'products', ''), tone = v_tone, words_avoid = coalesce(p->>'words_avoid', ''), cta = coalesce(p->>'cta', ''),
      hashtags = coalesce(p->>'hashtags', ''), website = coalesce(p->>'website', ''), instagram = coalesce(p->>'instagram', ''),
      whatsapp = coalesce(p->>'whatsapp', ''), color = coalesce(nullif(p->>'color', ''), color),
      goals = coalesce(p->>'goals', goals), channels = coalesce(v_channels, channels), posts_per_week = coalesce(v_ppw, posts_per_week),
      ad_budget = coalesce(v_budget, ad_budget), market = coalesce(p->>'market', market), visual_style = coalesce(p->>'visual_style', visual_style),
      updated_at = now(), updated_by = auth.uid()
    where id = p_id and workspace_id = v_ws
    returning id into v_id;
    if v_id is null then raise exception 'Marca inexistente.'; end if;
  end if;
  return v_id;
end $$;

-- ---------- pieza ----------
-- Igual que antes, con gancho, estructura, recursos, justificación y horario sugerido.
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
    insert into contents (workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, source,
      post_time, hook, structure, resources, rationale, created_by, updated_by)
    values (v_ws, (p->>'brand_id')::uuid, (p->>'channel')::content_channel, (p->>'format')::content_format, (p->>'goal')::content_goal,
      coalesce(p->>'topic', ''), coalesce(p->>'title', ''), coalesce(p->>'body', ''), coalesce(p->>'hashtags', ''), coalesce(p->>'cta', ''),
      case when length(trim(coalesce(p->>'body', ''))) = 0 then 'Idea' else 'Borrador' end::content_status,
      nullif(p->>'publish_on', '')::date, v_source,
      nullif(p->>'post_time', '')::time, coalesce(p->>'hook', ''), coalesce(p->>'structure', ''), coalesce(p->>'resources', ''), coalesce(p->>'rationale', ''),
      auth.uid(), auth.uid())
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
      hook = coalesce(p->>'hook', hook), structure = coalesce(p->>'structure', structure),
      resources = coalesce(p->>'resources', resources), rationale = coalesce(p->>'rationale', rationale),
      publish_on = case when p ? 'publish_on' then nullif(p->>'publish_on', '')::date else publish_on end,
      post_time = case when p ? 'post_time' then nullif(p->>'post_time', '')::time else post_time end,
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

-- ---------- plan del mes ----------
-- Guarda un plan ya validado en el servidor. Devuelve su id.
create or replace function save_plan(p_brand_id uuid, p_month text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
begin
  if not can_create() then raise exception 'Tu rol no arma planes.'; end if;
  if not exists (select 1 from brands where id = p_brand_id and workspace_id = v_ws) then raise exception 'Marca inexistente.'; end if;
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mes inválido.'; end if;
  if coalesce(p->>'source', '') not in ('ia', 'plantilla') then raise exception 'Plan mal armado.'; end if;
  if jsonb_typeof(coalesce(p->'items', '[]')) <> 'array' or jsonb_array_length(coalesce(p->'items', '[]')) = 0 then
    raise exception 'El plan no trae piezas.';
  end if;
  if jsonb_array_length(p->'items') > 62 then raise exception 'Son demasiadas piezas para un mes.'; end if;
  insert into content_plans (workspace_id, brand_id, month, source, summary, items, created_by)
  values (v_ws, p_brand_id, p_month, (p->>'source')::content_source, left(coalesce(p->>'summary', ''), 2000), p->'items', auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Pasa al calendario las piezas elegidas del plan (por su posición). Cada pieza sale de la base, queda marcada para
-- no sumarla dos veces y registra por qué se propuso. Con texto queda en Borrador; sin texto, como Idea.
create or replace function add_plan_pieces(p_plan_id uuid, p_indexes integer[]) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_plan content_plans%rowtype;
  v_i integer;
  v_item jsonb;
  v_id uuid;
  v_n integer := 0;
begin
  if not can_create() then raise exception 'Tu rol no crea contenidos.'; end if;
  select * into v_plan from content_plans where id = p_plan_id and workspace_id = v_ws for update;
  if v_plan.id is null then raise exception 'Plan inexistente.'; end if;
  if coalesce(cardinality(p_indexes), 0) = 0 then raise exception 'Elegí al menos una pieza.'; end if;
  foreach v_i in array (select array_agg(distinct x) from unnest(p_indexes) x) loop
    v_item := v_plan.items->v_i;
    if v_i < 0 or v_item is null or length(trim(coalesce(v_item->>'topic', ''))) = 0 then raise exception 'Pieza inexistente.'; end if;
    if nullif(v_item->>'content_id', '') is not null then raise exception 'Una de las piezas ya está en el calendario.'; end if;
    if nullif(v_item->>'publish_on', '') is null or (v_item->>'publish_on')::date < dia_ar(now()) then
      raise exception 'Una de las piezas es de un día que ya pasó: armá el plan de nuevo.';
    end if;
    begin
      insert into contents (workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, source,
        post_time, hook, structure, resources, rationale, created_by, updated_by)
      values (v_ws, v_plan.brand_id, (v_item->>'channel')::content_channel, (v_item->>'format')::content_format, (v_item->>'goal')::content_goal,
        left(trim(v_item->>'topic'), 300), left(coalesce(nullif(trim(v_item->>'title'), ''), trim(v_item->>'topic')), 120),
        left(coalesce(v_item->>'body', ''), 4000), left(coalesce(v_item->>'hashtags', ''), 500), left(coalesce(v_item->>'cta', ''), 160),
        case when length(trim(coalesce(v_item->>'body', ''))) = 0 then 'Idea' else 'Borrador' end::content_status,
        (v_item->>'publish_on')::date, v_plan.source, nullif(v_item->>'post_time', '')::time,
        left(coalesce(v_item->>'hook', ''), 300), left(coalesce(v_item->>'structure', ''), 3000),
        left(coalesce(v_item->>'resources', ''), 500), left(coalesce(v_item->>'rationale', ''), 500), auth.uid(), auth.uid())
      returning id into v_id;
    exception when invalid_text_representation or invalid_datetime_format then
      raise exception 'Una de las piezas tiene una red, formato, objetivo u horario que no existe.';
    end;
    insert into content_events (workspace_id, content_id, action, note, by_profile)
    values (v_ws, v_id, case v_plan.source when 'ia' then 'Planificada con IA' else 'Planificada con plantilla' end,
      left(coalesce(v_item->>'rationale', ''), 200), auth.uid());
    v_plan.items := jsonb_set(v_plan.items, array[v_i::text, 'content_id'], to_jsonb(v_id));
    v_n := v_n + 1;
  end loop;
  update content_plans set items = v_plan.items where id = p_plan_id;
  return v_n;
end $$;

revoke execute on function save_plan(uuid, text, jsonb), add_plan_pieces(uuid, integer[]) from public, anon;
grant execute on function save_plan(uuid, text, jsonb), add_plan_pieces(uuid, integer[]) to authenticated;

-- ======================================================================
-- 20261019000000_acciones_piezas.sql
-- ======================================================================
-- Etapa 6b: acciones sobre las piezas desde el calendario y la pieza. Duplicar y adaptar a otra red crean una pieza
-- nueva a partir de otra (copy_content); borrar saca una pieza que todavía no se publicó (delete_content) y deja
-- registro en content_deletions, porque su historial se va con ella.

create table content_deletions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content_id uuid not null,                     -- la pieza que ya no existe
  brand_id uuid references brands(id) on delete set null,
  title text not null default '',
  status content_status not null,
  publish_on date,
  by_profile uuid references profiles(id),
  at timestamptz not null default now()
);
create index on content_deletions (workspace_id, at desc);

alter table content_deletions enable row level security;
create policy content_deletions_select on content_deletions for select to authenticated using (workspace_id = current_workspace_id());

-- Crea una pieza nueva a partir de otra. Lo que venga en p reemplaza lo de la original (red, formato, título, texto,
-- hashtags, llamado, gancho, estructura, recursos, fecha, origen); lo que no venga se copia, salvo la fecha, que
-- queda vacía si no se manda. Con texto nace como Borrador; sin texto, como Idea. p->>'mode' = 'adapt' o 'duplicate'.
create or replace function copy_content(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_c contents%rowtype;
  v_id uuid;
  v_body text;
  v_channel content_channel;
  v_format content_format;
begin
  if not can_create() then raise exception 'Tu rol no crea contenidos.'; end if;
  select * into v_c from contents where id = p_id and workspace_id = v_ws;
  if v_c.id is null then raise exception 'Contenido inexistente.'; end if;
  begin
    v_channel := coalesce(nullif(p->>'channel', ''), v_c.channel::text)::content_channel;
    v_format := coalesce(nullif(p->>'format', ''), v_c.format::text)::content_format;
  exception when invalid_text_representation then
    raise exception 'Esa red o formato no existe.';
  end;
  v_body := left(coalesce(p->>'body', v_c.body), 4000);
  insert into contents (workspace_id, brand_id, channel, format, goal, topic, title, body, hashtags, cta, status, publish_on, source,
    campaign_id, post_time, hook, structure, resources, rationale, created_by, updated_by)
  values (v_ws, v_c.brand_id, v_channel, v_format, v_c.goal, v_c.topic,
    left(coalesce(p->>'title', v_c.title), 120), v_body, left(coalesce(p->>'hashtags', v_c.hashtags), 500), left(coalesce(p->>'cta', v_c.cta), 200),
    case when length(trim(v_body)) = 0 then 'Idea' else 'Borrador' end::content_status,
    nullif(p->>'publish_on', '')::date, coalesce(nullif(p->>'source', ''), v_c.source::text)::content_source,
    v_c.campaign_id, case when p ? 'post_time' then nullif(p->>'post_time', '')::time else v_c.post_time end,
    left(coalesce(p->>'hook', v_c.hook), 300), left(coalesce(p->>'structure', v_c.structure), 3000),
    left(coalesce(p->>'resources', v_c.resources), 500), v_c.rationale, auth.uid(), auth.uid())
  returning id into v_id;
  insert into content_events (workspace_id, content_id, action, by_profile)
  values (v_ws, v_id,
    case when p->>'mode' = 'adapt' then 'Adaptada de “' || left(coalesce(nullif(v_c.title, ''), v_c.topic), 80) || '” para ' || v_channel
      else 'Duplicada de “' || left(coalesce(nullif(v_c.title, ''), v_c.topic), 80) || '”' end,
    auth.uid());
  return v_id;
end $$;

-- Borra una pieza que no se publicó. Las investigaciones y planes que la apuntaban la liberan, así se puede volver a sumar.
create or replace function delete_content(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_c contents%rowtype;
begin
  if not can_create() then raise exception 'Tu rol no borra contenidos.'; end if;
  select * into v_c from contents where id = p_id and workspace_id = v_ws for update;
  if v_c.id is null then raise exception 'Contenido inexistente.'; end if;
  if v_c.status = 'Publicado' then raise exception 'Una pieza publicada no se borra: tiene sus resultados.'; end if;
  insert into content_deletions (workspace_id, content_id, brand_id, title, status, publish_on, by_profile)
  values (v_ws, v_c.id, v_c.brand_id, coalesce(nullif(v_c.title, ''), v_c.topic), v_c.status, v_c.publish_on, auth.uid());
  update content_plans set items = (
    select jsonb_agg(case when e->>'content_id' = p_id::text then e - 'content_id' else e end order by n)
    from jsonb_array_elements(items) with ordinality t(e, n))
  where workspace_id = v_ws and items @> jsonb_build_array(jsonb_build_object('content_id', p_id::text));
  update brand_research set ideas = (
    select jsonb_agg(case when e->>'content_id' = p_id::text then e - 'content_id' else e end order by n)
    from jsonb_array_elements(ideas) with ordinality t(e, n))
  where workspace_id = v_ws and ideas @> jsonb_build_array(jsonb_build_object('content_id', p_id::text));
  delete from contents where id = p_id;
end $$;

revoke execute on function copy_content(uuid, jsonb), delete_content(uuid) from public, anon;
grant execute on function copy_content(uuid, jsonb), delete_content(uuid) to authenticated;

-- ======================================================================
-- 20261020000000_equipo.sql
-- ======================================================================
-- Etapa 7: equipo y clientes. El Administrador invita gente por email desde la app, elige su rol y, para un
-- Revisor (el cliente de una agencia), qué marcas ve. La persona se registra con ese email y queda adentro.
-- Las marcas que ve cada uno se aplican con RLS en todas las tablas, no solo en la pantalla.

-- ---------- perfiles ----------
alter table profiles add column email text not null default '';
alter table profiles add column brand_ids uuid[]; -- null: todas las marcas. Solo un Revisor puede tener marcas elegidas.
update profiles p set email = lower(u.email) from auth.users u where u.id = p.id;

-- ¿El usuario actual ve esta marca?
create or replace function can_see_brand(p_brand uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select brand_ids is null or p_brand = any(brand_ids) from profiles where id = auth.uid() and active), false)
$$;

create or replace function can_see_content(p_content uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_see_brand(brand_id) from contents where id = p_content), false)
$$;

create or replace function can_see_campaign(p_campaign uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_see_brand(brand_id) from campaigns where id = p_campaign), false)
$$;

-- ---------- RLS por marca ----------
drop policy brands_select on brands;
create policy brands_select on brands for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(id));
drop policy contents_select on contents;
create policy contents_select on contents for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(brand_id));
drop policy content_events_select on content_events;
create policy content_events_select on content_events for select to authenticated using (workspace_id = current_workspace_id() and can_see_content(content_id));
drop policy campaigns_select on campaigns;
create policy campaigns_select on campaigns for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(brand_id));
drop policy campaign_events_select on campaign_events;
create policy campaign_events_select on campaign_events for select to authenticated using (workspace_id = current_workspace_id() and can_see_campaign(campaign_id));
drop policy content_results_select on content_results;
create policy content_results_select on content_results for select to authenticated using (workspace_id = current_workspace_id() and can_see_content(content_id));
drop policy brand_research_select on brand_research;
create policy brand_research_select on brand_research for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(brand_id));
drop policy content_plans_select on content_plans;
create policy content_plans_select on content_plans for select to authenticated using (workspace_id = current_workspace_id() and can_see_brand(brand_id));
drop policy content_deletions_select on content_deletions;
create policy content_deletions_select on content_deletions for select to authenticated using (workspace_id = current_workspace_id() and (brand_id is null or can_see_brand(brand_id)));

-- El Revisor aprueba o pide cambios solo en las marcas que ve.
create or replace function set_content_status(p_id uuid, p_status content_status, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_role user_role := current_app_role();
  v_from content_status;
begin
  select status into v_from from contents where id = p_id and workspace_id = v_ws and can_see_brand(brand_id) for update;
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

-- ---------- invitaciones ----------
create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%._%'),
  name text not null default '',
  role user_role not null,
  brand_ids uuid[],
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Aceptada', 'Cancelada')),
  invited_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);
create index on invitations (workspace_id, status);
create unique index invitations_one_pending on invitations (workspace_id, email) where status = 'Pendiente';

create table team_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  action text not null,
  by_profile uuid references profiles(id),
  at timestamptz not null default now()
);
create index on team_events (workspace_id, at);

-- Valida que las marcas sean del espacio y que solo un Revisor tenga marcas elegidas. Devuelve null para "todas".
create or replace function clean_brand_ids(p_ws uuid, p_role user_role, p_brand_ids uuid[]) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
begin
  if p_brand_ids is null or cardinality(p_brand_ids) = 0 then return null; end if;
  if p_role <> 'Revisor' then raise exception 'Solo un Revisor puede ver algunas marcas: el resto del equipo ve todas.'; end if;
  if exists (select 1 from unnest(p_brand_ids) b where not exists (select 1 from brands where id = b and workspace_id = p_ws)) then
    raise exception 'Alguna de las marcas no existe.';
  end if;
  return (select array_agg(distinct b) from unnest(p_brand_ids) b);
end $$;

-- Invita a una persona. Si ya había una invitación pendiente para ese email, la reemplaza. Devuelve el código del link.
create or replace function invite_member(p_email text, p_name text, p_role user_role, p_brand_ids uuid[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_brands uuid[];
  v_token text;
begin
  if not is_admin() then raise exception 'Solo el Administrador invita gente.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El email no es válido.'; end if;
  if exists (select 1 from profiles where workspace_id = v_ws and email = v_email) then raise exception 'Esa persona ya es parte del equipo.'; end if;
  v_brands := clean_brand_ids(v_ws, p_role, p_brand_ids);
  update invitations set status = 'Cancelada' where workspace_id = v_ws and email = v_email and status = 'Pendiente';
  insert into invitations (workspace_id, email, name, role, brand_ids, invited_by)
  values (v_ws, v_email, left(trim(coalesce(p_name, '')), 80), p_role, v_brands, auth.uid())
  returning token into v_token;
  insert into team_events (workspace_id, action, by_profile) values (v_ws, format('Invitó a %s como %s', v_email, p_role), auth.uid());
  return v_token;
end $$;

create or replace function cancel_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_email text;
begin
  if not is_admin() then raise exception 'Solo el Administrador maneja las invitaciones.'; end if;
  update invitations set status = 'Cancelada' where id = p_id and workspace_id = v_ws and status = 'Pendiente' returning email into v_email;
  if v_email is null then raise exception 'La invitación no existe o ya no está pendiente.'; end if;
  insert into team_events (workspace_id, action, by_profile) values (v_ws, 'Canceló la invitación de ' || v_email, auth.uid());
end $$;

-- Lo que muestra la pantalla de registro a quien tiene el link (sin sesión). Nada si el link no sirve.
create or replace function invitation_info(p_token text)
returns table (email text, name text, role user_role, workspace text)
language sql stable security definer set search_path = public as $$
  select i.email, i.name, i.role, w.name from invitations i join workspaces w on w.id = i.workspace_id
  where i.token = p_token and i.status = 'Pendiente' and i.expires_at > now()
$$;

-- El usuario logueado toma su invitación pendiente: tiene que ser el dueño del email (confirmado) y no tener perfil.
-- El nombre es el que puso al registrarse (o, si no puso, el de la invitación).
-- Devuelve true si entró a un espacio.
create or replace function accept_invitation() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_inv invitations;
begin
  if v_uid is null then return false; end if;
  if exists (select 1 from profiles where id = v_uid) then return false; end if;
  select lower(email), trim(raw_user_meta_data->>'name') into v_email, v_name from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then return false; end if;
  select * into v_inv from invitations where email = v_email and status = 'Pendiente' and expires_at > now() order by created_at desc limit 1 for update;
  if v_inv.id is null then return false; end if;
  insert into profiles (id, workspace_id, name, role, email, brand_ids)
  values (v_uid, v_inv.workspace_id, left(coalesce(nullif(v_name, ''), nullif(v_inv.name, ''), split_part(v_email, '@', 1)), 80), v_inv.role, v_email, v_inv.brand_ids);
  update invitations set status = 'Aceptada', accepted_at = now() where id = v_inv.id;
  insert into team_events (workspace_id, action, by_profile) values (v_inv.workspace_id, format('%s aceptó la invitación', v_email), v_uid);
  return true;
end $$;

-- Cambia el rol, las marcas o si está activa una persona del equipo. Siempre queda al menos un Administrador activo.
create or replace function update_member(p_id uuid, p_role user_role, p_active boolean, p_brand_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_prev profiles;
begin
  if not is_admin() then raise exception 'Solo el Administrador maneja el equipo.'; end if;
  select * into v_prev from profiles where id = p_id and workspace_id = v_ws for update;
  if v_prev.id is null then raise exception 'Esa persona no es parte del equipo.'; end if;
  if v_prev.role = 'Administrador' and v_prev.active and (p_role <> 'Administrador' or not p_active)
     and not exists (select 1 from profiles where workspace_id = v_ws and role = 'Administrador' and active and id <> p_id) then
    raise exception 'Tiene que quedar al menos un Administrador activo.';
  end if;
  update profiles set role = p_role, active = p_active, brand_ids = clean_brand_ids(v_ws, p_role, p_brand_ids) where id = p_id;
  insert into team_events (workspace_id, action, by_profile) values (v_ws,
    case
      when v_prev.active and not p_active then 'Desactivó a ' || v_prev.name
      when not v_prev.active and p_active then 'Reactivó a ' || v_prev.name
      when v_prev.role <> p_role then format('Cambió a %s de %s a %s', v_prev.name, v_prev.role, p_role)
      else 'Cambió las marcas de ' || v_prev.name
    end, auth.uid());
end $$;

alter table invitations enable row level security;
alter table team_events enable row level security;
revoke all on invitations, team_events from anon;
revoke insert, update, delete on invitations, team_events from authenticated;
create policy invitations_select on invitations for select to authenticated using (workspace_id = current_workspace_id() and is_admin());
create policy team_events_select on team_events for select to authenticated using (workspace_id = current_workspace_id() and is_admin());

revoke execute on function invite_member(text, text, user_role, uuid[]), cancel_invitation(uuid), accept_invitation(),
  update_member(uuid, user_role, boolean, uuid[]), clean_brand_ids(uuid, user_role, uuid[]), invitation_info(text) from public, anon;
grant execute on function invite_member(text, text, user_role, uuid[]), cancel_invitation(uuid), accept_invitation(),
  update_member(uuid, user_role, boolean, uuid[]) to authenticated;
grant execute on function invitation_info(text) to anon, authenticated;

-- ---------- planes y límites de uso ----------
-- Cada espacio tiene un plan con su tope de marcas, de personas (activas más invitaciones pendientes) y de acciones con
-- IA por mes. Los topes se aplican en la base: un trigger frena la marca o la invitación de más, y use_ai cuenta cada
-- acción con IA antes de llamar a Claude (sin cupo, la app usa las reglas y plantillas). El cobro todavía no existe:
-- el plan se cambia a mano desde el SQL Editor.
create table plans (
  id text primary key,
  name text not null,
  max_brands int not null check (max_brands > 0),
  max_members int not null check (max_members > 0),
  ai_per_month int not null check (ai_per_month >= 0),
  sort int not null default 0
);
insert into plans (id, name, max_brands, max_members, ai_per_month, sort) values
  ('prueba', 'Prueba', 1, 2, 30, 1),
  ('emprendedor', 'Emprendedor', 2, 4, 200, 2),
  ('agencia', 'Agencia', 15, 20, 1500, 3);

-- Los espacios que ya existen quedan en Agencia, así nadie pierde marcas ni gente; los nuevos arrancan en Prueba.
alter table workspaces add column plan_id text not null default 'agencia' references plans(id);
alter table workspaces alter column plan_id set default 'prueba';

create table ai_usage (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind text not null check (kind in ('generar', 'adaptar', 'plan', 'investigar', 'analizar')),
  uses int not null default 0,
  primary key (workspace_id, month, kind)
);

create or replace function plan_of(p_ws uuid) returns plans
language sql stable security definer set search_path = public as $$
  select p.* from plans p join workspaces w on w.plan_id = p.id where w.id = p_ws
$$;

create or replace function check_brand_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan plans := plan_of(new.workspace_id);
begin
  if (select count(*) from brands where workspace_id = new.workspace_id) >= v_plan.max_brands then
    raise exception 'Tu plan % permite % marca%. Para sumar otra, pasate a un plan más grande.', v_plan.name, v_plan.max_brands, case when v_plan.max_brands = 1 then '' else 's' end;
  end if;
  return new;
end $$;
create trigger brands_limit before insert on brands for each row execute function check_brand_limit();

create or replace function check_member_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan plans := plan_of(new.workspace_id);
begin
  if (select count(*) from profiles where workspace_id = new.workspace_id and active)
     + (select count(*) from invitations where workspace_id = new.workspace_id and status = 'Pendiente' and expires_at > now()) >= v_plan.max_members then
    raise exception 'Tu plan % permite % personas en el equipo, contando las invitaciones pendientes.', v_plan.name, v_plan.max_members;
  end if;
  return new;
end $$;
-- invite_member cancela antes la invitación pendiente del mismo email, así reenviar no cuenta doble.
create trigger invitations_limit before insert on invitations for each row execute function check_member_limit();

-- Reactivar a alguien también ocupa un lugar.
create or replace function check_reactivation_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan plans := plan_of(new.workspace_id);
begin
  if new.active and not old.active
     and (select count(*) from profiles where workspace_id = new.workspace_id and active)
       + (select count(*) from invitations where workspace_id = new.workspace_id and status = 'Pendiente' and expires_at > now()) >= v_plan.max_members then
    raise exception 'Tu plan % permite % personas en el equipo: para reactivarla, desactivá a otra o cancelá una invitación.', v_plan.name, v_plan.max_members;
  end if;
  return new;
end $$;
create trigger profiles_reactivation_limit before update of active on profiles for each row execute function check_reactivation_limit();

-- Cuenta una acción con IA del mes (día de Argentina). Devuelve false si el plan ya no tiene cupo: no cuenta nada.
create or replace function use_ai(p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_month text := to_char(dia_ar(now()), 'YYYY-MM');
begin
  if v_ws is null then raise exception 'Necesitás entrar a un espacio de trabajo.'; end if;
  if p_kind not in ('generar', 'adaptar', 'plan', 'investigar', 'analizar') then raise exception 'Acción con IA desconocida.'; end if;
  perform 1 from workspaces where id = v_ws for update; -- dos pedidos a la vez no se pasan del tope
  if coalesce((select sum(uses) from ai_usage where workspace_id = v_ws and month = v_month), 0) >= (plan_of(v_ws)).ai_per_month then
    return false;
  end if;
  insert into ai_usage (workspace_id, month, kind, uses) values (v_ws, v_month, p_kind, 1)
  on conflict (workspace_id, month, kind) do update set uses = ai_usage.uses + 1;
  return true;
end $$;

-- Lo que muestra la pantalla: plan, topes y uso del mes.
create or replace function plan_usage()
returns table (plan text, plan_name text, max_brands int, brands int, max_members int, members int, ai_per_month int, ai_used int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.max_brands, (select count(*)::int from brands b where b.workspace_id = w.id),
    p.max_members,
    (select count(*)::int from profiles pr where pr.workspace_id = w.id and pr.active)
      + (select count(*)::int from invitations i where i.workspace_id = w.id and i.status = 'Pendiente' and i.expires_at > now()),
    p.ai_per_month, coalesce((select sum(uses)::int from ai_usage u where u.workspace_id = w.id and u.month = to_char(dia_ar(now()), 'YYYY-MM')), 0)
  from workspaces w join plans p on p.id = w.plan_id
  where w.id = current_workspace_id()
$$;

-- ---------- registro propio ----------
-- Quien se registra sin invitación crea su propio espacio (con el nombre de su negocio) y queda como Administrador,
-- en el plan Prueba. Solo con el email confirmado y si no tiene perfil ni una invitación pendiente.
create or replace function create_own_workspace() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_business text;
  v_ws uuid;
begin
  if v_uid is null then return false; end if;
  if exists (select 1 from profiles where id = v_uid) then return false; end if;
  select lower(email), trim(raw_user_meta_data->>'name'), trim(raw_user_meta_data->>'workspace')
  into v_email, v_name, v_business from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null or coalesce(v_business, '') = '' then return false; end if;
  if exists (select 1 from invitations where email = v_email and status = 'Pendiente' and expires_at > now()) then return false; end if;
  insert into workspaces (name, plan_id) values (left(v_business, 80), 'prueba') returning id into v_ws;
  insert into profiles (id, workspace_id, name, role, email)
  values (v_uid, v_ws, left(coalesce(nullif(v_name, ''), split_part(v_email, '@', 1)), 80), 'Administrador', v_email);
  insert into team_events (workspace_id, action, by_profile) values (v_ws, 'Creó el espacio de trabajo', v_uid);
  return true;
end $$;

alter table plans enable row level security;
alter table ai_usage enable row level security;
revoke all on plans, ai_usage from anon;
revoke insert, update, delete on plans, ai_usage from authenticated;
create policy plans_select on plans for select to authenticated using (true);
create policy ai_usage_select on ai_usage for select to authenticated using (workspace_id = current_workspace_id());

revoke execute on function use_ai(text), plan_usage(), create_own_workspace(), plan_of(uuid),
  check_brand_limit(), check_member_limit(), check_reactivation_limit() from public, anon;
grant execute on function use_ai(text), plan_usage(), create_own_workspace() to authenticated;

-- ======================================================================
-- 20261021000000_redes_archivos.sql
-- ======================================================================
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

-- ---------- registro de migraciones ----------
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261013000000', 'esquema_base') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261014000000', 'calendario') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261015000000', 'campanas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261016000000', 'metricas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261017000000', 'investigacion') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261018000000', 'plan_mensual') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261019000000', 'acciones_piezas') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261020000000', 'equipo') on conflict do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261021000000', 'redes_archivos') on conflict do nothing;
