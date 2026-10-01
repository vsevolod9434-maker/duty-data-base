-- Transactional helpers for multi-table mutations initiated by the static GitHub Pages client.
-- SECURITY INVOKER keeps RLS and authenticated-role permissions in force.

create or replace function public.rename_map_layer_transaction(
  target_layer_id text,
  next_name text,
  next_normalized_name text
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  previous_name text;
  target_is_default boolean;
begin
  select "name", "isDefault"
    into previous_name, target_is_default
  from public."MapLayer"
  where "id" = target_layer_id
  for update;

  if not found then
    raise exception 'MAP_LAYER_NOT_FOUND';
  end if;

  if target_is_default or lower(previous_name) = lower('Основной слой') then
    raise exception 'DEFAULT_MAP_LAYER_IMMUTABLE';
  end if;

  if btrim(next_name) = '' or char_length(next_name) > 80 then
    raise exception 'INVALID_MAP_LAYER_NAME';
  end if;

  if next_normalized_name = lower('Основной слой') then
    raise exception 'DEFAULT_MAP_LAYER_RESERVED';
  end if;

  if exists (
    select 1
    from public."MapLayer"
    where "normalizedName" = next_normalized_name
      and "id" <> target_layer_id
  ) then
    raise exception 'DUPLICATE_MAP_LAYER';
  end if;

  update public."MapMarker" set "layer" = next_name where "layer" = previous_name;
  update public."MapZone" set "layer" = next_name where "layer" = previous_name;
  update public."MapRoute" set "layer" = next_name where "layer" = previous_name;
  update public."MapLabel" set "layer" = next_name where "layer" = previous_name;

  update public."MapLayer"
  set
    "name" = next_name,
    "normalizedName" = next_normalized_name,
    "updatedAt" = now()
  where "id" = target_layer_id;
end
$$;

revoke all on function public.rename_map_layer_transaction(text, text, text) from public;
revoke all on function public.rename_map_layer_transaction(text, text, text) from anon;
grant execute on function public.rename_map_layer_transaction(text, text, text) to authenticated;
