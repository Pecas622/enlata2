-- Etapa 11: editar video con IA. La IA mira fotogramas y arma el plan de edición; el video se arma en el navegador
-- y se guarda como un archivo más de la pieza (add_media). Acá solo se suma la acción con IA "video".

alter table ai_usage drop constraint ai_usage_kind_check;
alter table ai_usage add constraint ai_usage_kind_check check (kind in ('generar', 'adaptar', 'editar', 'video', 'plan', 'investigar', 'analizar'));

create or replace function use_ai(p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_month text := to_char(dia_ar(now()), 'YYYY-MM');
begin
  if v_ws is null then raise exception 'Necesitás entrar a un espacio de trabajo.'; end if;
  if p_kind not in ('generar', 'adaptar', 'editar', 'video', 'plan', 'investigar', 'analizar') then raise exception 'Acción con IA desconocida.'; end if;
  perform 1 from workspaces where id = v_ws for update; -- dos pedidos a la vez no se pasan del tope
  if coalesce((select sum(uses) from ai_usage where workspace_id = v_ws and month = v_month), 0) >= (plan_of(v_ws)).ai_per_month then
    return false;
  end if;
  insert into ai_usage (workspace_id, month, kind, uses) values (v_ws, v_month, p_kind, 1)
  on conflict (workspace_id, month, kind) do update set uses = ai_usage.uses + 1;
  return true;
end $$;
