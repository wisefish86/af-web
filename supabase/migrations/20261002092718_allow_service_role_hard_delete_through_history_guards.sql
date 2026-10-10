
create or replace function public.guard_completed_workout_session()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if old.status='completed' then
    if tg_op='UPDATE'
       and old.client_id=auth.uid()
       and new.status='in_progress'
       and new.id=old.id
       and new.client_id=old.client_id
       and new.training_day_id is not distinct from old.training_day_id
       and new.started_at is not distinct from old.started_at
       and (old.completed_at at time zone 'Europe/Moscow')::date=(now() at time zone 'Europe/Moscow')::date
    then
      return new;
    end if;
    raise exception 'Completed workout history is immutable';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

create or replace function public.guard_completed_workout_child()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_session_id uuid;
  v_status text;
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_table_name in ('workout_exercises','workout_cardio_entries') then
    v_session_id:=case when tg_op='DELETE' then old.workout_session_id else new.workout_session_id end;
  elsif tg_table_name='workout_sets' then
    select we.workout_session_id into v_session_id
    from public.workout_exercises we
    where we.id=case when tg_op='DELETE' then old.workout_exercise_id else new.workout_exercise_id end;
  end if;

  select status into v_status from public.workout_sessions where id=v_session_id;
  if v_status='completed' then
    raise exception 'Completed workout history is immutable';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

create or replace function public.guard_published_nutrition_plan()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $function$
begin
  if auth.role()='service_role' then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Published nutrition plans are immutable; archive instead';
    end if;
    return old;
  end if;

  if old.status<>'draft' then
    if (to_jsonb(new)-array['status','updated_at']::text[])
       is distinct from
       (to_jsonb(old)-array['status','updated_at']::text[]) then
      raise exception 'Published nutrition plan content is immutable; create a new version';
    end if;

    if old.status='archived' and new.status<>'archived' then
      raise exception 'Archived nutrition plan cannot be reactivated; clone it as a new version';
    end if;

    if old.status='active' and new.status not in ('active','archived') then
      raise exception 'Active nutrition plan can only remain active or be archived';
    end if;
  end if;

  return new;
end;
$function$;
