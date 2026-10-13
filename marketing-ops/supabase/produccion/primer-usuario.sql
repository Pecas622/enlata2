-- MARKETING OPS · primer espacio de trabajo y su Administrador.
-- 1. En Supabase: Authentication > Users > Add user > Create new user (email y contraseña, con "Auto Confirm User").
-- 2. Cambiá los tres valores de abajo y corré este archivo en SQL Editor.
-- Para sumar más personas al mismo espacio, creá el usuario igual y corré solo el segundo insert con su email,
-- su nombre y su rol ('Administrador', 'Creador' o 'Revisor').

do $$
declare
  v_email text := 'vos@tuempresa.com';      -- el email del usuario que creaste
  v_nombre text := 'Tu nombre';
  v_espacio text := 'Nombre de la empresa o agencia';
  v_user uuid;
  v_ws uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then raise exception 'No existe el usuario %: crealo primero en Authentication > Users.', v_email; end if;
  if exists (select 1 from profiles where id = v_user) then raise exception 'El usuario % ya tiene perfil.', v_email; end if;
  insert into workspaces (name) values (v_espacio) returning id into v_ws;
  insert into profiles (id, workspace_id, name, role) values (v_user, v_ws, v_nombre, 'Administrador');
  raise notice 'Listo: % es Administrador de "%".', v_email, v_espacio;
end $$;

-- Sumar otra persona a un espacio que ya existe (descomentá y completá):
-- insert into profiles (id, workspace_id, name, role)
-- select u.id, (select workspace_id from profiles p join auth.users a on a.id = p.id where lower(a.email) = lower('vos@tuempresa.com')), 'Lucía', 'Creador'
-- from auth.users u where lower(u.email) = lower('lucia@tuempresa.com');
