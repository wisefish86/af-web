-- QA-6 rollover/reopen/reminder occurrence reliability smoke.
-- All mutations roll back.

begin;

do $$
declare
  v_client uuid;
  v_now timestamptz:=now();
  v_timezone text:='Europe/Berlin';
  v_local_today date;
  v_started timestamptz;
  v_session uuid;
  v_reopened uuid;
  v_same_day_session uuid;
  v_rule uuid;
  v_occurrence date;
  v_count integer;
begin
  select p.id into v_client
  from public.profiles p
  where p.role='client'
    and not exists(
      select 1 from public.workout_sessions ws
      where ws.client_id=p.id and ws.status='in_progress'
    )
  order by p.created_at
  limit 1;

  if v_client is null then
    raise exception 'QA-6 rollover smoke requires an idle client';
  end if;

  update public.profiles
  set timezone=v_timezone,updated_at=now()
  where id=v_client;

  v_local_today:=(v_now at time zone v_timezone)::date;
  v_started:=((v_local_today-1)::timestamp + time '23:30') at time zone v_timezone;

  insert into public.workout_sessions(
    client_id,status,started_at,updated_at,planned_duration_minutes_snapshot
  ) values (
    v_client,'in_progress',v_started,v_started,60
  ) returning id into v_session;

  perform public.auto_complete_stale_workouts_service(v_now);

  if not exists(
    select 1 from public.workout_sessions
    where id=v_session and status='completed' and completed_at is not null
  ) then
    raise exception 'Previous-local-day workout was not auto-completed';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  begin
    perform public.reopen_my_workout(v_session);
    raise exception 'EXPECTED_PREVIOUS_DAY_REOPEN_REJECTION_MISSING';
  exception when others then
    if sqlerrm='EXPECTED_PREVIOUS_DAY_REOPEN_REJECTION_MISSING' then raise; end if;
    if position('Прошлую тренировку можно только посмотреть в истории' in sqlerrm)=0 then raise; end if;
  end;

  reset role;

  insert into public.workout_sessions(
    client_id,status,started_at,completed_at,updated_at,planned_duration_minutes_snapshot
  ) values (
    v_client,'completed',v_now-interval '90 minutes',v_now-interval '15 minutes',v_now,60
  ) returning id into v_same_day_session;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_client,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  v_reopened:=public.reopen_my_workout(v_same_day_session);
  if v_reopened is distinct from v_same_day_session then
    raise exception 'Same-day completed workout did not reopen as the same session';
  end if;

  reset role;

  perform public.auto_complete_stale_workouts_service(v_now + interval '1 hour');

  if not exists(
    select 1 from public.workout_sessions
    where id=v_same_day_session
      and status='in_progress'
      and completed_at is null
      and (reopened_at at time zone v_timezone)::date=v_local_today
  ) then
    raise exception 'Same-local-day reopened workout was auto-completed prematurely';
  end if;

  insert into public.notification_preferences(
    user_id,in_app_enabled,telegram_enabled,web_push_enabled,
    quiet_hours_enabled,timezone
  ) values (
    v_client,true,false,false,false,v_timezone
  )
  on conflict(user_id) do update
  set in_app_enabled=true,telegram_enabled=false,web_push_enabled=false,
      quiet_hours_enabled=false,timezone=excluded.timezone,updated_at=now();

  insert into public.reminder_rules(
    client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,
    enabled,settings,created_by,name,channels,recipient_mode,skip_if_completed,
    title_template,body_template,action_path,last_processed_local_date,updated_at
  ) values (
    v_client,null,'qa6_occurrence','in_app','00:00:00',
    array[1,2,3,4,5,6,7],v_timezone,true,'{}'::jsonb,
    v_client,'QA occurrence',array['in_app'],'client',false,
    'QA occurrence','QA occurrence body','/',null,now()
  )
  returning id into v_rule;

  v_occurrence:=(v_now at time zone v_timezone)::date;

  perform public.enqueue_due_reminders(v_now);
  perform public.enqueue_due_reminders(v_now);

  select count(*) into v_count
  from public.notification_deliveries
  where reminder_rule_id=v_rule
    and recipient_id=v_client
    and channel='in_app'
    and occurrence_date=v_occurrence;

  if v_count<>1 then
    raise exception 'Repeated reminder enqueue produced % occurrences instead of 1',v_count;
  end if;

  if not exists(
    select 1 from public.notification_deliveries
    where reminder_rule_id=v_rule
      and status='sent'
      and delivered_at is not null
  ) then
    raise exception 'In-app reminder occurrence was not delivered';
  end if;
end $$;

rollback;
