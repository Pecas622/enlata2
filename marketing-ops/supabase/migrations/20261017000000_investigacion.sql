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
