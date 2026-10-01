do $$
declare
  p record;
  m record;
  v record;
  v_new_plan uuid;
  v_new_meal uuid;
  v_new_variant uuid;
begin
  for p in
    select *
    from public.nutrition_plans
    where status='active'
      and client_id is not null
      and client_id=created_by
      and free_kcal_target=0
  loop
    perform pg_advisory_xact_lock(hashtext('nutrition:'||p.client_id::text));

    insert into public.nutrition_plans(
      family_id,client_id,name,description,daily_kcal_target,free_kcal_target,
      protein_target_g,fat_target_g,carbs_target_g,status,version,created_by,
      supersedes_plan_id,notes
    ) values(
      p.family_id,p.client_id,p.name,p.description,p.daily_kcal_target,250,
      p.protein_target_g,p.fat_target_g,p.carbs_target_g,'draft',p.version+1,p.created_by,
      p.id,p.notes
    )
    returning id into v_new_plan;

    for m in
      select *
      from public.nutrition_plan_meals
      where plan_id=p.id
      order by sort_order,id
    loop
      insert into public.nutrition_plan_meals(
        plan_id,name,meal_type,sort_order,kcal_target,target_locked,notes
      ) values(
        v_new_plan,m.name,m.meal_type,m.sort_order,m.kcal_target,m.target_locked,m.notes
      )
      returning id into v_new_meal;

      for v in
        select *
        from public.nutrition_plan_meal_variants
        where meal_id=m.id
        order by sort_order,id
      loop
        insert into public.nutrition_plan_meal_variants(
          meal_id,name,sort_order,is_default,notes
        ) values(
          v_new_meal,v.name,v.sort_order,v.is_default,v.notes
        )
        returning id into v_new_variant;

        insert into public.nutrition_plan_meal_items(
          variant_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,
          protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
        )
        select
          v_new_variant,food_id,food_name_snapshot,grams,kcal_100_snapshot,
          protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
        from public.nutrition_plan_meal_items
        where variant_id=v.id
        order by sort_order,id;
      end loop;
    end loop;

    update public.nutrition_plans
    set status='archived',updated_at=now()
    where id=p.id;

    update public.nutrition_plans
    set status='active',published_at=now(),updated_at=now()
    where id=v_new_plan;
  end loop;
end $$;
