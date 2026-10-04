-- APPLE OPS · esquema base (etapa 1)
-- Todas las tablas llevan store_id. Los permisos se aplican con RLS según el rol del usuario.
-- Los costos viven en tablas aparte (device_costs, accessory_costs, sale_line_costs) que solo leen
-- Administrador y Encargado, así ningún otro rol puede verlos aunque consulte la base directo.

create extension if not exists pgcrypto;

-- ---------- tipos ----------
create type user_role as enum ('Administrador', 'Encargado', 'Vendedor', 'Cajero');
create type device_kind as enum ('iPhone', 'iPad', 'Mac', 'Watch', 'AirPods');
create type device_condition as enum ('Nuevo sellado', 'Usado A', 'Usado B', 'Reacondicionado');
create type device_status as enum ('Disponible', 'Reservado', 'En reparación', 'Vendido', 'Retirado');
create type device_origin as enum ('Proveedor', 'Compra a particular', 'Canje');
create type currency as enum ('USD', 'ARS');
create type pay_method as enum ('Efectivo USD', 'Efectivo ARS', 'Transferencia ARS', 'Tarjeta', 'Mercado Pago');
create type move_type as enum ('Ingreso', 'Egreso');
create type sale_status as enum ('Cerrada', 'Anulada');
create type shift_status as enum ('Abierta', 'Cerrada');
create type line_kind as enum ('device', 'acc');
create type acc_category as enum ('Fundas', 'Vidrios', 'Cargadores', 'Cables', 'Auriculares', 'Soportes', 'Otros');

-- ---------- local y configuración ----------
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cuit text not null default '',
  address text not null default '',
  phone text not null default '',
  fx numeric(12,2) not null default 1200 check (fx > 0),
  target_margin numeric(5,4) not null default 0.12,
  max_discount_seller numeric(5,2) not null default 5,
  warranty_new_days int not null default 365,
  warranty_used_days int not null default 90,
  cond_mult jsonb not null default '{"Usado A": 1, "Usado B": 0.9, "Reacondicionado": 0.85}',
  defect_costs jsonb not null default '{}',
  timezone text not null default 'America/Argentina/Mendoza',
  created_at timestamptz not null default now()
);

create table trade_in_values (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  model text not null,
  capacity int not null default 0,
  value_usd numeric(12,2) not null check (value_usd >= 0),
  unique (store_id, model, capacity)
);

-- Numeración V-0001, I-0001, T-001 por local, sin contar filas.
create table store_counters (
  store_id uuid not null references stores(id) on delete cascade,
  kind text not null check (kind in ('V', 'I', 'T')),
  last_value int not null default 0,
  primary key (store_id, kind)
);

-- ---------- usuarios ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  role user_role not null,
  active boolean not null default true,
  commission_pct numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);
create index on profiles (store_id);

-- PIN de mostrador, separado del perfil: ninguna política lo expone.
create table profile_pins (
  profile_id uuid primary key references profiles(id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz
);

-- ---------- helpers de sesión ----------
create or replace function current_store_id() returns uuid
language sql stable security definer set search_path = public as $$
  select store_id from profiles where id = auth.uid() and active
$$;

create or replace function current_app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() in ('Administrador', 'Encargado'), false)
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() = 'Administrador', false)
$$;

-- Día local de Argentina para reportes y cierres, nunca UTC pelado.
create or replace function dia_ar(ts timestamptz) returns date
language sql immutable as $$
  select (ts at time zone 'America/Argentina/Mendoza')::date
$$;

create or replace function next_number(p_store uuid, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into store_counters (store_id, kind, last_value) values (p_store, p_kind, 1)
  on conflict (store_id, kind) do update set last_value = store_counters.last_value + 1
  returning last_value into v;
  return p_kind || '-' || lpad(v::text, case when p_kind = 'T' then 3 else 4 end, '0');
end $$;
revoke execute on function next_number(uuid, text) from public, anon, authenticated;

-- ---------- equipos ----------
create table devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  kind device_kind not null,
  model text not null,
  capacity int not null default 0,
  color text not null default '',
  condition device_condition not null,
  imei text not null,
  battery int check (battery between 0 and 100),
  price_usd numeric(12,2) not null check (price_usd >= 0),
  status device_status not null default 'Disponible',
  origin device_origin not null,
  entry_date date not null default dia_ar(now()),
  warranty_days int not null default 90,
  notes text not null default '',
  sold_sale_id uuid,
  created_at timestamptz not null default now()
);
create index on devices (store_id, status);
-- Un IMEI no puede estar dos veces en stock; sí puede reingresar si el anterior se vendió o retiró.
create unique index devices_imei_en_stock on devices (store_id, imei) where status not in ('Vendido', 'Retirado');

