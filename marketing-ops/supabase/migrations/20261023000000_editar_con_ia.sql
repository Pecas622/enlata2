-- Etapa 10: editar con IA. La IA (o las reglas, sin clave o sin cupo) propone una versión del texto de la pieza;
-- se aplica con save_content como cualquier edición, y el historial dice que salió de "Editar con IA" y con qué pedido.

-- Una acción con IA más: "editar".
alter table ai_usage drop constraint ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('generar', 'adaptar', 'editar', 'plan', 'investigar', 'analizar'));

create or replace function use_ai(p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_month text := to_char(dia_ar(now()), 'YYYY-MM');
begin
  if v_ws is null then raise exception 'Necesitás entrar a un espacio de trabajo.'; end if;
  if p_kind not in ('generar', 'adaptar', 'editar', 'plan', 'investigar', 'analizar') then raise exception 'Acción con IA desconocida.'; end if;
  perform 1 from workspaces where id = v_ws for update; -- dos pedidos a la vez no se pasan del tope
  if coalesce((select sum(uses) from ai_usage where workspace_id = v_ws and month = v_month), 0) >= (plan_of(v_ws)).ai_per_month then
    return false;
  end if;
  insert into ai_usage (workspace_id, month, kind, uses) values (v_ws, v_month, p_kind, 1)
  on conflict (workspace_id, month, kind) do update set uses = ai_usage.uses + 1;
  return true;
end $$;

-- save_content igual que antes; con p.edited_with ('ia' o 'reglas') el registro dice "Editada con IA" o
-- "Editada automáticamente", con el pedido como nota.
create or replace function save_content(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
  v_status content_status;
  v_source content_source := coalesce(nullif(p->>'source', ''), 'manual')::content_source;
  v_with text := coalesce(p->>'edited_with', '');
  v_action text;
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
    v_action := case v_with when 'ia' then 'Editada con IA' when 'reglas' then 'Editada automáticamente' else 'Editada' end;
    insert into content_events (workspace_id, content_id, action, note, by_profile)
    values (v_ws, p_id, v_action || case when v_status = 'Aprobado' then ' (vuelve a borrador)' else '' end,
      case when v_with in ('ia', 'reglas') then left(coalesce(p->>'edit_note', ''), 300) else '' end, auth.uid());
  end if;
  return coalesce(v_id, p_id);
end $$;
