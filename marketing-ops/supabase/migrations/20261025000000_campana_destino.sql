-- Campañas: qué promociona (un producto o servicio de la marca) y a qué página lleva el anuncio.
-- Sin producto, los anuncios hablaban del nombre de la campaña; sin página, un lanzamiento no podía llevar a una web propia.

alter table campaigns add column product text not null default '';
alter table campaigns add column link text not null default '' check (link = '' or link ~* '^https?://[^\s]+$');

create or replace function save_campaign(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := current_workspace_id();
  v_id uuid;
  v_brand uuid;
  v_link text := trim(coalesce(p->>'link', ''));
begin
  if not can_create() then raise exception 'Tu rol no crea ni edita campañas.'; end if;
  if length(trim(coalesce(p->>'name', ''))) = 0 then raise exception 'Poné un nombre a la campaña.'; end if;
  if nullif(p->>'starts_on', '') is null or nullif(p->>'ends_on', '') is null then raise exception 'Elegí desde y hasta cuándo.'; end if;
  if (p->>'ends_on')::date < (p->>'starts_on')::date then raise exception 'La campaña termina antes de empezar.'; end if;
  if coalesce(nullif(p->>'budget', '')::numeric, 0) < 0 then raise exception 'El presupuesto no puede ser negativo.'; end if;
  if v_link <> '' and v_link !~* '^https?://[^\s]+$' then raise exception 'La página de destino tiene que empezar con https://'; end if;
  if p_id is null then
    v_brand := (p->>'brand_id')::uuid;
    if not exists (select 1 from brands where id = v_brand and workspace_id = v_ws) then raise exception 'Marca inexistente.'; end if;
    insert into campaigns (workspace_id, brand_id, name, goal, starts_on, ends_on, budget, offer, product, link, audience, locations, age_min, age_max, interests, notes, created_by, updated_by)
    values (v_ws, v_brand, left(trim(p->>'name'), 120), coalesce(nullif(p->>'goal', ''), 'Vender')::content_goal,
      (p->>'starts_on')::date, (p->>'ends_on')::date, coalesce(nullif(p->>'budget', '')::numeric, 0),
      left(coalesce(p->>'offer', ''), 300), left(trim(coalesce(p->>'product', '')), 120), left(v_link, 300),
      left(coalesce(p->>'audience', ''), 500), left(coalesce(p->>'locations', ''), 300),
      coalesce(nullif(p->>'age_min', '')::int, 18), coalesce(nullif(p->>'age_max', '')::int, 65),
      left(coalesce(p->>'interests', ''), 500), left(coalesce(p->>'notes', ''), 1000), auth.uid(), auth.uid())
    returning id into v_id;
    insert into campaign_events (workspace_id, campaign_id, action, by_profile) values (v_ws, v_id, 'Creó la campaña', auth.uid());
  else
    -- La marca no se cambia: las piezas de la campaña son de esa marca.
    update campaigns set
      name = left(trim(p->>'name'), 120), goal = coalesce(nullif(p->>'goal', ''), goal::text)::content_goal,
      starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date, budget = coalesce(nullif(p->>'budget', '')::numeric, 0),
      offer = left(coalesce(p->>'offer', offer), 300),
      product = case when p ? 'product' then left(trim(coalesce(p->>'product', '')), 120) else product end,
      link = case when p ? 'link' then left(v_link, 300) else link end,
      audience = left(coalesce(p->>'audience', audience), 500),
      locations = left(coalesce(p->>'locations', locations), 300),
      age_min = coalesce(nullif(p->>'age_min', '')::int, age_min), age_max = coalesce(nullif(p->>'age_max', '')::int, age_max),
      interests = left(coalesce(p->>'interests', interests), 500), notes = left(coalesce(p->>'notes', notes), 1000),
      updated_at = now(), updated_by = auth.uid()
    where id = p_id and workspace_id = v_ws
    returning id into v_id;
    if v_id is null then raise exception 'Campaña inexistente.'; end if;
    insert into campaign_events (workspace_id, campaign_id, action, by_profile) values (v_ws, v_id, 'Editó la campaña', auth.uid());
  end if;
  return v_id;
end $$;
