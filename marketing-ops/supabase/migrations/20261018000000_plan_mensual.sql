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
