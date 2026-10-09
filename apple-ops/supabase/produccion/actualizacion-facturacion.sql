-- Actualización para pegar en SQL Editor: facturación electrónica con ARCA (migración 20261008020000_facturacion).
-- Pegala después de actualizacion-suscripciones.sql.

-- APPLE OPS · módulo de facturación electrónica con ARCA (web service WSFEv1).
-- Con el módulo y los datos fiscales cargados, cada venta sale con su factura (A, B o C según el
-- emisor y el cliente) y anular una venta facturada emite la nota de crédito. Lo fiscal lo resuelve
-- el servidor: pide el CAE a ARCA con el certificado del local y guarda el resultado con la clave de
-- servicio. Desde la app nadie puede escribir una factura ni leer el certificado o su clave privada.

-- ---------- módulo y precio ----------
alter table stores drop constraint if exists stores_modules_check;
alter table stores add constraint stores_modules_check
  check (modules <@ array['imei', 'reportes', 'catalogo', 'asistente', 'alertas', 'facturacion']);
-- Como los demás módulos: un local creado por Enlata2 arranca con todo; el alta online, sin nada.
alter table stores alter column modules set default array['imei', 'reportes', 'catalogo', 'asistente', 'alertas', 'facturacion'];

alter table plan_prices drop constraint if exists plan_prices_item_check;
alter table plan_prices add constraint plan_prices_item_check
  check (item in ('base', 'imei', 'reportes', 'catalogo', 'asistente', 'alertas', 'facturacion'));
insert into plan_prices (item, price_ars) values ('facturacion', 9900) on conflict (item) do nothing;

alter table subscriptions drop constraint if exists subscriptions_item_check;
alter table subscriptions add constraint subscriptions_item_check
  check (item in ('base', 'imei', 'reportes', 'catalogo', 'asistente', 'alertas', 'facturacion'));

