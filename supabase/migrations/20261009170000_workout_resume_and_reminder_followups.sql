create or replace function public.reopen_my_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.workout_sessions%rowtype;
  v_existing uuid;
  v_timezone text:='Europe/Moscow';
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select coalesce(nullif(p.timezone,''),'Europe/Moscow')
  into v_timezone
  from public.profiles p
  where p.id=v_user;

  select * into v_session
  from public.workout_sessions
  where id=p_workout_session_id and client_id=v_user
  for update;

  if not found then raise exception 'Тренировка не найдена.'; end if;
  if v_session.status='in_progress' then return v_session.id; end if;
  if v_session.status<>'completed' then raise exception 'Эту тренировку нельзя возобновить.'; end if;

  if (v_session.started_at at time zone v_timezone)::date <> (now() at time zone v_timezone)::date then
    raise exception 'Прошлую тренировку можно только посмотреть в истории. Сегодня начни новую.';
  end if;

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

revoke execute on function public.reopen_my_workout(uuid) from public,anon;
grant execute on function public.reopen_my_workout(uuid) to authenticated;

update public.reminder_rules
set settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{followup_time}',to_jsonb(case reminder_type when 'weight' then '20:30' else '20:40' end),true),
    channels=(select array_agg(distinct c order by c) from unnest(coalesce(channels,'{}'::text[])||array['in_app','telegram']::text[]) c),
    updated_at=now()
where reminder_type in ('weight','waist');

insert into public.reminder_rules(
  client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,enabled,settings,
  created_by,name,channels,recipient_mode,skip_if_completed,title_template,body_template,action_path
)
select
  p.id,'nutrition','nutrition','in_app','21:00',array[1,2,3,4,5,6,7],
  coalesce(nullif(p.timezone,''),'Europe/Moscow'),true,'{}'::jsonb,
  coalesce((
    select cc.coach_id
    from public.coach_clients cc
    where cc.client_id=p.id and cc.status='active'
    order by cc.started_at desc nulls last
    limit 1
  ),p.id),
  'Питание за день',array['in_app','telegram'],'client',true,
  'Питание за день',
  'Заверши дневную отметку питания. В режиме подсчёта внеси калории и белок; в Meal Plan отметь соблюдение.',
  '/nutrition'
from public.profiles p
where p.role='client'
  and exists(
    select 1 from public.client_modules cm
    where cm.client_id=p.id and cm.module_code='nutrition' and cm.enabled=true
  )
on conflict(client_id,reminder_type) do nothing;

insert into public.reminder_rules(
  client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,enabled,settings,
  created_by,name,channels,recipient_mode,skip_if_completed,title_template,body_template,action_path
)
select
  p.id,'checkins','daily_checkin','in_app','21:10',array[1,2,3,4,5,6,7],
  coalesce(nullif(p.timezone,''),'Europe/Moscow'),true,'{}'::jsonb,
  coalesce((
    select cc.coach_id
    from public.coach_clients cc
    where cc.client_id=p.id and cc.status='active'
    order by cc.started_at desc nulls last
    limit 1
  ),p.id),
  'Самочувствие',array['in_app','telegram'],'client',true,
  'Как самочувствие?',
  'Коротко отметь энергию, сон, стресс, голод и лёгкость соблюдения питания.',
  '/'
from public.profiles p
where p.role='client'
  and exists(
    select 1 from public.client_modules cm
    where cm.client_id=p.id and cm.module_code='checkins' and cm.enabled=true
  )
on conflict(client_id,reminder_type) do nothing;

create unique index if not exists notification_followup_occurrence_uq
on public.notification_deliveries(
  recipient_id,
  channel,
  occurrence_date,
  ((payload->>'followup_of'))
)
where (payload->>'kind')='reminder_followup'
  and occurrence_date is not null;

