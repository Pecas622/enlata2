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
