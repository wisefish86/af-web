-- Prevent rapid double-submit / lost-response retries from creating duplicate active global foods.
create unique index if not exists foods_active_normalized_name_uq
  on public.foods(lower(btrim(name)))
  where is_active=true;
