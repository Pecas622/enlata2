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
