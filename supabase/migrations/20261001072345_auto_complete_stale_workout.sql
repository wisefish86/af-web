create or replace function public.auto_complete_stale_workout(p_workout_session_id uuid)
returns timestamptz
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.workout_sessions%rowtype;
  v_tz text:='Europe/Moscow';
  v_last_activity timestamptz;
  v_fallback timestamptz;
  v_completed timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_session
  from public.workout_sessions
  where id=p_workout_session_id
    and client_id=v_user
    and status='in_progress'
  for update;

  if not found then raise exception 'Workout not found or already completed'; end if;

  select coalesce(nullif(timezone,''),'Europe/Moscow')
  into v_tz
  from public.profiles
  where id=v_user;

  if (v_session.started_at at time zone v_tz)::date >= (now() at time zone v_tz)::date then
    raise exception 'Workout is still from today';
  end if;

  select max(x.completed_at) into v_last_activity
  from (
    select s.completed_at
    from public.workout_sets s
    join public.workout_exercises e on e.id=s.workout_exercise_id
    where e.workout_session_id=v_session.id and s.completed_at is not null
    union all
    select e.completed_at
    from public.workout_exercises e
    where e.workout_session_id=v_session.id and e.completed_at is not null
    union all
    select c.completed_at
    from public.workout_cardio_entries c
    where c.workout_session_id=v_session.id and c.completed_at is not null
  ) x;

  v_fallback:=v_session.started_at
    + make_interval(mins=>least(240,greatest(30,coalesce(v_session.planned_duration_minutes_snapshot,60))));

  v_completed:=least(
    now(),
    v_session.started_at + interval '4 hours',
    greatest(v_session.started_at + interval '5 minutes',coalesce(v_last_activity,v_fallback))
  );

  update public.workout_sessions
  set status='completed',
      completed_at=v_completed,
      updated_at=now(),
      active_workout_exercise_id=null,
      rest_timer_end_at=null,
      rest_timer_name=null
  where id=v_session.id;

  return v_completed;
end;
$function$;

revoke execute on function public.auto_complete_stale_workout(uuid) from public,anon;
grant execute on function public.auto_complete_stale_workout(uuid) to authenticated;
