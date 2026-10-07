-- Trainer nutrition publish/template reliability smoke.
-- Uses existing trainer/client and food references; all mutations roll back.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_food uuid;
  v_template uuid;
  v_draft uuid;
  v_published_again uuid;
  v_assigned_one uuid;
  v_assigned_two uuid;
  v_assignment_before integer;
  v_assignment_after integer;
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
    raise exception 'QA trainer nutrition smoke requires one active trainer/client pair and food';
  end if;

  select count(*) into v_assignment_before
  from public.client_nutrition_assignments;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_trainer,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  v_payload:=jsonb_build_object(
    'client_id',null,
    'name','QA nutrition template '||gen_random_uuid()::text,
    'description','QA',
    'daily_kcal_target',2100,
    'protein_target_g',140,
    'fat_target_g',null,
    'carbs_target_g',null,
    'notes',null,
    'meals',jsonb_build_array(
      jsonb_build_object(
        'name','Завтрак',
        'meal_type','main',
        'kcal_target',600,
        'target_locked',false,
        'notes',null,
        'variants',jsonb_build_array(
          jsonb_build_object(
            'name','Основной',
            'is_default',true,
            'notes',null,
            'items',jsonb_build_array(
              jsonb_build_object(
                'food_id',v_food,
                'name','QA food',
                'grams',100,
                'kcal_100',100,
                'protein_100',10,
                'fat_100',1,
                'carbs_100',10,
                'is_fixed',false,
                'notes',null
              )
            )
          )
        )
      )
    )
  );

  select public.save_nutrition_plan(v_payload) into v_template;

  v_payload:=jsonb_set(v_payload,'{client_id}',to_jsonb(v_client::text),true);
  v_payload:=jsonb_set(v_payload,'{name}',to_jsonb('QA client draft '||gen_random_uuid()::text),true);
  select public.save_nutrition_plan(v_payload) into v_draft;

  perform public.publish_nutrition_plan(v_draft);
  select public.publish_nutrition_plan(v_draft) into v_published_again;

  if v_published_again is distinct from v_draft then
    raise exception 'Repeated publish returned a different plan';
  end if;

  if not exists(
    select 1 from public.nutrition_plans
    where id=v_draft and client_id=v_client and status='active'
  ) then
    raise exception 'Draft was not published';
  end if;

  select public.assign_nutrition_template(v_template,v_client) into v_assigned_one;
  select public.assign_nutrition_template(v_template,v_client) into v_assigned_two;

  if v_assigned_two is distinct from v_assigned_one then
    raise exception 'Repeated template assignment created a second plan';
  end if;

  if not exists(
    select 1
    from public.nutrition_plans
    where id=v_assigned_one
      and client_id=v_client
      and status='active'
      and source_template_plan_id=v_template
  ) then
    raise exception 'Assigned plan does not preserve source template identity';
  end if;

  if (
    select count(*)
    from public.nutrition_plans
    where client_id=v_client
      and status='active'
      and source_template_plan_id=v_template
  )<>1 then
    raise exception 'Expected exactly one active clone for the assigned template';
  end if;

  reset role;

  select count(*) into v_assignment_after
  from public.client_nutrition_assignments;

  if v_assignment_after<>v_assignment_before then
    raise exception 'Current nutrition flow unexpectedly wrote legacy client_nutrition_assignments';
  end if;
end $$;

rollback;
