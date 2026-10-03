
create or replace function private.notification_topic_enabled(
  p_user_id uuid,
  p_channel text,
  p_topic_code text
)
returns boolean
language sql
stable
security definer
set search_path to 'public','private','pg_temp'
as $function$
  select coalesce((
    select pref.enabled
    from public.notification_channel_topic_preferences pref
    where pref.user_id=p_user_id
      and pref.channel=p_channel
      and pref.topic_code=p_topic_code
  ),true);
$function$;

revoke all on function private.notification_topic_enabled(uuid,text,text) from public,anon,authenticated;

create or replace function private.enqueue_direct_notification(
  p_client_id uuid,
  p_recipient_id uuid,
  p_title text,
  p_body text,
  p_action_path text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_in_app boolean:=true;
  v_telegram boolean:=false;
  v_topic text;
  v_payload jsonb;
begin
  v_topic:=case
    when p_payload->>'topic_code' in ('feedback','workouts','progress','nutrition','checkins','general')
      then p_payload->>'topic_code'
    when p_payload->>'kind'='feedback' then 'feedback'
    else 'general'
  end;
  v_payload:=coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('topic_code',v_topic);

  select coalesce(np.in_app_enabled,true),coalesce(np.telegram_enabled,false)
    into v_in_app,v_telegram
  from public.notification_preferences np
  where np.user_id=p_recipient_id;

  if not found then
    v_in_app:=true;
    v_telegram:=false;
  end if;

  if v_in_app then
    insert into public.notification_deliveries(
      client_id,recipient_id,channel,scheduled_for,sent_at,status,title,body,action_path,payload,delivered_at
    ) values(
      p_client_id,p_recipient_id,'in_app',now(),now(),'sent',p_title,left(coalesce(p_body,''),240),
      p_action_path,v_payload,now()
    );
  end if;

  if v_telegram
     and private.notification_topic_enabled(p_recipient_id,'telegram',v_topic)
     and exists(
       select 1
       from public.notification_channels nc
       where nc.client_id=p_recipient_id
         and nc.channel='telegram'
         and nc.enabled=true
         and nc.verified_at is not null
         and nullif(nc.external_id,'') is not null
     )
  then
    insert into public.notification_deliveries(
      client_id,recipient_id,channel,scheduled_for,status,title,body,action_path,payload
    ) values(
      p_client_id,p_recipient_id,'telegram',now(),'pending',p_title,left(coalesce(p_body,''),240),
      p_action_path,v_payload
    );
  end if;
end;
$function$;

create or replace function public.enqueue_due_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  r public.reminder_rules%rowtype;
  v_local_date date;
  v_local_time time;
  v_dow integer;
  v_due_at timestamptz;
  v_channel_due timestamptz;
  v_recipient uuid;
  v_channel text;
  v_count integer:=0;
  v_pref public.notification_preferences%rowtype;
  v_title text;
  v_body text;
  v_period text;
  v_next_due date;
  v_topic text;
begin
  for r in select * from public.reminder_rules where enabled=true
  loop
    v_local_date:=(p_now at time zone r.timezone)::date;
    v_local_time:=(p_now at time zone r.timezone)::time;
    v_dow:=extract(isodow from v_local_date)::integer;
    v_period:=coalesce(r.settings->>'period','weekly');
    v_next_due:=nullif(r.settings->>'next_due_date','')::date;
    v_topic:=case r.module_code
      when 'training' then 'workouts'
      when 'progress' then 'progress'
      when 'nutrition' then 'nutrition'
      when 'checkins' then 'checkins'
      else 'general'
    end;

    if r.module_code is not null and not exists(
      select 1 from public.client_modules cm
      where cm.client_id=r.client_id
        and cm.module_code=r.module_code
        and cm.enabled=true
        and cm.starts_at<=v_local_date
        and (cm.ends_at is null or cm.ends_at>=v_local_date)
    ) then continue; end if;

    if r.last_processed_local_date is not null and r.last_processed_local_date>=v_local_date then continue; end if;

    if v_period='rolling' then
      if v_next_due is null or v_local_date<>v_next_due then continue; end if;
    else
      if r.weekdays is not null and array_length(r.weekdays,1)>0 and not(v_dow=any(r.weekdays)) then continue; end if;
      if v_period='monthly' and extract(day from v_local_date)::integer>7 then continue; end if;
    end if;

    if v_local_time<r.local_time then continue; end if;

    if r.skip_if_completed and public.reminder_completed(r.client_id,r.reminder_type,v_local_date,r.timezone) then
      update public.reminder_rules
      set last_processed_local_date=v_local_date,updated_at=now()
      where id=r.id;
      continue;
    end if;

    v_due_at:=(v_local_date+r.local_time) at time zone r.timezone;
    v_title:=coalesce(r.title_template,r.name,'Напоминание');
    v_body:=coalesce(r.body_template,'');

    for v_recipient in
      select x.id from(
        select r.client_id as id where r.recipient_mode in('client','both')
        union all
        select cc.coach_id
        from public.coach_clients cc
        where cc.client_id=r.client_id
          and cc.status='active'
          and r.recipient_mode in('coach','both')
      ) x
    loop
      insert into public.notification_preferences(user_id,timezone)
      select v_recipient,coalesce(p.timezone,'Europe/Moscow')
      from public.profiles p where p.id=v_recipient
      on conflict(user_id) do nothing;

      select * into v_pref from public.notification_preferences where user_id=v_recipient;

      foreach v_channel in array r.channels
      loop
        if v_channel='in_app' and not v_pref.in_app_enabled then continue; end if;
        if v_channel='telegram' and not v_pref.telegram_enabled then continue; end if;
        if v_channel='web_push' and not v_pref.web_push_enabled then continue; end if;

        if v_channel in('telegram','web_push')
           and not private.notification_topic_enabled(v_recipient,v_channel,v_topic)
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
          status,title,body,action_path,payload
        ) values(
          r.client_id,v_recipient,r.id,v_channel,v_channel_due,v_local_date,
          case when v_channel='in_app' then 'sent' else 'pending' end,
          v_title,v_body,r.action_path,
          jsonb_build_object(
            'reminder_type',r.reminder_type,
            'module_code',r.module_code,
            'topic_code',v_topic,
            'original_due_at',v_due_at,
            'quiet_hours_applied',v_channel_due>v_due_at,
            'period',v_period
          )
        )
        on conflict do nothing;

        if found then
          if v_channel='in_app' then
            update public.notification_deliveries
            set delivered_at=coalesce(delivered_at,now()),updated_at=now()
            where reminder_rule_id=r.id
              and recipient_id=v_recipient
              and channel=v_channel
              and occurrence_date=v_local_date;
          end if;
          v_count:=v_count+1;
        end if;
      end loop;
    end loop;

    update public.reminder_rules
    set last_processed_local_date=v_local_date,updated_at=now()
    where id=r.id;
  end loop;

  return v_count;
end;
$function$;
