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

create or replace function public.assign_nutrition_template(p_template_id uuid,p_client_id uuid)
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
  if not exists(select 1 from public.coach_clients where coach_id=v_user and client_id=p_client_id and status='active') then
    raise exception 'Client is not assigned to this trainer';
  end if;
  if not exists(select 1 from public.nutrition_plans where id=p_template_id and created_by=v_user and client_id is null) then
    raise exception 'Template not found';
  end if;

  perform pg_advisory_xact_lock(hashtext('nutrition:'||p_client_id::text));

  update public.nutrition_plans
  set status='archived',updated_at=now()
  where client_id=p_client_id and status='active';

  select coalesce(max(version),0)+1 into v_version
  from public.nutrition_plans
  where client_id=p_client_id and created_by=v_user;

  insert into public.nutrition_plans(
    client_id,name,description,daily_kcal_target,protein_target_g,fat_target_g,carbs_target_g,
    status,created_by,notes,version,published_at
  )
  select p_client_id,name,description,daily_kcal_target,protein_target_g,fat_target_g,carbs_target_g,
    'active',v_user,notes,v_version,now()
  from public.nutrition_plans where id=p_template_id
  returning id into v_new;

  for v_m in select * from public.nutrition_plan_meals where plan_id=p_template_id order by sort_order loop
    insert into public.nutrition_plan_meals(plan_id,name,meal_type,sort_order,kcal_target,target_locked,notes)
    values(v_new,v_m.name,v_m.meal_type,v_m.sort_order,v_m.kcal_target,v_m.target_locked,v_m.notes)
    returning id into v_new_m;

    for v_v in select * from public.nutrition_plan_meal_variants where meal_id=v_m.id order by sort_order loop
      insert into public.nutrition_plan_meal_variants(meal_id,name,sort_order,is_default,notes)
      values(v_new_m,v_v.name,v_v.sort_order,v_v.is_default,v_v.notes)
      returning id into v_new_v;

      insert into public.nutrition_plan_meal_items(
        variant_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,protein_100_snapshot,
        fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
      )
      select v_new_v,food_id,food_name_snapshot,grams,kcal_100_snapshot,protein_100_snapshot,
        fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
      from public.nutrition_plan_meal_items
      where variant_id=v_v.id
      order by sort_order;
    end loop;
  end loop;

  update public.client_nutrition_assignments
  set ends_at=current_date-1
  where client_id=p_client_id and ends_at is null;

  insert into public.client_nutrition_assignments(client_id,template_id,starts_at,ends_at,overrides,assigned_by)
  values(p_client_id,v_new,current_date,null,'{}'::jsonb,v_user);

  return v_new;
end;
$function$;

revoke execute on function public.assign_nutrition_template(uuid,uuid) from public,anon;
grant execute on function public.assign_nutrition_template(uuid,uuid) to authenticated;

create or replace function public.save_my_measurement(
  p_date date,
  p_weight_kg numeric default null,
  p_waist_cm numeric default null,
  p_chest_cm numeric default null,
  p_hips_cm numeric default null,
  p_thigh_cm numeric default null,
  p_arm_relaxed_cm numeric default null,
  p_arm_flexed_cm numeric default null,
  p_note text default null
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

  insert into public.measurements(
    client_id,measured_at,weight_kg,waist_cm,chest_cm,hips_cm,thigh_cm,
    arm_relaxed_cm,arm_flexed_cm,note
  ) values (
    v_user,coalesce(p_date,current_date),p_weight_kg,p_waist_cm,p_chest_cm,p_hips_cm,p_thigh_cm,
    p_arm_relaxed_cm,p_arm_flexed_cm,nullif(btrim(p_note),'')
  )
  on conflict(client_id,measured_at) do update
  set weight_kg=coalesce(excluded.weight_kg,measurements.weight_kg),
      waist_cm=coalesce(excluded.waist_cm,measurements.waist_cm),
      chest_cm=coalesce(excluded.chest_cm,measurements.chest_cm),
      hips_cm=coalesce(excluded.hips_cm,measurements.hips_cm),
      thigh_cm=coalesce(excluded.thigh_cm,measurements.thigh_cm),
      arm_relaxed_cm=coalesce(excluded.arm_relaxed_cm,measurements.arm_relaxed_cm),
      arm_flexed_cm=coalesce(excluded.arm_flexed_cm,measurements.arm_flexed_cm),
      note=case when p_note is not null then nullif(btrim(p_note),'') else measurements.note end
  returning id into v_id;

  return v_id;
end;
$function$;
