create or replace function private.rebalance_nutrition_plan_free_target(
  p_plan_id uuid,
  p_free_kcal_target integer default null
)
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
  v_free:=coalesce(p_free_kcal_target,v_free);
  if v_free=0 then return; end if;
  if v_free not between 200 and 300 then raise exception 'Invalid free kcal target'; end if;

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

revoke all on function private.rebalance_nutrition_plan_free_target(uuid,integer) from public,anon,authenticated;

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
    perform private.rebalance_nutrition_plan_free_target(new.id,new.free_kcal_target);
  end if;
  return new;
end;
$function$;