create or replace function public.enqueue_missed_reminder_followups(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  r public.reminder_rules%rowtype;
  v_local_date date;
  v_local_time time;
  v_followup_time time;
  v_dow integer;
  v_due_at timestamptz;
  v_channel_due timestamptz;
  v_channel text;
  v_pref public.notification_preferences%rowtype;
  v_count integer:=0;
  v_title text;
  v_body text;
begin
  for r in
    select *
    from public.reminder_rules
    where enabled=true
      and reminder_type in ('weight','waist')
      and nullif(settings->>'followup_time','') is not null
      and recipient_mode in ('client','both')
  loop
    v_local_date:=(p_now at time zone r.timezone)::date;
    v_local_time:=(p_now at time zone r.timezone)::time;
    v_dow:=extract(isodow from v_local_date)::integer;
    v_followup_time:=(r.settings->>'followup_time')::time;

    if r.module_code is not null and not exists(
      select 1 from public.client_modules cm
      where cm.client_id=r.client_id
        and cm.module_code=r.module_code
        and cm.enabled=true
        and cm.starts_at<=v_local_date
        and (cm.ends_at is null or cm.ends_at>=v_local_date)
    ) then continue; end if;

    if r.weekdays is not null and array_length(r.weekdays,1)>0 and not(v_dow=any(r.weekdays)) then
      continue;
    end if;

    if v_local_time<v_followup_time then continue; end if;

    if public.reminder_completed(r.client_id,r.reminder_type,v_local_date,r.timezone) then
      continue;
    end if;

    insert into public.notification_preferences(user_id,timezone)
    select r.client_id,coalesce(nullif(p.timezone,''),'Europe/Moscow')
    from public.profiles p where p.id=r.client_id
    on conflict(user_id) do nothing;

    select * into v_pref
    from public.notification_preferences
    where user_id=r.client_id;

    v_due_at:=(v_local_date+v_followup_time) at time zone r.timezone;
    v_title:=case r.reminder_type
      when 'weight' then 'Вес ещё не записан'
      else 'Талия ещё не измерена'
    end;
    v_body:=case r.reminder_type
      when 'weight' then 'Если сегодня был день взвешивания, внеси результат, чтобы не терять динамику.'
      else 'Сегодня день контрольного замера талии. Если ещё не измерил — внеси результат.'
    end;

    foreach v_channel in array r.channels
    loop
      if v_channel='in_app' and not v_pref.in_app_enabled then continue; end if;
      if v_channel='telegram' and not v_pref.telegram_enabled then continue; end if;
      if v_channel='web_push' and not v_pref.web_push_enabled then continue; end if;

      if v_channel in ('telegram','web_push')
         and not private.notification_topic_enabled(r.client_id,v_channel,'progress')
      then continue; end if;

      if v_channel='in_app' then
        v_channel_due:=v_due_at;
      else
        v_channel_due:=public.adjust_external_notification_time(
          v_due_at,coalesce(v_pref.timezone,r.timezone),
          v_pref.quiet_hours_enabled,v_pref.quiet_start,v_pref.quiet_end
        );
      end if;

      insert into public.notification_deliveries(
        client_id,recipient_id,reminder_rule_id,channel,scheduled_for,occurrence_date,
        status,title,body,action_path,payload,delivered_at
      ) values(
        r.client_id,r.client_id,null,v_channel,v_channel_due,v_local_date,
        case when v_channel='in_app' then 'sent' else 'pending' end,
        v_title,v_body,r.action_path,
        jsonb_build_object(
          'kind','reminder_followup',
          'followup_of',r.id::text,
          'reminder_type',r.reminder_type,
          'module_code',r.module_code,
          'topic_code','progress',
          'original_due_at',v_due_at,
          'quiet_hours_applied',v_channel_due>v_due_at
        ),
        case when v_channel='in_app' then now() else null end
      )
      on conflict do nothing;

      if found then v_count:=v_count+1; end if;
    end loop;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.enqueue_missed_reminder_followups(timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_missed_reminder_followups(timestamptz) to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname='andrey-fit-reminder-followups';

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'andrey-fit-reminder-followups',
    '*/5 * * * *',
    'select public.enqueue_missed_reminder_followups(now());'
  );
end $$;
