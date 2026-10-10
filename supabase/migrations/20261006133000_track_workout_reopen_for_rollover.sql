alter table public.workout_sessions
  add column if not exists reopened_at timestamptz;

create or replace function public.reopen_my_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.workout_sessions%rowtype;
  v_existing uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select * into v_session
  from public.workout_sessions
  where id=p_workout_session_id and client_id=v_user
  for update;

  if not found then raise exception 'Тренировка не найдена.'; end if;
  if v_session.status='in_progress' then return v_session.id; end if;
  if v_session.status<>'completed' then raise exception 'Эту тренировку нельзя возобновить.'; end if;

  select ws.id into v_existing
  from public.workout_sessions ws
  where ws.client_id=v_user
    and ws.status='in_progress'
    and ws.id<>p_workout_session_id
  order by ws.started_at desc
  limit 1;

  if v_existing is not null then return v_existing; end if;

  update public.workout_sessions
  set status='in_progress',
      completed_at=null,
      reopened_at=now(),
      updated_at=now(),
      active_workout_exercise_id=null,
      rest_timer_end_at=null,
      rest_timer_name=null
  where id=p_workout_session_id and client_id=v_user;

  return p_workout_session_id;
end;
$function$;

create or replace function public.auto_complete_stale_workouts_service(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  r record;
  v_last_activity timestamptz;
  v_fallback timestamptz;
  v_completed timestamptz;
  v_count integer:=0;
begin
  for r in
    select
      ws.id,
      ws.started_at,
      coalesce(ws.reopened_at,ws.started_at) as anchor_at,
      ws.planned_duration_minutes_snapshot,
      coalesce(nullif(p.timezone,''),'Europe/Moscow') as timezone
    from public.workout_sessions ws
    join public.profiles p on p.id=ws.client_id
    where ws.status='in_progress'
      and (coalesce(ws.reopened_at,ws.started_at) at time zone coalesce(nullif(p.timezone,''),'Europe/Moscow'))::date
        < (p_now at time zone coalesce(nullif(p.timezone,''),'Europe/Moscow'))::date
    for update of ws skip locked
  loop
    select max(x.completed_at) into v_last_activity
    from (
      select s.completed_at
      from public.workout_sets s
      join public.workout_exercises e on e.id=s.workout_exercise_id
      where e.workout_session_id=r.id
        and s.completed_at is not null
        and s.completed_at>=r.anchor_at
      union all
      select e.completed_at
      from public.workout_exercises e
      where e.workout_session_id=r.id
        and e.completed_at is not null
        and e.completed_at>=r.anchor_at
      union all
      select c.completed_at
      from public.workout_cardio_entries c
      where c.workout_session_id=r.id
        and c.completed_at is not null
        and c.completed_at>=r.anchor_at
    ) x;

    v_fallback:=r.anchor_at
      + make_interval(mins=>least(240,greatest(30,coalesce(r.planned_duration_minutes_snapshot,60))));

    v_completed:=least(
      p_now,
      r.anchor_at + interval '4 hours',
      greatest(r.anchor_at + interval '5 minutes',coalesce(v_last_activity,v_fallback))
    );

    update public.workout_sessions
    set status='completed',
        completed_at=v_completed,
        updated_at=p_now,
        active_workout_exercise_id=null,
        rest_timer_end_at=null,
        rest_timer_name=null
    where id=r.id and status='in_progress';

    if found then v_count:=v_count+1; end if;
  end loop;

  return v_count;
end;
$function$;
