-- APPLE OPS · etapa 8: asistente de chat del catálogo.
-- El asistente corre en el servidor de la app (la clave de la IA nunca llega al navegador) y
-- solo lee vistas públicas. Cada conversación queda registrada para el panel del catálogo.

-- La tasación del canje por chat usa estado y fallas, así que la vista pública suma los
-- multiplicadores por estado y los descuentos por falla. Son los mismos valores que se le
-- cotizan al cliente en el local: no son costos ni márgenes.
create or replace view tasacion_publica with (security_barrier) as
select t.store_id, cs.slug, t.model, t.capacity, t.value_usd,
       coalesce((s.cond_mult ->> 'Usado A')::numeric, 1) as mult_usado_a,
       s.cond_mult as mult_por_estado, s.defect_costs as descuentos_por_falla
from trade_in_values t
join catalog_settings cs on cs.store_id = t.store_id and cs.published
join stores s on s.id = t.store_id;

-- Opciones del asistente en el panel del catálogo.
create or replace function guardar_asistente(p_on boolean, p_name text, p_greeting text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := current_store_id();
  v_old catalog_settings%rowtype;
begin
  if not is_manager() then raise exception 'Tu rol no puede cambiar el catálogo.' using errcode = '42501'; end if;
  if length(coalesce(trim(p_greeting), '')) > 300 then raise exception 'El saludo puede tener hasta 300 caracteres.' using errcode = '22023'; end if;
  select * into v_old from catalog_settings where store_id = v_store;
  if not found then raise exception 'Primero guardá el link del catálogo.' using errcode = '22023'; end if;
  update catalog_settings set
    assistant_on = coalesce(p_on, assistant_on),
    assistant_name = coalesce(nullif(left(trim(p_name), 40), ''), 'Asistente'),
    greeting = coalesce(trim(p_greeting), '')
  where store_id = v_store;
  perform log_event('Catálogo',
    case
      when v_old.assistant_on is distinct from coalesce(p_on, v_old.assistant_on)
        then case when p_on then 'Asistente de chat activado' else 'Asistente de chat desactivado' end
      else 'Se actualizó el asistente de chat'
    end);
end $$;

-- Cada respuesta del asistente actualiza la fila de su conversación (una por visitante y sesión).
-- Se llama desde el servidor de la app con la clave pública: el id lo genera el navegador.
create or replace function registrar_chat(p_slug text, p_id uuid, p_topic text, p_messages jsonb, p_handoff boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
  v_msgs jsonb;
  v_last text;
begin
  select store_id into v_store from catalog_settings where slug = p_slug and published and assistant_on;
  if v_store is null or p_id is null or jsonb_typeof(p_messages) is distinct from 'array' then return; end if;
  -- Solo texto, recortado: rol y contenido de los últimos 40 mensajes.
  select coalesce(jsonb_agg(jsonb_build_object('role', m ->> 'role', 'text', left(coalesce(m ->> 'text', ''), 600)) order by n), '[]')
    into v_msgs
  from (select m, n from jsonb_array_elements(p_messages) with ordinality as e(m, n)
        where m ->> 'role' in ('user', 'bot') order by n desc limit 40) x;
  select left(m ->> 'text', 200) into v_last
  from jsonb_array_elements(v_msgs) with ordinality as e(m, n) where m ->> 'role' = 'user' order by n desc limit 1;
  insert into assistant_chats (id, store_id, kind, topic, messages, last_message, handoff)
  values (p_id, v_store, 'chat', left(coalesce(nullif(trim(p_topic), ''), 'Consulta'), 60), v_msgs, coalesce(v_last, ''), coalesce(p_handoff, false))
  on conflict (id) do update set
    topic = case when assistant_chats.topic = 'Consulta' then excluded.topic else assistant_chats.topic end,
    messages = excluded.messages,
    last_message = excluded.last_message,
    handoff = assistant_chats.handoff or excluded.handoff,
    updated_at = now()
  where assistant_chats.store_id = v_store and assistant_chats.kind = 'chat';
end $$;

revoke execute on function guardar_asistente from public, anon;
grant execute on function guardar_asistente to authenticated;
revoke execute on function registrar_chat from public;
grant execute on function registrar_chat to anon, authenticated;
