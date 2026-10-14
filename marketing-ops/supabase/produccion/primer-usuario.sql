-- MARKETING OPS · primer espacio de trabajo y su Administrador.
-- 1. En Supabase: Authentication > Users > Add user > Create new user (email y contraseña, con "Auto Confirm User").
-- 2. Cambiá los tres valores de abajo y corré este archivo en SQL Editor.

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
  insert into profiles (id, workspace_id, name, role, email) values (v_user, v_ws, v_nombre, 'Administrador', lower(v_email));
  raise notice 'Listo: % es Administrador de "%".', v_email, v_espacio;
end $$;

-- Para sumar más personas no hace falta SQL: el Administrador las invita desde Equipo, en la app.
