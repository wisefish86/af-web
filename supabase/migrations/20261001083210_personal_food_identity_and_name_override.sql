alter table public.client_food_preferences
  add column if not exists custom_name text;

alter table public.nutrition_plan_meal_items
  add column if not exists client_food_id uuid references public.client_foods(id) on delete set null;

alter table public.nutrition_plan_meal_items
  drop constraint if exists nutrition_plan_meal_items_single_food_source_check;

alter table public.nutrition_plan_meal_items
  add constraint nutrition_plan_meal_items_single_food_source_check
  check (not (food_id is not null and client_food_id is not null));

create or replace function public.save_my_food_override_v2(
  p_food_id uuid,
  p_name text default null,
  p_kcal_100 numeric default null,
  p_protein_100 numeric default null,
  p_fat_100 numeric default null,
  p_carbs_100 numeric default null,
  p_default_portion_g numeric default null
)
returns void
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.foods f where f.id=p_food_id and f.is_active=true) then
    raise exception 'Food not found';
  end if;
  if p_name is not null and btrim(p_name)='' then raise exception 'Name cannot be empty'; end if;
  if p_kcal_100 is not null and p_kcal_100<0 then raise exception 'Calories cannot be negative'; end if;
  if p_protein_100 is not null and p_protein_100<0 then raise exception 'Protein cannot be negative'; end if;
  if p_fat_100 is not null and p_fat_100<0 then raise exception 'Fat cannot be negative'; end if;
  if p_carbs_100 is not null and p_carbs_100<0 then raise exception 'Carbs cannot be negative'; end if;
  if p_default_portion_g is not null and p_default_portion_g<=0 then raise exception 'Portion must be positive'; end if;

  insert into public.client_food_preferences(
    client_id,food_id,preference,is_enabled,custom_name,
    custom_kcal_100,custom_protein_100,custom_fat_100,custom_carbs_100,custom_default_portion_g,updated_at
  )
  values(
    v_user,p_food_id,'allowed',true,nullif(btrim(p_name),''),
    p_kcal_100,p_protein_100,p_fat_100,p_carbs_100,p_default_portion_g,now()
  )
  on conflict(client_id,food_id) do update
  set custom_name=excluded.custom_name,
      custom_kcal_100=excluded.custom_kcal_100,
      custom_protein_100=excluded.custom_protein_100,
      custom_fat_100=excluded.custom_fat_100,
      custom_carbs_100=excluded.custom_carbs_100,
      custom_default_portion_g=excluded.custom_default_portion_g,
      updated_at=now();
end;
$function$;

