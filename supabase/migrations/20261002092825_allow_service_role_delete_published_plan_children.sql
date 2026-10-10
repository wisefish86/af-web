
create or replace function public.guard_training_program_child()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_day_id uuid;
  v_program_id uuid;
  v_status text;
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_table_name='training_days' then
    v_program_id:=case when tg_op='DELETE' then old.program_id else new.program_id end;
  elsif tg_table_name='program_exercises' then
    v_day_id:=case when tg_op='DELETE' then old.training_day_id else new.training_day_id end;
    select td.program_id into v_program_id from public.training_days td where td.id=v_day_id;
  elsif tg_table_name='program_cardio_blocks' then
    v_day_id:=case when tg_op='DELETE' then old.training_day_id else new.training_day_id end;
    select td.program_id into v_program_id from public.training_days td where td.id=v_day_id;
  end if;

  if v_program_id is not null then
    select tp.status into v_status from public.training_programs tp where tp.id=v_program_id;
    if v_status is distinct from 'draft' then
      raise exception 'Published training program content is immutable; create a new version';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

create or replace function public.guard_nutrition_plan_child()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_plan_id uuid;
  v_meal_id uuid;
  v_variant_id uuid;
  v_status text;
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_table_name='nutrition_plan_meals' then
    v_plan_id:=case when tg_op='DELETE' then old.plan_id else new.plan_id end;
  elsif tg_table_name='nutrition_plan_meal_variants' then
    v_meal_id:=case when tg_op='DELETE' then old.meal_id else new.meal_id end;
    select m.plan_id into v_plan_id from public.nutrition_plan_meals m where m.id=v_meal_id;
  elsif tg_table_name='nutrition_plan_meal_items' then
    v_variant_id:=case when tg_op='DELETE' then old.variant_id else new.variant_id end;
    select m.plan_id into v_plan_id
    from public.nutrition_plan_meal_variants v
    join public.nutrition_plan_meals m on m.id=v.meal_id
    where v.id=v_variant_id;
  end if;

  if v_plan_id is not null then
    select p.status into v_status from public.nutrition_plans p where p.id=v_plan_id;
    if v_status is distinct from 'draft' then
      raise exception 'Published nutrition plan content is immutable; create a new version';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;
