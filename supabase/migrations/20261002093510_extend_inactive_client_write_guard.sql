
create or replace function private.guard_client_write_requires_active_link()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_client uuid;
  v_row jsonb;
  v_parent uuid;
begin
  if v_actor is null then return coalesce(new,old); end if;

  select role into v_actor_role from public.profiles where id=v_actor;
  if v_actor_role is distinct from 'client' then return coalesce(new,old); end if;

  v_row:=coalesce(to_jsonb(new),to_jsonb(old));

  if tg_table_name in (
    'measurements','daily_checkins','monthly_checkins','client_task_completions',
    'client_tracking_preferences','client_nutrition_setup','client_foods',
    'client_food_preferences','client_food_group_preferences',
    'client_material_checklist_state','meal_templates','reminder_rules',
    'nutrition_plans','feedback_threads','workout_sessions'
  ) then
    v_client:=nullif(v_row->>'client_id','')::uuid;

  elsif tg_table_name='notification_preferences' then
    v_client:=nullif(v_row->>'user_id','')::uuid;

  elsif tg_table_name='saved_meals' then
    v_client:=nullif(v_row->>'created_by','')::uuid;

  elsif tg_table_name='saved_meal_items' then
    v_parent:=nullif(v_row->>'saved_meal_id','')::uuid;
    select created_by into v_client from public.saved_meals where id=v_parent;

  elsif tg_table_name='nutrition_plan_meals' then
    v_parent:=nullif(v_row->>'plan_id','')::uuid;
    select client_id into v_client from public.nutrition_plans where id=v_parent;

  elsif tg_table_name='nutrition_plan_meal_variants' then
    v_parent:=nullif(v_row->>'meal_id','')::uuid;
    select p.client_id into v_client
    from public.nutrition_plan_meals m
    join public.nutrition_plans p on p.id=m.plan_id
    where m.id=v_parent;

  elsif tg_table_name='nutrition_plan_meal_items' then
    v_parent:=nullif(v_row->>'variant_id','')::uuid;
    select p.client_id into v_client
    from public.nutrition_plan_meal_variants v
    join public.nutrition_plan_meals m on m.id=v.meal_id
    join public.nutrition_plans p on p.id=m.plan_id
    where v.id=v_parent;

  elsif tg_table_name='meal_slots' then
    v_parent:=nullif(v_row->>'meal_template_id','')::uuid;
    select client_id into v_client from public.meal_templates where id=v_parent;

  elsif tg_table_name='workout_exercises' then
    v_parent:=nullif(v_row->>'workout_session_id','')::uuid;
    select client_id into v_client from public.workout_sessions where id=v_parent;

  elsif tg_table_name='workout_sets' then
    v_parent:=nullif(v_row->>'workout_exercise_id','')::uuid;
    select ws.client_id into v_client
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=v_parent;

  elsif tg_table_name='workout_cardio_entries' then
    v_parent:=nullif(v_row->>'workout_session_id','')::uuid;
    select client_id into v_client from public.workout_sessions where id=v_parent;

  elsif tg_table_name='feedback_messages' then
    v_parent:=nullif(v_row->>'thread_id','')::uuid;
    select client_id into v_client from public.feedback_threads where id=v_parent;
  end if;

  if v_client is null then
    raise exception 'Client context not found';
  end if;

  if v_client<>v_actor then
    raise exception 'Client cannot write another client data';
  end if;

  if not exists(
    select 1 from public.coach_clients cc
    where cc.client_id=v_actor and cc.status='active'
  ) then
    raise exception 'Client access is inactive';
  end if;

  return coalesce(new,old);
end;
$function$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'notification_preferences','saved_meals','saved_meal_items',
    'nutrition_plan_meals','nutrition_plan_meal_variants','nutrition_plan_meal_items'
  ]
  loop
    execute format('drop trigger if exists guard_active_client_write on public.%I',t);
    execute format(
      'create trigger guard_active_client_write before insert or update or delete on public.%I for each row execute function private.guard_client_write_requires_active_link()',
      t
    );
  end loop;
end $$;
