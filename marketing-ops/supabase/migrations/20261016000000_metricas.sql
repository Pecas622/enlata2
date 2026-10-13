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