create table device_costs (
  device_id uuid primary key references devices(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  cost_usd numeric(12,2) not null check (cost_usd >= 0)
);

create table device_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  action text not null,
  by_profile uuid references profiles(id),
  at timestamptz not null default now()
);
create index on device_events (device_id, at);

-- ---------- accesorios ----------
create table accessories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  sku text not null,
  name text not null,
  category acc_category not null,
  price_ars numeric(12,2) not null check (price_ars >= 0),
  stock int not null default 0 check (stock >= 0),
  min_stock int not null default 0,
  supplier text not null default '',
  unique (store_id, sku)
);

create table accessory_costs (
  accessory_id uuid primary key references accessories(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  cost_ars numeric(12,2) not null check (cost_ars >= 0)
);

create table accessory_moves (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  accessory_id uuid not null references accessories(id) on delete cascade,
  qty int not null,
  note text not null default '',
  by_profile uuid references profiles(id),
  at timestamptz not null default now()
);

-- ---------- clientes ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  phone text not null default '',
  dni text not null default '',
  email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index on clients (store_id, name);

-- ---------- caja ----------
create table cash_shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  number text not null,
  status shift_status not null default 'Abierta',
  opened_at timestamptz not null default now(),
  opened_by uuid not null references profiles(id),
  opening_ars numeric(14,2) not null default 0,
  opening_usd numeric(12,2) not null default 0,
  closed_at timestamptz,
  closed_by uuid references profiles(id),
  expected_ars numeric(14,2),
  expected_usd numeric(12,2),
  counted_ars numeric(14,2),
  counted_usd numeric(12,2),
  diff_ars numeric(14,2),
  diff_usd numeric(12,2),
  note text not null default '',
  breakdown jsonb,
  unique (store_id, number)
);
-- Una sola caja abierta por local.
create unique index cash_shifts_una_abierta on cash_shifts (store_id) where status = 'Abierta';

-- ---------- ventas ----------
create table sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  number text not null,
  at timestamptz not null default now(),
  shift_id uuid references cash_shifts(id),
  client_id uuid references clients(id),
  client_name text not null default 'Consumidor final',
  seller_id uuid references profiles(id),
  cashier_id uuid references profiles(id),
  discount_pct numeric(5,2) not null default 0,
  fx numeric(12,2) not null,
  subtotal_usd numeric(12,2) not null,
  discount_usd numeric(12,2) not null default 0,
  total_usd numeric(12,2) not null,
  trade_in_usd numeric(12,2) not null default 0,
  paid_usd numeric(12,2) not null default 0,
  status sale_status not null default 'Cerrada',
  void_reason text,
  voided_by uuid references profiles(id),
  voided_at timestamptz,
  notes text not null default '',
  unique (store_id, number)
);
create index on sales (store_id, at);
alter table devices add constraint devices_sold_sale_fk foreign key (sold_sale_id) references sales(id);

create table sale_lines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  sale_id uuid not null references sales(id) on delete cascade,
  kind line_kind not null,
  device_id uuid references devices(id),
  accessory_id uuid references accessories(id),
  description text not null,
  qty int not null default 1 check (qty > 0),
  unit_price numeric(14,2) not null,
  currency currency not null,
  check ((kind = 'device' and device_id is not null and accessory_id is null)
      or (kind = 'acc' and accessory_id is not null and device_id is null))
);
create index on sale_lines (sale_id);

create table sale_line_costs (
  sale_line_id uuid primary key references sale_lines(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  unit_cost numeric(14,2) not null,
  currency currency not null
);

create table sale_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  sale_id uuid not null references sales(id) on delete cascade,
  method pay_method not null,
  currency currency not null,
  amount numeric(14,2) not null check (amount > 0)
);

create table trade_ins (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  sale_id uuid not null unique references sales(id) on delete cascade,
  device_id uuid not null references devices(id),
  appraisal jsonb not null,
  value_usd numeric(12,2) not null,
  resale_usd numeric(12,2) not null,
  icloud_free boolean not null,
  imei_clean boolean not null
);

-- ---------- ingresos de equipos ----------
create table purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  number text not null,
  at timestamptz not null default now(),
  device_id uuid not null references devices(id),
  origin device_origin not null,
  person_name text not null default '',
  person_dni text not null default '',
  person_phone text not null default '',
  cost_usd numeric(12,2) not null,
  pay_method pay_method,
  pay_amount numeric(14,2) not null default 0,
  by_profile uuid references profiles(id),
  unique (store_id, number)
);

create table cash_moves (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  shift_id uuid references cash_shifts(id),
  at timestamptz not null default now(),
  type move_type not null,
  concept text not null,
  method pay_method not null,
  currency currency not null,
  amount numeric(14,2) not null check (amount > 0),
  sale_id uuid references sales(id),
  purchase_id uuid references purchases(id),
  by_profile uuid references profiles(id)
);
create index on cash_moves (shift_id);

