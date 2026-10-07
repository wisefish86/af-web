-- Align the current nutrition_plans model with trainer publish/template assignment.
-- client_nutrition_assignments is a legacy table whose template_id references
-- nutrition_plan_templates, not nutrition_plans. Current flows must not write
-- nutrition_plans ids into that legacy FK.

alter table public.nutrition_plans
  add column if not exists source_template_plan_id uuid
  references public.nutrition_plans(id) on delete set null;

create index if not exists nutrition_plans_source_template_idx
  on public.nutrition_plans(source_template_plan_id)
  where source_template_plan_id is not null;

create or replace function public.publish_nutrition_plan(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_client uuid;
  v_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select p.client_id,p.status into v_client,v_status
  from public.nutrition_plans p
  where p.id=p_plan_id and p.created_by=v_user
  for update;

  if not found then raise exception 'Plan not found'; end if;
  if v_status='active' then return p_plan_id; end if;
  if v_status<>'draft' then raise exception 'Draft plan not found'; end if;
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
  set status='active',published_at=coalesce(published_at,now()),updated_at=now()
  where id=p_plan_id;

  return p_plan_id;
end;
$function$;

create or replace function public.assign_nutrition_template(p_template_id uuid, p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_new uuid;
  v_m record;
  v_v record;
  v_new_m uuid;
  v_new_v uuid;
  v_version int;
begin
  if v_user is null or not exists(select 1 from public.profiles where id=v_user and role='trainer') then
    raise exception 'Trainer role required';
  end if;
  if not exists(
    select 1 from public.coach_clients
    where coach_id=v_user and client_id=p_client_id and status='active'
  ) then
    raise exception 'Client is not assigned to this trainer';
  end if;
  if not exists(
    select 1 from public.nutrition_plans
    where id=p_template_id and created_by=v_user and client_id is null
  ) then
    raise exception 'Template not found';
  end if;

  perform pg_advisory_xact_lock(hashtext('nutrition:'||p_client_id::text));

  -- Retry-safe: if the same template is already the active copied plan,
  -- return it instead of creating another version after a lost response.
  select id into v_new
  from public.nutrition_plans
  where client_id=p_client_id
    and created_by=v_user
    and status='active'
    and source_template_plan_id=p_template_id
  order by published_at desc nulls last,created_at desc
  limit 1;

  if v_new is not null then return v_new; end if;

  update public.nutrition_plans
  set status='archived',updated_at=now()
  where client_id=p_client_id and status='active';

  select coalesce(max(version),0)+1 into v_version
  from public.nutrition_plans
  where client_id=p_client_id and created_by=v_user;

  insert into public.nutrition_plans(
    client_id,name,description,daily_kcal_target,free_kcal_target,
    protein_target_g,fat_target_g,carbs_target_g,
    status,created_by,notes,version,published_at,source_template_plan_id
  )
  select p_client_id,name,description,daily_kcal_target,free_kcal_target,
    protein_target_g,fat_target_g,carbs_target_g,
    'active',v_user,notes,v_version,now(),p_template_id
  from public.nutrition_plans where id=p_template_id
  returning id into v_new;

  for v_m in
    select * from public.nutrition_plan_meals
    where plan_id=p_template_id order by sort_order
  loop
    insert into public.nutrition_plan_meals(
      plan_id,name,meal_type,sort_order,kcal_target,target_locked,notes
    )
    values(
      v_new,v_m.name,v_m.meal_type,v_m.sort_order,
      v_m.kcal_target,v_m.target_locked,v_m.notes
    )
    returning id into v_new_m;

    for v_v in
      select * from public.nutrition_plan_meal_variants
      where meal_id=v_m.id order by sort_order
    loop
      insert into public.nutrition_plan_meal_variants(
        meal_id,name,sort_order,is_default,notes
      )
      values(v_new_m,v_v.name,v_v.sort_order,v_v.is_default,v_v.notes)
      returning id into v_new_v;

      insert into public.nutrition_plan_meal_items(
        variant_id,food_id,client_food_id,food_name_snapshot,grams,kcal_100_snapshot,
        protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
      )
      select v_new_v,food_id,client_food_id,food_name_snapshot,grams,kcal_100_snapshot,
        protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
      from public.nutrition_plan_meal_items
      where variant_id=v_v.id
      order by sort_order;
    end loop;
  end loop;

  return v_new;
end;
$function$;

revoke all on function public.publish_nutrition_plan(uuid) from public,anon;
grant execute on function public.publish_nutrition_plan(uuid) to authenticated;
revoke all on function public.assign_nutrition_template(uuid,uuid) from public,anon;
grant execute on function public.assign_nutrition_template(uuid,uuid) to authenticated;
