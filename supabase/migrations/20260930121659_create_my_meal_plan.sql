create or replace function public.create_my_meal_plan(p_meal_count integer, p_food_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_target integer;
  v_plan_id uuid;
  v_existing uuid;
  v_meal_id uuid;
  v_variant_id uuid;
  v_meal_target integer;
  v_base_target integer;
  v_food_count integer;
  v_all_ids uuid[];
  v_protein_ids uuid[];
  v_carb_ids uuid[];
  v_produce_ids uuid[];
  v_fat_ids uuid[];
  v_meal_food_ids uuid[];
  v_pick uuid;
  v_food public.foods%rowtype;
  v_base_total numeric;
  v_base_grams numeric;
  v_scale numeric;
  v_scaled_grams numeric;
  v_fill_offset integer;
  v_i integer;
begin
  if v_user is null then
    raise exception 'Нужно войти в аккаунт';
  end if;

  select p.role into v_role from public.profiles p where p.id=v_user;
  if v_role is distinct from 'client' then
    raise exception 'Meal Plan можно создать только из клиентского кабинета';
  end if;

  if p_meal_count is null or p_meal_count not between 2 and 5 then
    raise exception 'Выбери от 2 до 5 приёмов пищи';
  end if;

  select s.target_kcal into v_target
  from public.client_nutrition_setup s
  where s.client_id=v_user;

  if v_target is null or v_target < 500 then
    raise exception 'Сначала рассчитай стартовую калорийность';
  end if;

  select p.id into v_existing
  from public.nutrition_plans p
  where p.client_id=v_user and p.status='active'
  order by p.published_at desc nulls last, p.created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select array_agg(f.id order by f.popularity_rank, f.name)
  into v_all_ids
  from public.foods f
  where f.is_active=true
    and f.id = any(coalesce(p_food_ids,'{}'::uuid[]));

  v_food_count := cardinality(coalesce(v_all_ids,'{}'::uuid[]));
  if v_food_count=0 then
    raise exception 'Выбери хотя бы один любимый продукт';
  end if;

  select array_agg(f.id order by f.popularity_rank, f.name)
  into v_protein_ids
  from public.foods f
  where f.id=any(v_all_ids) and f.food_group in ('meat','fish','dairy','plant_protein','sports');

  select array_agg(f.id order by f.popularity_rank, f.name)
  into v_carb_ids
  from public.foods f
  where f.id=any(v_all_ids) and f.food_group='carb';

  select array_agg(f.id order by f.popularity_rank, f.name)
  into v_produce_ids
  from public.foods f
  where f.id=any(v_all_ids) and f.food_group in ('vegetable','fruit');

  select array_agg(f.id order by f.popularity_rank, f.name)
  into v_fat_ids
  from public.foods f
  where f.id=any(v_all_ids) and f.food_group='fat';

  insert into public.nutrition_plans(
    client_id,name,description,daily_kcal_target,status,version,created_by,notes
  ) values (
    v_user,'Мой Meal Plan','Стартовый план по выбранным любимым продуктам.',
    v_target,'draft',1,v_user,'Граммовки рассчитаны автоматически. План можно корректировать по фактической динамике.'
  )
  returning id into v_plan_id;

  v_base_target := floor(v_target::numeric/p_meal_count)::integer;

  for v_i in 1..p_meal_count loop
    v_meal_target := case
      when v_i=p_meal_count then v_target-v_base_target*(p_meal_count-1)
      else v_base_target
    end;

    insert into public.nutrition_plan_meals(
      plan_id,name,meal_type,sort_order,kcal_target,target_locked
    ) values (
      v_plan_id,'Приём пищи '||v_i,'main',v_i*10,v_meal_target,false
    )
    returning id into v_meal_id;

    insert into public.nutrition_plan_meal_variants(
      meal_id,name,sort_order,is_default,notes
    ) values (
      v_meal_id,'Основной вариант',10,true,'Собран автоматически из выбранных продуктов.'
    )
    returning id into v_variant_id;

    v_meal_food_ids := '{}'::uuid[];

    if cardinality(coalesce(v_protein_ids,'{}'::uuid[]))>0 then
      v_pick := v_protein_ids[((v_i-1)%cardinality(v_protein_ids))+1];
      v_meal_food_ids := array_append(v_meal_food_ids,v_pick);
    end if;

    if cardinality(coalesce(v_carb_ids,'{}'::uuid[]))>0 then
      v_pick := v_carb_ids[((v_i-1)%cardinality(v_carb_ids))+1];
      if not (v_pick=any(v_meal_food_ids)) then v_meal_food_ids:=array_append(v_meal_food_ids,v_pick); end if;
    end if;

    if cardinality(coalesce(v_produce_ids,'{}'::uuid[]))>0 then
      v_pick := v_produce_ids[((v_i-1)%cardinality(v_produce_ids))+1];
      if not (v_pick=any(v_meal_food_ids)) then v_meal_food_ids:=array_append(v_meal_food_ids,v_pick); end if;
    end if;

    if cardinality(coalesce(v_fat_ids,'{}'::uuid[]))>0 then
      v_pick := v_fat_ids[((v_i-1)%cardinality(v_fat_ids))+1];
      if not (v_pick=any(v_meal_food_ids)) then v_meal_food_ids:=array_append(v_meal_food_ids,v_pick); end if;
    end if;

    v_fill_offset := 0;
    while cardinality(v_meal_food_ids)<least(3,v_food_count) and v_fill_offset<v_food_count loop
      v_pick := v_all_ids[((v_i-1+v_fill_offset)%v_food_count)+1];
      if not (v_pick=any(v_meal_food_ids)) then
        v_meal_food_ids:=array_append(v_meal_food_ids,v_pick);
      end if;
      v_fill_offset:=v_fill_offset+1;
    end loop;

    v_base_total := 0;
    foreach v_pick in array v_meal_food_ids loop
      select * into v_food from public.foods f where f.id=v_pick;
      v_base_grams := greatest(1,coalesce(v_food.default_portion_g,100));
      v_base_total := v_base_total + v_base_grams*v_food.kcal_100/100;
    end loop;

    if v_base_total<=0 then
      raise exception 'Среди выбранных продуктов нет продуктов с калорийностью';
    end if;

    v_scale := v_meal_target/v_base_total;

    foreach v_pick in array v_meal_food_ids loop
      select * into v_food from public.foods f where f.id=v_pick;
      v_base_grams := greatest(1,coalesce(v_food.default_portion_g,100));
      v_scaled_grams := least(1000,greatest(5,round(v_base_grams*v_scale)));

      insert into public.nutrition_plan_meal_items(
        variant_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,
        protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,
        is_fixed,sort_order,notes
      ) values (
        v_variant_id,v_food.id,v_food.name,v_scaled_grams,v_food.kcal_100,
        v_food.protein_100,v_food.fat_100,v_food.carbs_100,
        false,(array_position(v_meal_food_ids,v_pick))*10,null
      );
    end loop;
  end loop;

  update public.nutrition_plans
  set status='active',published_at=now(),updated_at=now()
  where id=v_plan_id;

  return v_plan_id;
end;
$function$;

revoke execute on function public.create_my_meal_plan(integer,uuid[]) from public, anon;
grant execute on function public.create_my_meal_plan(integer,uuid[]) to authenticated;
