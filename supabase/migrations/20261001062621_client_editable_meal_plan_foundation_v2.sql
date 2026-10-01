alter table public.nutrition_plans
  add column if not exists free_kcal_target integer not null default 0;

alter table public.nutrition_plans
  drop constraint if exists nutrition_plans_free_kcal_target_check;

alter table public.nutrition_plans
  add constraint nutrition_plans_free_kcal_target_check
  check (free_kcal_target=0 or free_kcal_target between 200 and 300);

create schema if not exists private;

create or replace function private.rebalance_nutrition_plan_free_target(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_daily integer;
  v_free integer;
  v_budget integer;
  v_total integer;
  v_count integer;
  v_idx integer:=0;
  v_assigned integer:=0;
  v_target integer;
  v_fixed numeric;
  v_flex numeric;
  v_factor numeric;
  m record;
  v record;
begin
  select daily_kcal_target,free_kcal_target
  into v_daily,v_free
  from public.nutrition_plans
  where id=p_plan_id
  for update;

  if not found then raise exception 'Meal Plan not found'; end if;
  if v_free=0 then return; end if;

  v_budget:=greatest(0,v_daily-v_free);

  select count(*),coalesce(sum(kcal_target),0)
  into v_count,v_total
  from public.nutrition_plan_meals
  where plan_id=p_plan_id;

  if v_count=0 then return; end if;
  if v_total<=0 then v_total:=v_count; end if;

  for m in
    select id,kcal_target
    from public.nutrition_plan_meals
    where plan_id=p_plan_id
    order by sort_order,id
  loop
    v_idx:=v_idx+1;
    if v_idx=v_count then
      v_target:=greatest(0,v_budget-v_assigned);
    else
      v_target:=round(v_budget*(greatest(1,m.kcal_target)::numeric/v_total))::integer;
      v_target:=greatest(0,v_target);
      v_assigned:=v_assigned+v_target;
    end if;

    update public.nutrition_plan_meals
    set kcal_target=v_target
    where id=m.id;

    for v in
      select id
      from public.nutrition_plan_meal_variants
      where meal_id=m.id
    loop
      select
        coalesce(sum(case when is_fixed then grams*kcal_100_snapshot/100 else 0 end),0),
        coalesce(sum(case when not is_fixed then grams*kcal_100_snapshot/100 else 0 end),0)
      into v_fixed,v_flex
      from public.nutrition_plan_meal_items
      where variant_id=v.id;

      if v_flex>0 then
        v_factor:=greatest(0.01,(v_target-v_fixed)/v_flex);
        update public.nutrition_plan_meal_items
        set grams=least(10000,greatest(1,round(grams*v_factor)))
        where variant_id=v.id and not is_fixed;
      end if;
    end loop;
  end loop;
end;
$function$;

revoke all on function private.rebalance_nutrition_plan_free_target(uuid) from public,anon,authenticated;

create or replace function private.apply_client_meal_plan_free_target()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if new.status='active'
     and old.status is distinct from 'active'
     and new.client_id is not null
     and new.client_id=new.created_by then
    if new.free_kcal_target=0 then new.free_kcal_target:=250; end if;
    perform private.rebalance_nutrition_plan_free_target(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_apply_client_meal_plan_free_target on public.nutrition_plans;
create trigger trg_apply_client_meal_plan_free_target
before update of status on public.nutrition_plans
for each row execute function private.apply_client_meal_plan_free_target();

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

        insert into public.nutrition_plan_meal_items(
          variant_id,food_id,food_name_snapshot,grams,
          kcal_100_snapshot,protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,
          is_fixed,sort_order,notes
        ) values(
          v_variant_id,
          nullif(v_item->>'food_id','')::uuid,
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

revoke execute on function public.save_my_meal_plan_version(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_my_meal_plan_version(uuid,integer,jsonb) to authenticated;
