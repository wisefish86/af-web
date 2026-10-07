-- Create an editable trainer revision from the current client Meal Plan.
-- The source may have been created by the client. The new version is a trainer-owned
-- draft in the same family and is retry-safe for the same source plan.

create or replace function public.create_nutrition_plan_revision(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_source public.nutrition_plans%rowtype;
  v_new uuid;
  v_old_meal record;
  v_new_meal uuid;
  v_old_variant record;
  v_new_variant uuid;
  v_next_version integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_user and p.role='trainer'
  ) then raise exception 'Trainer role required'; end if;

  select * into v_source
  from public.nutrition_plans p
  where p.id=p_plan_id
    and p.client_id is not null
    and p.status='active';

  if not found then raise exception 'Active nutrition plan not found'; end if;
  if not exists(
    select 1 from public.coach_clients cc
    where cc.coach_id=v_user
      and cc.client_id=v_source.client_id
      and cc.status='active'
  ) then raise exception 'Client is not assigned to this trainer'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('nutrition-family:'||v_source.family_id::text)
  );

  -- Same source + same trainer is the idempotency key. A retry after a lost
  -- response resumes the already-created draft instead of creating another version.
  select p.id into v_new
  from public.nutrition_plans p
  where p.family_id=v_source.family_id
    and p.client_id=v_source.client_id
    and p.created_by=v_user
    and p.status='draft'
    and p.supersedes_plan_id=v_source.id
  order by p.created_at desc
  limit 1;

  if v_new is not null then return v_new; end if;

  select coalesce(max(p.version),0)+1 into v_next_version
  from public.nutrition_plans p
  where p.family_id=v_source.family_id;

  insert into public.nutrition_plans(
    family_id,client_id,name,description,daily_kcal_target,free_kcal_target,
    protein_target_g,fat_target_g,carbs_target_g,status,version,created_by,
    supersedes_plan_id,source_template_plan_id,notes
  ) values (
    v_source.family_id,v_source.client_id,v_source.name,v_source.description,
    v_source.daily_kcal_target,v_source.free_kcal_target,
    v_source.protein_target_g,v_source.fat_target_g,v_source.carbs_target_g,
    'draft',v_next_version,v_user,v_source.id,v_source.source_template_plan_id,v_source.notes
  )
  returning id into v_new;

  for v_old_meal in
    select * from public.nutrition_plan_meals m
    where m.plan_id=v_source.id
    order by m.sort_order
  loop
    insert into public.nutrition_plan_meals(
      plan_id,name,meal_type,sort_order,kcal_target,target_locked,notes
    ) values (
      v_new,v_old_meal.name,v_old_meal.meal_type,v_old_meal.sort_order,
      v_old_meal.kcal_target,v_old_meal.target_locked,v_old_meal.notes
    )
    returning id into v_new_meal;

    for v_old_variant in
      select * from public.nutrition_plan_meal_variants v
      where v.meal_id=v_old_meal.id
      order by v.sort_order
    loop
      insert into public.nutrition_plan_meal_variants(
        meal_id,name,sort_order,is_default,notes
      ) values (
        v_new_meal,v_old_variant.name,v_old_variant.sort_order,
        v_old_variant.is_default,v_old_variant.notes
      )
      returning id into v_new_variant;

      insert into public.nutrition_plan_meal_items(
        variant_id,food_id,client_food_id,food_name_snapshot,grams,kcal_100_snapshot,
        protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
      )
      select v_new_variant,i.food_id,i.client_food_id,i.food_name_snapshot,i.grams,i.kcal_100_snapshot,
        i.protein_100_snapshot,i.fat_100_snapshot,i.carbs_100_snapshot,i.is_fixed,i.sort_order,i.notes
      from public.nutrition_plan_meal_items i
      where i.variant_id=v_old_variant.id
      order by i.sort_order;
    end loop;
  end loop;

  return v_new;
end;
$function$;

revoke all on function public.create_nutrition_plan_revision(uuid) from public,anon;
grant execute on function public.create_nutrition_plan_revision(uuid) to authenticated;