-- ---------- registro ----------
create table audit_log (
  id bigint generated always as identity primary key,
  store_id uuid not null references stores(id) on delete cascade,
  at timestamptz not null default now(),
  profile_id uuid references profiles(id),
  user_name text not null,
  action text not null,
  detail text not null default ''
);
create index on audit_log (store_id, at desc);

create or replace function log_event(p_action text, p_detail text) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (store_id, profile_id, user_name, action, detail)
  select store_id, id, name, p_action, coalesce(p_detail, '') from profiles where id = auth.uid()
$$;

-- ---------- catálogo y asistente ----------
create table catalog_settings (
  store_id uuid primary key references stores(id) on delete cascade,
  published boolean not null default true,
  whatsapp text not null default '',
  headline text not null default 'Tu próximo iPhone, al mejor precio',
  tagline text not null default 'Equipos nuevos y usados con garantía, y plan canje.',
  show_accessories boolean not null default true,
  assistant_on boolean not null default true,
  assistant_name text not null default 'Asistente',
  greeting text not null default '',
  slug text unique
);

create table catalog_items (
  device_id uuid primary key references devices(id) on delete cascade,
  store_id uuid not null references stores(id) on delete cascade,
  visible boolean not null default true,
  featured boolean not null default false,
  photo_path text
);

