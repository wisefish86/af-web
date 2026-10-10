-- Trainer revision of a client-owned active Meal Plan must be retry-safe,
-- preserve the full plan graph, and publish as a normal next version.

begin;

do $$
declare
  v_trainer uuid;
  v_client uuid;
  v_source uuid;
  v_source_family uuid;
  v_source_version integer;
  v_revision_one uuid;
  v_revision_two uuid;
  v_source_meals integer;
  v_revision_meals integer;
  v_source_variants integer;
  v_revision_variants integer;
  v_source_items integer;
  v_revision_items integer;
begin
  select cc.coach_id,cc.client_id,p.id,p.family_id,p.version
  into v_trainer,v_client,v_source,v_source_family,v_source_version
  from public.coach_clients cc
  join public.nutrition_plans p on p.client_id=cc.client_id and p.status='active'
  join public.profiles t on t.id=cc.coach_id and t.role='trainer'
  where cc.status='active'
  order by p.updated_at desc
  limit 1;

  if v_trainer is null or v_source is null then
    raise exception 'QA nutrition revision smoke requires an active trainer/client Meal Plan';
  end if;

  select count(*) into v_source_meals
  from public.nutrition_plan_meals m where m.plan_id=v_source;

  select count(*) into v_source_variants
  from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  where m.plan_id=v_source;

  select count(*) into v_source_items
  from public.nutrition_plan_meal_items i
  join public.nutrition_plan_meal_variants v on v.id=i.variant_id
  join public.nutrition_plan_meals m on m.id=v.meal_id
  where m.plan_id=v_source;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_trainer,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  select public.create_nutrition_plan_revision(v_source) into v_revision_one;
  select public.create_nutrition_plan_revision(v_source) into v_revision_two;

  if v_revision_two is distinct from v_revision_one then
    raise exception 'Repeated revision request created a second draft';
  end if;

  if not exists(
    select 1
    from public.nutrition_plans p
    where p.id=v_revision_one
      and p.client_id=v_client
      and p.family_id=v_source_family
      and p.version=v_source_version+1
      and p.status='draft'
      and p.created_by=v_trainer
      and p.supersedes_plan_id=v_source
  ) then
    raise exception 'Trainer revision metadata is incorrect';
  end if;

  select count(*) into v_revision_meals
  from public.nutrition_plan_meals m where m.plan_id=v_revision_one;

  select count(*) into v_revision_variants
  from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  where m.plan_id=v_revision_one;

  select count(*) into v_revision_items
  from public.nutrition_plan_meal_items i
  join public.nutrition_plan_meal_variants v on v.id=i.variant_id
  join public.nutrition_plan_meals m on m.id=v.meal_id
  where m.plan_id=v_revision_one;

  if v_revision_meals<>v_source_meals
     or v_revision_variants<>v_source_variants
     or v_revision_items<>v_source_items then
    raise exception 'Revision child graph differs from source: meals %/% variants %/% items %/%',
      v_revision_meals,v_source_meals,v_revision_variants,v_source_variants,v_revision_items,v_source_items;
  end if;

  perform public.publish_nutrition_plan(v_revision_one);

  if not exists(
    select 1 from public.nutrition_plans
    where id=v_revision_one and status='active'
  ) then
    raise exception 'Revision did not become active';
  end if;

  if not exists(
    select 1 from public.nutrition_plans
    where id=v_source and status='archived'
  ) then
    raise exception 'Source active plan was not archived after revision publish';
  end if;

  reset role;
end $$;

rollback;
