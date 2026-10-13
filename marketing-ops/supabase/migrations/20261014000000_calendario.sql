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