create table assistant_chats (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  kind text not null default 'chat' check (kind in ('chat', 'click')),
  topic text not null default 'Consulta',
  messages jsonb not null default '[]',
  last_message text not null default '',
  handoff boolean not null default false,
  item_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assistant_chats (store_id, created_at desc);

-- ---------- vistas ----------
-- Vista pública del catálogo: solo equipos disponibles y visibles, sin costo, IMEI ni clientes.
create view catalogo_publico with (security_barrier) as
select d.id, d.store_id, cs.slug, d.kind, d.model, d.capacity, d.color, d.condition,
       d.battery, d.price_usd, d.warranty_days, coalesce(ci.featured, false) as featured, ci.photo_path
from devices d
join catalog_settings cs on cs.store_id = d.store_id and cs.published
left join catalog_items ci on ci.device_id = d.id
where d.status = 'Disponible' and coalesce(ci.visible, true);

create view accesorios_publicos with (security_barrier) as
select a.id, a.store_id, cs.slug, a.name, a.category, a.price_ars
from accessories a
join catalog_settings cs on cs.store_id = a.store_id and cs.published and cs.show_accessories
where a.stock > 0;

create view catalogo_config_publica with (security_barrier) as
select store_id, slug, s.name as store_name, s.address, whatsapp, headline, tagline,
       assistant_on, assistant_name, greeting
from catalog_settings join stores s on s.id = store_id
where published;

-- Las vistas corren con los permisos del dueño: solo exponen las columnas listadas.
revoke all on catalogo_publico, accesorios_publicos, catalogo_config_publica from public, anon, authenticated;
grant select on catalogo_publico, accesorios_publicos, catalogo_config_publica to anon, authenticated;

-- ---------- RLS ----------
alter table stores enable row level security;
alter table trade_in_values enable row level security;
alter table store_counters enable row level security;
alter table profiles enable row level security;
alter table profile_pins enable row level security;
alter table devices enable row level security;
alter table device_costs enable row level security;
alter table device_events enable row level security;
alter table accessories enable row level security;
alter table accessory_costs enable row level security;
alter table accessory_moves enable row level security;
alter table clients enable row level security;
alter table cash_shifts enable row level security;
alter table sales enable row level security;
alter table sale_lines enable row level security;
alter table sale_line_costs enable row level security;
alter table sale_payments enable row level security;
alter table trade_ins enable row level security;
alter table purchases enable row level security;
alter table cash_moves enable row level security;
alter table audit_log enable row level security;
alter table catalog_settings enable row level security;
alter table catalog_items enable row level security;
alter table assistant_chats enable row level security;

-- El visitante anónimo no toca tablas: solo las vistas públicas de arriba.
revoke all on all tables in schema public from anon;
grant select on catalogo_publico, accesorios_publicos, catalogo_config_publica to anon;

-- Local: todos los usuarios leen su local; solo Administrador lo edita.
create policy stores_select on stores for select to authenticated using (id = current_store_id());
create policy stores_update on stores for update to authenticated using (id = current_store_id() and is_admin());

create policy tiv_select on trade_in_values for select to authenticated using (store_id = current_store_id());
create policy tiv_write on trade_in_values for all to authenticated
  using (store_id = current_store_id() and is_admin()) with check (store_id = current_store_id() and is_admin());

-- Usuarios: todos ven los usuarios de su local (para elegir vendedor); solo Administrador los gestiona.
create policy profiles_select on profiles for select to authenticated using (store_id = current_store_id());
create policy profiles_write on profiles for all to authenticated
  using (store_id = current_store_id() and is_admin()) with check (store_id = current_store_id() and is_admin());

-- Equipos: todos leen el stock de su local; Administrador y Encargado lo editan.
create policy devices_select on devices for select to authenticated using (store_id = current_store_id());
create policy devices_write on devices for all to authenticated
  using (store_id = current_store_id() and is_manager()) with check (store_id = current_store_id() and is_manager());
create policy device_events_select on device_events for select to authenticated using (store_id = current_store_id());

-- Costos: solo Administrador y Encargado.
create policy device_costs_mgr on device_costs for all to authenticated
  using (store_id = current_store_id() and is_manager()) with check (store_id = current_store_id() and is_manager());
create policy accessory_costs_mgr on accessory_costs for all to authenticated
  using (store_id = current_store_id() and is_manager()) with check (store_id = current_store_id() and is_manager());
create policy sale_line_costs_mgr on sale_line_costs for select to authenticated
  using (store_id = current_store_id() and is_manager());

create policy accessories_select on accessories for select to authenticated using (store_id = current_store_id());
create policy accessories_write on accessories for all to authenticated
  using (store_id = current_store_id() and is_manager()) with check (store_id = current_store_id() and is_manager());
create policy accessory_moves_select on accessory_moves for select to authenticated using (store_id = current_store_id());

-- Clientes: todos los roles los ven y cargan.
create policy clients_all on clients for all to authenticated
  using (store_id = current_store_id()) with check (store_id = current_store_id());

-- Caja: Administrador y Encargado ven todos los turnos; el Cajero los suyos. Vendedor no entra a caja.
create policy cash_shifts_select on cash_shifts for select to authenticated using (
  store_id = current_store_id() and (is_manager() or (current_app_role() = 'Cajero' and (opened_by = auth.uid() or status = 'Abierta')))
);
create policy cash_moves_select on cash_moves for select to authenticated using (
  store_id = current_store_id() and (is_manager() or current_app_role() = 'Cajero')
);

-- Ventas: todos los roles leen las ventas de su local (sin costos: esos están en sale_line_costs).
create policy sales_select on sales for select to authenticated using (store_id = current_store_id());
create policy sale_lines_select on sale_lines for select to authenticated using (store_id = current_store_id());
create policy sale_payments_select on sale_payments for select to authenticated using (store_id = current_store_id());
create policy trade_ins_select on trade_ins for select to authenticated using (
  store_id = current_store_id() and current_app_role() <> 'Cajero'
);

create policy purchases_select on purchases for select to authenticated using (store_id = current_store_id() and is_manager());

create policy audit_select on audit_log for select to authenticated using (store_id = current_store_id() and is_manager());

create policy catalog_settings_select on catalog_settings for select to authenticated using (store_id = current_store_id());
create policy catalog_settings_write on catalog_settings for all to authenticated
  using (store_id = current_store_id() and is_manager()) with check (store_id = current_store_id() and is_manager());
create policy catalog_items_select on catalog_items for select to authenticated using (store_id = current_store_id());
create policy catalog_items_write on catalog_items for all to authenticated
  using (store_id = current_store_id() and is_manager()) with check (store_id = current_store_id() and is_manager());
create policy assistant_chats_select on assistant_chats for select to authenticated using (store_id = current_store_id() and is_manager());

-- Ventas, anulaciones, ingresos y caja se escriben solo con las funciones SQL de las etapas 2 a 5:
-- sin políticas de insert/update en esas tablas, el cliente no puede escribirlas directo.

-- ---------- PIN de mostrador ----------
-- Cambio rápido de usuario en un equipo donde ya hay una sesión del local.
-- Verifica el PIN de otro usuario del mismo local; 5 intentos fallidos bloquean ese PIN 5 minutos.
create or replace function verificar_pin(p_profile uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_pin profile_pins%rowtype;
  v_ok boolean;
begin
  if current_store_id() is null then return false; end if;
  select pp.* into v_pin from profile_pins pp join profiles p on p.id = pp.profile_id
  where pp.profile_id = p_profile and p.store_id = current_store_id() and p.active
  for update of pp;
  if not found then return false; end if;
  if v_pin.locked_until is not null and v_pin.locked_until > now() then return false; end if;
  v_ok := v_pin.pin_hash = crypt(coalesce(p_pin, ''), v_pin.pin_hash);
  if v_ok then
    update profile_pins set failed_attempts = 0, locked_until = null where profile_id = p_profile;
  else
    update profile_pins set
      failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' end
    where profile_id = p_profile;
  end if;
  return v_ok;
end $$;
revoke execute on function verificar_pin(uuid, text) from public, anon;
grant execute on function verificar_pin(uuid, text) to authenticated;
revoke execute on function log_event(text, text) from public, anon, authenticated;
