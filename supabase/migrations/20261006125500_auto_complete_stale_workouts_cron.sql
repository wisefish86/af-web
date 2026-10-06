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
      ws.planned_duration_minutes_snapshot,
      coalesce(nullif(p.timezone,''),'Europe/Moscow') as timezone
    from public.workout_sessions ws
    join public.profiles p on p.id=ws.client_id
    where ws.status='in_progress'
      and (ws.started_at at time zone coalesce(nullif(p.timezone,''),'Europe/Moscow'))::date
        < (p_now at time zone coalesce(nullif(p.timezone,''),'Europe/Moscow'))::date
    for update of ws skip locked
  loop
    select max(x.completed_at) into v_last_activity
    from (
      select s.completed_at
      from public.workout_sets s
      join public.workout_exercises e on e.id=s.workout_exercise_id
      where e.workout_session_id=r.id and s.completed_at is not null
      union all
      select e.completed_at
      from public.workout_exercises e
      where e.workout_session_id=r.id and e.completed_at is not null
      union all
      select c.completed_at
      from public.workout_cardio_entries c
      where c.workout_session_id=r.id and c.completed_at is not null
    ) x;

    v_fallback:=r.started_at
      + make_interval(mins=>least(240,greatest(30,coalesce(r.planned_duration_minutes_snapshot,60))));

    v_completed:=least(
      p_now,
      r.started_at + interval '4 hours',
      greatest(r.started_at + interval '5 minutes',coalesce(v_last_activity,v_fallback))
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

revoke all on function public.auto_complete_stale_workouts_service(timestamptz) from public,anon,authenticated;
grant execute on function public.auto_complete_stale_workouts_service(timestamptz) to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname='andrey-fit-auto-complete-stale-workouts';

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'andrey-fit-auto-complete-stale-workouts',
    '* * * * *',
    'select public.auto_complete_stale_workouts_service(now());'
  );
end $$;