revoke execute on function public.save_my_food_override_v2(uuid,text,numeric,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.save_my_food_override_v2(uuid,text,numeric,numeric,numeric,numeric,numeric) to authenticated;

create or replace function public.clear_my_food_override(p_food_id uuid)
returns void
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  update public.client_food_preferences
  set custom_name=null,
      custom_kcal_100=null,
      custom_protein_100=null,
      custom_fat_100=null,
      custom_carbs_100=null,
      custom_default_portion_g=null,
      updated_at=now()
  where client_id=(select auth.uid()) and food_id=p_food_id;
end;
$function$;

create or replace function public.save_my_meal_plan_version(
  p_plan_id uuid,
  p_free_kcal_target integer,
  p_meals jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_old public.nutrition_plans%rowtype;
  v_new_id uuid;
  v_meal jsonb;
  v_variant jsonb;
  v_item jsonb;
  v_meal_id uuid;
  v_variant_id uuid;
  v_sort integer:=0;
  v_variant_sort integer;
  v_item_sort integer;
  v_sum integer:=0;
  v_budget integer;
  v_meal_target integer;
  v_meal_type text;
  v_food_id uuid;
  v_client_food_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_free_kcal_target not between 200 and 300 then
    raise exception 'Свободные калории должны быть от 200 до 300';
  end if;
  if jsonb_typeof(p_meals)<>'array' or jsonb_array_length(p_meals) not between 2 and 5 then
    raise exception 'Meal Plan должен содержать от 2 до 5 приёмов пищи';
  end if;

  select * into v_old
  from public.nutrition_plans
  where id=p_plan_id and client_id=v_user and status='active'
  for update;

  if not found then raise exception 'Активный Meal Plan не найден'; end if;

  v_budget:=v_old.daily_kcal_target-p_free_kcal_target;
  if v_budget<=0 then raise exception 'Недостаточно калорий для распределения'; end if;

  for v_meal in select value from jsonb_array_elements(p_meals)
  loop
    v_meal_target:=coalesce((v_meal->>'kcal_target')::integer,0);
    if v_meal_target<0 or v_meal_target>5000 then raise exception 'Некорректная калорийность приёма'; end if;
    v_sum:=v_sum+v_meal_target;
  end loop;

  if v_sum<>v_budget then
    raise exception 'По приёмам распределено % ккал, нужно % ккал',v_sum,v_budget;
  end if;

  perform pg_advisory_xact_lock(hashtext('nutrition:'||v_user::text));

  insert into public.nutrition_plans(
    family_id,client_id,name,description,daily_kcal_target,free_kcal_target,
    protein_target_g,fat_target_g,carbs_target_g,status,version,created_by,
    supersedes_plan_id,notes
  )
  values(
    v_old.family_id,v_user,v_old.name,v_old.description,v_old.daily_kcal_target,p_free_kcal_target,
    v_old.protein_target_g,v_old.fat_target_g,v_old.carbs_target_g,'draft',v_old.version+1,v_user,
    v_old.id,v_old.notes
  )
  returning id into v_new_id;

  v_sort:=0;
  for v_meal in select value from jsonb_array_elements(p_meals)
  loop
    v_sort:=v_sort+10;
    v_meal_type:=coalesce(nullif(v_meal->>'meal_type',''),'main');
    if v_meal_type not in ('main','light','snack') then raise exception 'Некорректный тип приёма'; end if;

    insert into public.nutrition_plan_meals(
      plan_id,name,meal_type,sort_order,kcal_target,target_locked,notes
    ) values(
      v_new_id,
      coalesce(nullif(btrim(v_meal->>'name'),''),'Приём пищи'),
      v_meal_type,
      v_sort,
      (v_meal->>'kcal_target')::integer,
      coalesce((v_meal->>'target_locked')::boolean,false),
      nullif(v_meal->>'notes','')
    )
    returning id into v_meal_id;

    if jsonb_typeof(v_meal->'variants')<>'array' or jsonb_array_length(v_meal->'variants')=0 then
      raise exception 'В каждом приёме нужен хотя бы один набор';
    end if;

    v_variant_sort:=0;
    for v_variant in select value from jsonb_array_elements(v_meal->'variants')
    loop
      v_variant_sort:=v_variant_sort+10;

      insert into public.nutrition_plan_meal_variants(
        meal_id,name,sort_order,is_default,notes
      ) values(
        v_meal_id,
        coalesce(nullif(btrim(v_variant->>'name'),''),'Основной вариант'),
        v_variant_sort,
        coalesce((v_variant->>'is_default')::boolean,v_variant_sort=10),
        nullif(v_variant->>'notes','')
      )
      returning id into v_variant_id;

      if jsonb_typeof(v_variant->'items')<>'array' or jsonb_array_length(v_variant->'items')=0 then
        raise exception 'Набор приёма не может быть пустым';
      end if;

      v_item_sort:=0;
      for v_item in select value from jsonb_array_elements(v_variant->'items')
      loop
        v_item_sort:=v_item_sort+10;
        if coalesce((v_item->>'grams')::numeric,0)<=0 or (v_item->>'grams')::numeric>10000 then
          raise exception 'Некорректная порция продукта';
        end if;
        if coalesce((v_item->>'kcal_100')::numeric,-1)<0
           or coalesce((v_item->>'protein_100')::numeric,-1)<0
           or coalesce((v_item->>'fat_100')::numeric,-1)<0
           or coalesce((v_item->>'carbs_100')::numeric,-1)<0 then
          raise exception 'Некорректные КБЖУ продукта';
        end if;

        v_food_id:=nullif(v_item->>'food_id','')::uuid;
        v_client_food_id:=nullif(v_item->>'client_food_id','')::uuid;

        if v_food_id is not null and v_client_food_id is not null then
          raise exception 'У продукта может быть только один источник';
        end if;
        if v_food_id is not null and not exists(
          select 1 from public.foods f where f.id=v_food_id and f.is_active=true
        ) then
          raise exception 'Продукт справочника не найден';
        end if;
        if v_client_food_id is not null and not exists(
          select 1 from public.client_foods cf
          where cf.id=v_client_food_id and cf.client_id=v_user and cf.is_active=true
        ) then
          raise exception 'Личный продукт не найден';
        end if;

        insert into public.nutrition_plan_meal_items(
          variant_id,food_id,client_food_id,food_name_snapshot,grams,
          kcal_100_snapshot,protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,
          is_fixed,sort_order,notes
        ) values(
          v_variant_id,v_food_id,v_client_food_id,
          coalesce(nullif(btrim(v_item->>'name'),''),'Продукт'),
          (v_item->>'grams')::numeric,
          (v_item->>'kcal_100')::numeric,
          (v_item->>'protein_100')::numeric,
          (v_item->>'fat_100')::numeric,
          (v_item->>'carbs_100')::numeric,
          coalesce((v_item->>'is_fixed')::boolean,false),
          v_item_sort,
          nullif(v_item->>'notes','')
        );
      end loop;
    end loop;
  end loop;

  update public.nutrition_plans
  set status='archived',updated_at=now()
  where client_id=v_user and status='active';

  update public.nutrition_plans
  set status='active',published_at=now(),updated_at=now()
  where id=v_new_id;

  return v_new_id;
end;
$function$;