create or replace function set_modulos(p_slug text, p_modules text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_all text[] := array['imei', 'reportes', 'catalogo', 'asistente', 'alertas', 'facturacion'];
  v_store uuid;
  v_old text[];
  v_new text[];
  v_bad text[];
begin
  select store_id into v_store from catalog_settings where slug = lower(trim(coalesce(p_slug, '')));
  if v_store is null then raise exception 'No hay ningún local con el link %.', p_slug using errcode = '22023'; end if;
  select array_agg(distinct m) into v_bad from unnest(coalesce(p_modules, '{}')) m where m <> all (v_all);
  if v_bad is not null then
    raise exception 'Módulo desconocido: %. Los módulos son: %.', array_to_string(v_bad, ', '), array_to_string(v_all, ', ') using errcode = '22023';
  end if;
  -- Mismo orden siempre, sin repetidos. El asistente vive en el catálogo: sin catálogo no hay asistente.
  select coalesce(array_agg(m order by array_position(v_all, m)), '{}') into v_new
  from (select distinct m from unnest(coalesce(p_modules, '{}')) m) x
  where m <> 'asistente' or 'catalogo' = any(p_modules);

  select modules into v_old from stores where id = v_store for update;
  -- Sin el módulo de alertas la cotización vuelve a ser manual (queda el último valor).
  update stores set modules = v_new,
    fx_source = case when 'alertas' = any(v_new) then fx_source else 'manual' end
  where id = v_store;
  if v_old is distinct from v_new then
    insert into audit_log (store_id, profile_id, user_name, action, detail)
    values (v_store, null, 'Enlata2', 'Configuración',
      format('módulos: %s → %s', coalesce(nullif(array_to_string(v_old, ', '), ''), 'solo base'), coalesce(nullif(array_to_string(v_new, ', '), ''), 'solo base')));
  end if;
  return v_new;
end $$;

create or replace function aplicar_suscripcion(p_preapproval text, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  sub subscriptions%rowtype;
  s stores%rowtype;
  v_all text[] := array['imei', 'reportes', 'catalogo', 'asistente', 'alertas', 'facturacion'];
  v_mods text[];
  v_names jsonb := '{"base": "plan base", "imei": "stock con IMEI", "reportes": "reportes", "catalogo": "catálogo online", "asistente": "asistente de chat", "alertas": "alertas y dólar automático", "facturacion": "facturación electrónica"}';
begin
  if p_status not in ('pendiente', 'activa', 'pausada', 'cancelada') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  select * into sub from subscriptions where mp_preapproval_id = p_preapproval for update;
  if not found or sub.status = p_status then return false; end if;
  update subscriptions set status = p_status, updated_at = now() where id = sub.id;
  select * into s from stores where id = sub.store_id for update;

  if sub.item = 'base' then
    update stores set billing_status = case
      when p_status = 'activa' then 'activo'
      when p_status in ('pausada', 'cancelada') and s.billing_status = 'activo' then 'suspendido'
      else s.billing_status end
    where id = s.id;
  else
    v_mods := case when p_status = 'activa' then array_append(array_remove(s.modules, sub.item), sub.item)
                   when p_status in ('pausada', 'cancelada') then array_remove(s.modules, sub.item)
                   else s.modules end;
    -- Si el asistente ya estaba pago, vuelve junto con el catálogo.
    if p_status = 'activa' and sub.item = 'catalogo' and exists (
      select 1 from subscriptions where store_id = s.id and item = 'asistente' and status = 'activa') then
      v_mods := array_append(array_remove(v_mods, 'asistente'), 'asistente');
    end if;
    select coalesce(array_agg(m order by array_position(v_all, m)), '{}') into v_mods
    from unnest(v_mods) m
    where m = any(v_all) and (m <> 'asistente' or 'catalogo' = any(v_mods));
    update stores set modules = v_mods,
      fx_source = case when 'alertas' = any(v_mods) then fx_source else 'manual' end
    where id = s.id;
  end if;

  insert into audit_log (store_id, profile_id, user_name, action, detail)
  values (s.id, null, 'Mercado Pago', 'Configuración', format('%s: suscripción %s', v_names ->> sub.item, p_status));
  return true;
end $$;

-- ---------- datos fiscales del local ----------
-- Lo que va impreso en la factura. No tiene nada secreto: lo leen todos los usuarios del local.
create table if not exists fiscal_settings (
  store_id uuid primary key references stores(id) on delete cascade,
  razon_social text not null default '',
  condicion_iva text not null default 'Monotributo' check (condicion_iva in ('Responsable Inscripto', 'Monotributo')),
  iibb text not null default '',
  inicio_actividades date,
  punto_venta int not null default 1 check (punto_venta between 1 and 99998),
  alicuota_iva numeric(4,1) not null default 21 check (alicuota_iva in (10.5, 21, 27)),
  ambiente text not null default 'homologacion' check (ambiente in ('homologacion', 'produccion')),
  automatica boolean not null default true,
  cert_alias text not null default '',
  cert_vence timestamptz,
  csr_pem text not null default '',
  updated_at timestamptz not null default now()
);
alter table fiscal_settings enable row level security;
drop policy if exists fiscal_settings_read on fiscal_settings;
create policy fiscal_settings_read on fiscal_settings for select to authenticated using (store_id = current_store_id());
revoke all on fiscal_settings from public, anon, authenticated;
grant select on fiscal_settings to authenticated;

-- Certificado, clave privada (cifrada por el servidor) y el ticket de acceso de ARCA. Sin políticas
-- ni permisos: solo la clave de servicio la lee y la escribe.
create table if not exists fiscal_credentials (
  store_id uuid primary key references stores(id) on delete cascade,
  key_enc text not null default '',
  cert_pem text not null default '',
  token text not null default '',
  sign text not null default '',
  token_vence timestamptz,
  updated_at timestamptz not null default now()
);
alter table fiscal_credentials enable row level security;
revoke all on fiscal_credentials from public, anon, authenticated;

-- El Administrador guarda los datos que van en la factura. El certificado se carga por el servidor.
create or replace function guardar_datos_fiscales(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_cuit text := regexp_replace(coalesce(p ->> 'cuit', ''), '\D', '', 'g');
begin
  if not is_admin() then raise exception 'Solo el Administrador cambia los datos fiscales.' using errcode = '42501'; end if;
  if not tiene_modulo(v_store, 'facturacion') then raise exception 'El local no tiene el módulo de facturación.' using errcode = '42501'; end if;
  if coalesce(trim(p ->> 'razon_social'), '') = '' then raise exception 'Cargá la razón social.' using errcode = '22023'; end if;
  if v_cuit !~ '^\d{11}$' then raise exception 'Ingresá un CUIT de 11 dígitos.' using errcode = '22023'; end if;
  if coalesce((p ->> 'punto_venta')::int, 0) not between 1 and 99998 then raise exception 'Ingresá el punto de venta habilitado para web services.' using errcode = '22023'; end if;
  update stores set cuit = v_cuit where id = v_store;
  insert into fiscal_settings (store_id, razon_social, condicion_iva, iibb, inicio_actividades, punto_venta, alicuota_iva, ambiente, automatica, updated_at)
  values (v_store, trim(p ->> 'razon_social'), p ->> 'condicion_iva', coalesce(trim(p ->> 'iibb'), ''), nullif(p ->> 'inicio_actividades', '')::date,
          (p ->> 'punto_venta')::int, coalesce((p ->> 'alicuota_iva')::numeric, 21), coalesce(p ->> 'ambiente', 'homologacion'),
          coalesce((p ->> 'automatica')::boolean, true), now())
  on conflict (store_id) do update set
    razon_social = excluded.razon_social, condicion_iva = excluded.condicion_iva, iibb = excluded.iibb,
    inicio_actividades = excluded.inicio_actividades, punto_venta = excluded.punto_venta, alicuota_iva = excluded.alicuota_iva,
    ambiente = excluded.ambiente, automatica = excluded.automatica, updated_at = now();
  perform log_event('Configuración', format('datos fiscales: %s, %s, punto de venta %s, %s',
    trim(p ->> 'razon_social'), p ->> 'condicion_iva', p ->> 'punto_venta', coalesce(p ->> 'ambiente', 'homologacion')));
end $$;
revoke execute on function guardar_datos_fiscales from public, anon;
grant execute on function guardar_datos_fiscales to authenticated;

-- ---------- facturas y notas de crédito ----------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  sale_id uuid not null references sales(id) on delete cascade,
  kind text not null check (kind in ('Factura', 'Nota de crédito')),
  letra text not null check (letra in ('A', 'B', 'C')),
  cbte_tipo int not null,
  punto_venta int not null,
  numero bigint,
  fecha date,
  ambiente text not null,
  doc_tipo int not null,
  doc_nro text not null,
  receptor_nombre text not null default '',
  receptor_condicion int not null,
  neto numeric(14,2) not null,
  iva numeric(14,2) not null,
  total numeric(14,2) not null check (total > 0),
  alicuota_iva numeric(4,1) not null,
  cae text not null default '',
  cae_vence date,
  status text not null default 'Pendiente' check (status in ('Pendiente', 'Emitida', 'Rechazada')),
  error text not null default '',
  attempts int not null default 0,
  asociada_id uuid references invoices(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  emitted_at timestamptz,
  unique (sale_id, kind)
);
create unique index if not exists invoices_numero on invoices (store_id, ambiente, punto_venta, cbte_tipo, numero) where numero is not null;
create index if not exists invoices_store on invoices (store_id, created_at desc);
alter table invoices enable row level security;
drop policy if exists invoices_read on invoices;
create policy invoices_read on invoices for select to authenticated using (store_id = current_store_id());
revoke all on invoices from public, anon, authenticated;
grant select on invoices to authenticated;

-- Deja lista la factura (o la nota de crédito) de una venta para pedir el CAE. Si ya existe y no
-- salió, la actualiza para reintentar; si ya salió, la devuelve como está. Solo el servidor.
create or replace function factura_preparar(p_sale uuid, p_kind text, p_user uuid, p jsonb) returns invoices
language plpgsql security definer set search_path = public as $$
declare
  v_sale sales%rowtype;
  v_inv invoices%rowtype;
begin
  select * into v_sale from sales where id = p_sale;
  if not found then raise exception 'No existe la venta.' using errcode = '22023'; end if;
  if not tiene_modulo(v_sale.store_id, 'facturacion') then raise exception 'El local no tiene el módulo de facturación.' using errcode = '42501'; end if;
  if p_kind = 'Factura' and v_sale.status <> 'Cerrada' then raise exception 'La venta está anulada.' using errcode = '22023'; end if;
  if p_kind = 'Nota de crédito' and not exists (select 1 from invoices where sale_id = p_sale and kind = 'Factura' and status = 'Emitida') then
    raise exception 'La venta no tiene factura emitida.' using errcode = '22023';
  end if;

  select * into v_inv from invoices where sale_id = p_sale and kind = p_kind for update;
  -- Ya salió, o quedó a mitad de camino con un número pedido: se devuelve igual para confirmarlo con ARCA.
  if found and (v_inv.status = 'Emitida' or v_inv.numero is not null) then return v_inv; end if;
  if found then
    update invoices set letra = p ->> 'letra', cbte_tipo = (p ->> 'cbte_tipo')::int, punto_venta = (p ->> 'punto_venta')::int,
      ambiente = p ->> 'ambiente', doc_tipo = (p ->> 'doc_tipo')::int, doc_nro = p ->> 'doc_nro', receptor_nombre = coalesce(p ->> 'receptor_nombre', ''),
      receptor_condicion = (p ->> 'receptor_condicion')::int, neto = (p ->> 'neto')::numeric, iva = (p ->> 'iva')::numeric,
      total = (p ->> 'total')::numeric, alicuota_iva = (p ->> 'alicuota_iva')::numeric, asociada_id = nullif(p ->> 'asociada_id', '')::uuid,
      status = 'Pendiente', error = ''
    where id = v_inv.id returning * into v_inv;
    return v_inv;
  end if;
  insert into invoices (store_id, sale_id, kind, letra, cbte_tipo, punto_venta, ambiente, doc_tipo, doc_nro, receptor_nombre, receptor_condicion,
                        neto, iva, total, alicuota_iva, asociada_id, created_by)
  values (v_sale.store_id, p_sale, p_kind, p ->> 'letra', (p ->> 'cbte_tipo')::int, (p ->> 'punto_venta')::int, p ->> 'ambiente',
          (p ->> 'doc_tipo')::int, p ->> 'doc_nro', coalesce(p ->> 'receptor_nombre', ''), (p ->> 'receptor_condicion')::int,
          (p ->> 'neto')::numeric, (p ->> 'iva')::numeric, (p ->> 'total')::numeric, (p ->> 'alicuota_iva')::numeric,
          nullif(p ->> 'asociada_id', '')::uuid, p_user)
  returning * into v_inv;
  return v_inv;
end $$;

-- Anota el número que se le va a pedir a ARCA antes de pedirlo: si la respuesta no llega, el
-- reintento consulta ese número en ARCA en vez de pedir otro.
create or replace function factura_intento(p_id uuid, p_numero bigint, p_fecha date) returns void
language sql security definer set search_path = public as $$
  update invoices set numero = p_numero, fecha = p_fecha where id = p_id and status <> 'Emitida';
$$;

-- Guarda lo que respondió ARCA y lo deja en el historial con el usuario que la pidió.
create or replace function factura_resultado(p_id uuid, p_status text, p_numero bigint, p_fecha date, p_cae text, p_cae_vence date, p_error text, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices%rowtype;
  v_number text;
  v_name text;
begin
  if p_status not in ('Pendiente', 'Emitida', 'Rechazada') then raise exception 'Estado inválido.' using errcode = '22023'; end if;
  if p_status = 'Emitida' and (coalesce(p_cae, '') = '' or p_numero is null) then raise exception 'Falta el CAE.' using errcode = '22023'; end if;
  update invoices set status = p_status,
    numero = case when p_status = 'Rechazada' then null else coalesce(p_numero, numero) end,
    fecha = case when p_status = 'Rechazada' then null else coalesce(p_fecha, fecha) end,
    cae = coalesce(p_cae, ''), cae_vence = p_cae_vence, error = coalesce(p_error, ''), attempts = attempts + 1,
    emitted_at = case when p_status = 'Emitida' then now() else emitted_at end
  where id = p_id and status <> 'Emitida' returning * into v_inv;
  if not found then return; end if;
  select number into v_number from sales where id = v_inv.sale_id;
  select name into v_name from profiles where id = p_user;
  insert into audit_log (store_id, profile_id, user_name, action, detail)
  values (v_inv.store_id, p_user, coalesce(v_name, 'Sistema'), 'Facturación',
    case when p_status = 'Emitida'
      then format('%s %s %s-%s de la venta %s, CAE %s', v_inv.kind, v_inv.letra, lpad(v_inv.punto_venta::text, 5, '0'), lpad(p_numero::text, 8, '0'), v_number, p_cae)
      else format('%s de la venta %s: %s', v_inv.kind, v_number, coalesce(nullif(p_error, ''), lower(p_status))) end);
end $$;

revoke execute on function factura_preparar, factura_intento, factura_resultado from public, anon, authenticated;
grant execute on function factura_preparar, factura_intento, factura_resultado to service_role;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20261008020000', 'facturacion') on conflict do nothing;
