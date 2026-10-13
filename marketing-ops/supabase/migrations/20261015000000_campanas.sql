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
