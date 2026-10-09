-- Actualización para pegar en SQL Editor: precios nuevos con IMEI y alertas en la base (migración 20261009000000_precios_base).
-- Pegala después de actualizacion-facturacion.sql.

-- Precios nuevos: la base pasa a $45.900 e incluye stock con IMEI y alertas con dólar automático.
-- Reportes sube a $6.900. IMEI y alertas quedan en plan_prices con precio 0: ya no se venden aparte.
-- Solo cambia lo que pagan los locales nuevos; las suscripciones que ya existen siguen igual.
update plan_prices set price_ars = 45900 where item = 'base';
update plan_prices set price_ars = 6900 where item = 'reportes';
update plan_prices set price_ars = 0 where item in ('imei', 'alertas');

-- Alta desde la web: el local nace con lo que trae la base (IMEI y alertas) y pendiente de pago.
create or replace function crear_local_pendiente(p_name text, p_slug text, p_admin uuid, p_admin_name text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_store uuid;
begin
  v_store := crear_local(p_name, p_slug, p_admin, p_admin_name, p_pin);
  update stores set modules = '{imei,alertas}', billing_status = 'pendiente' where id = v_store;
  return v_store;
end $$;

revoke execute on function crear_local_pendiente from public, anon, authenticated;
grant execute on function crear_local_pendiente to service_role;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261009000000', 'precios_base') on conflict do nothing;
