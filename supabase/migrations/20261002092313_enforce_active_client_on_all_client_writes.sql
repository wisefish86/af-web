
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
    'measurements','daily_checkins','monthly_checkins','client_task_completions',
    'client_tracking_preferences','client_nutrition_setup','client_foods',
    'client_food_preferences','client_food_group_preferences',
    'client_material_checklist_state','meal_templates','meal_slots','reminder_rules',
    'nutrition_plans','feedback_threads','feedback_messages','workout_sessions',
    'workout_exercises','workout_sets','workout_cardio_entries'
  ]
  loop
    execute format('drop trigger if exists guard_active_client_write on public.%I',t);
    execute format(
      'create trigger guard_active_client_write before insert or update or delete on public.%I for each row execute function private.guard_client_write_requires_active_link()',
      t
    );
  end loop;
end $$;

create or replace function public.update_my_profile(
  p_display_name text,
  p_nickname text,
  p_age smallint,
  p_city text,
  p_timezone text,
  p_avatar_key text
) returns void
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_display_name),'');
  v_nickname text:=nullif(btrim(p_nickname),'');
  v_city text:=nullif(btrim(p_city),'');
  v_role text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id=v_user;
  if v_role='client' and not exists(
    select 1 from public.coach_clients where client_id=v_user and status='active'
  ) then raise exception 'Client access is inactive'; end if;

  if v_name is null then raise exception 'Укажи имя.'; end if;
  if length(v_name)>60 then raise exception 'Имя слишком длинное.'; end if;
  if v_nickname is not null and length(v_nickname)>40 then raise exception 'Метка слишком длинная.'; end if;
  if p_age is not null and (p_age<13 or p_age>100) then raise exception 'Возраст должен быть от 13 до 100 лет.'; end if;
  if v_city is not null and length(v_city)>80 then raise exception 'Название города слишком длинное.'; end if;
  if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then
    raise exception 'Unknown timezone';
  end if;

  update public.profiles
  set display_name=v_name,
      nickname=v_nickname,
      age=p_age,
      city=v_city,
      timezone=p_timezone,
      avatar_key=nullif(btrim(p_avatar_key),''),
      updated_at=now()
  where id=v_user;

  if not found then raise exception 'Profile not found'; end if;
end;
$function$;

create or replace function public.complete_my_access_setup(p_display_name text)
returns text
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_name text:=nullif(btrim(p_display_name),'');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.coach_clients where client_id=v_user and status='active') then
    raise exception 'Client access is inactive';
  end if;
  if v_name is null then raise exception 'Укажи имя.'; end if;
  if length(v_name)>60 then raise exception 'Имя слишком длинное.'; end if;

  update public.profiles
  set display_name=v_name,
      must_set_password=false,
      updated_at=now()
  where id=v_user and role='client';

  if not found then raise exception 'Client profile not found'; end if;
  return v_name;
end;
$function$;
