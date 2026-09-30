alter table public.foods
  drop constraint if exists foods_protein_100_check,
  drop constraint if exists foods_fat_100_check,
  drop constraint if exists foods_carbs_100_check,
  drop constraint if exists foods_default_portion_g_check;

alter table public.foods
  add constraint foods_protein_100_check check (protein_100>=0),
  add constraint foods_fat_100_check check (fat_100>=0),
  add constraint foods_carbs_100_check check (carbs_100>=0),
  add constraint foods_default_portion_g_check check (default_portion_g is null or (default_portion_g>0 and default_portion_g<=10000));

create or replace function public.save_my_nutrition_checkin(
  p_date date,
  p_mode text,
  p_adherence text default null,
  p_deviation text default null,
  p_calories integer default null,
  p_protein_g numeric default null,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('meal_plan','manual') then raise exception 'Invalid nutrition mode'; end if;
  if p_calories is not null and p_calories<0 then raise exception 'Calories cannot be negative'; end if;
  if p_protein_g is not null and p_protein_g<0 then raise exception 'Protein cannot be negative'; end if;
  if p_deviation is not null and p_deviation not in ('about_target','over','under','unknown') then
    raise exception 'Invalid nutrition deviation';
  end if;

  if p_mode='meal_plan' then
    if p_adherence is null or p_adherence not in ('followed','partial','not_followed') then
      raise exception 'Adherence is required for meal-plan mode';
    end if;
    if p_plan_id is null then raise exception 'Meal Plan is required for meal-plan mode'; end if;
    if not exists(
      select 1 from public.nutrition_plans p
      where p.id=p_plan_id and p.client_id=v_user and p.status in ('active','archived')
    ) then
      raise exception 'Nutrition plan not available';
    end if;
  else
    if p_calories is null then raise exception 'Calories are required for manual mode'; end if;
    p_adherence:=null;
    p_deviation:=null;
    p_plan_id:=null;
  end if;

  insert into public.daily_checkins(
    client_id,checkin_date,nutrition_mode,nutrition_adherence,nutrition_deviation,
    calories,protein_g,nutrition_plan_id
  ) values (
    v_user,coalesce(p_date,current_date),p_mode,p_adherence,p_deviation,
    p_calories,p_protein_g,p_plan_id
  )
  on conflict(client_id,checkin_date) do update
  set nutrition_mode=excluded.nutrition_mode,
      nutrition_adherence=excluded.nutrition_adherence,
      nutrition_deviation=excluded.nutrition_deviation,
      calories=excluded.calories,
      protein_g=excluded.protein_g,
      nutrition_plan_id=excluded.nutrition_plan_id
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.publish_nutrition_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_client uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select p.client_id into v_client
  from public.nutrition_plans p
  where p.id=p_plan_id and p.created_by=v_user and p.status='draft'
  for update;

  if not found then raise exception 'Draft plan not found'; end if;
  if v_client is null then raise exception 'Assign the plan to a client before publishing'; end if;
  if not exists(
    select 1 from public.coach_clients cc
    where cc.coach_id=v_user and cc.client_id=v_client and cc.status='active'
  ) then raise exception 'Client is not assigned to this trainer'; end if;
  if not exists(select 1 from public.nutrition_plan_meals m where m.plan_id=p_plan_id) then
    raise exception 'Plan has no meals';
  end if;
  if exists(
    select 1
    from public.nutrition_plan_meals m
    where m.plan_id=p_plan_id
      and not exists(select 1 from public.nutrition_plan_meal_variants v where v.meal_id=m.id)
  ) then
    raise exception 'Every meal must have at least one variant';
  end if;
  if exists(
    select 1
    from public.nutrition_plan_meals m
    join public.nutrition_plan_meal_variants v on v.meal_id=m.id
    where m.plan_id=p_plan_id
      and not exists(select 1 from public.nutrition_plan_meal_items i where i.variant_id=v.id)
  ) then
    raise exception 'Every meal variant must contain at least one food';
  end if;

  perform pg_advisory_xact_lock(hashtext('nutrition:'||v_client::text));

  update public.nutrition_plans
  set status='archived',updated_at=now()
  where client_id=v_client and status='active' and id<>p_plan_id;

  update public.nutrition_plans
  set status='active',published_at=now(),updated_at=now()
  where id=p_plan_id;

  update public.client_nutrition_assignments
  set ends_at=current_date-1
  where client_id=v_client and ends_at is null;

  insert into public.client_nutrition_assignments(client_id,template_id,starts_at,ends_at,overrides,assigned_by)
  values(v_client,p_plan_id,current_date,null,'{}'::jsonb,v_user);

  return p_plan_id;
end;
$function$;

revoke execute on function public.publish_nutrition_plan(uuid) from public,anon;
grant execute on function public.publish_nutrition_plan(uuid) to authenticated;
