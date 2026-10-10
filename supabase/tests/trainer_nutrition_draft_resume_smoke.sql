-- Saved trainer nutrition draft must be readable back through authenticated RLS.
-- All rows roll back.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_food uuid;
  v_plan uuid;
  v_meal uuid;
  v_variant uuid;
  v_count integer;
  v_payload jsonb;
begin
  select cc.coach_id,cc.client_id
  into v_trainer,v_client
  from public.coach_clients cc
  join public.profiles t on t.id=cc.coach_id and t.role='trainer'
  join public.profiles c on c.id=cc.client_id and c.role='client'
  where cc.status='active'
  order by cc.started_at
  limit 1;

  select id into v_food
  from public.foods
  where is_active=true
  order by created_at
  limit 1;

  if v_trainer is null or v_client is null or v_food is null then
    raise exception 'QA nutrition draft resume smoke requires trainer/client/food';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_trainer,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  v_payload:=jsonb_build_object(
    'client_id',v_client,
    'name','QA resume draft '||gen_random_uuid()::text,
    'daily_kcal_target',2200,
    'protein_target_g',150,
    'meals',jsonb_build_array(
      jsonb_build_object(
        'name','Обед',
        'meal_type','main',
        'kcal_target',800,
        'target_locked',false,
        'variants',jsonb_build_array(
          jsonb_build_object(
            'name','Основной',
            'is_default',true,
            'items',jsonb_build_array(
              jsonb_build_object('food_id',v_food,'grams',120,'is_fixed',false)
            )
          )
        )
      )
    )
  );

  select public.save_nutrition_plan(v_payload) into v_plan;

  select count(*) into v_count
  from public.nutrition_plans
  where id=v_plan and created_by=v_trainer and client_id=v_client and status='draft';
  if v_count<>1 then raise exception 'Saved draft is not readable through trainer RLS'; end if;

  select id into v_meal
  from public.nutrition_plan_meals
  where plan_id=v_plan
  limit 1;
  if v_meal is null then raise exception 'Saved draft meal is not readable'; end if;

  select id into v_variant
  from public.nutrition_plan_meal_variants
  where meal_id=v_meal
  limit 1;
  if v_variant is null then raise exception 'Saved draft variant is not readable'; end if;

  select count(*) into v_count
  from public.nutrition_plan_meal_items
  where variant_id=v_variant;
  if v_count<>1 then raise exception 'Saved draft item graph is not readable'; end if;

  reset role;
end $$;

rollback;
