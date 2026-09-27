-- Respect user quiet hours when scheduling Telegram/PWA notifications.
create or replace function public.adjust_external_notification_time(
  p_due_at timestamptz,p_timezone text,p_quiet_enabled boolean,p_quiet_start time,p_quiet_end time
)
returns timestamptz
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_local timestamp; v_date date; v_time time; v_target timestamp; v_inside boolean:=false;
begin
  if not coalesce(p_quiet_enabled,false) then return p_due_at; end if;
  v_local:=p_due_at at time zone p_timezone; v_date:=v_local::date; v_time:=v_local::time;
  if p_quiet_start=p_quiet_end then return p_due_at;
  elsif p_quiet_start<p_quiet_end then
    v_inside:=v_time>=p_quiet_start and v_time<p_quiet_end;
    if v_inside then v_target:=v_date+p_quiet_end; end if;
  else
    v_inside:=v_time>=p_quiet_start or v_time<p_quiet_end;
    if v_inside then
      if v_time>=p_quiet_start then v_target:=(v_date+1)+p_quiet_end;
      else v_target:=v_date+p_quiet_end; end if;
    end if;
  end if;
  if not v_inside then return p_due_at; end if;
  return v_target at time zone p_timezone;
end;
$$;

create or replace function public.enqueue_due_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  r public.reminder_rules%rowtype; v_local_date date; v_local_time time; v_dow integer;
  v_due_at timestamptz; v_channel_due timestamptz; v_recipient uuid; v_channel text;
  v_count integer:=0; v_pref public.notification_preferences%rowtype; v_title text; v_body text;
begin
  for r in select * from public.reminder_rules where enabled=true loop
    v_local_date:=(p_now at time zone r.timezone)::date;
    v_local_time:=(p_now at time zone r.timezone)::time;
    v_dow:=extract(isodow from v_local_date)::integer;
    if r.last_processed_local_date is not null and r.last_processed_local_date>=v_local_date then continue; end if;
    if r.weekdays is not null and array_length(r.weekdays,1)>0 and not (v_dow=any(r.weekdays)) then continue; end if;
    if v_local_time<r.local_time then continue; end if;

    if r.skip_if_completed and public.reminder_completed(r.client_id,r.reminder_type,v_local_date,r.timezone) then
      update public.reminder_rules set last_processed_local_date=v_local_date,updated_at=now() where id=r.id;
      continue;
    end if;

    v_due_at:=(v_local_date+r.local_time) at time zone r.timezone;
    v_title:=coalesce(r.title_template,r.name,'Напоминание');
    v_body:=coalesce(r.body_template,'');

    for v_recipient in
      select x.id from (
        select r.client_id as id where r.recipient_mode in ('client','both')
        union all
        select cc.coach_id from public.coach_clients cc
        where cc.client_id=r.client_id and cc.status='active' and r.recipient_mode in ('coach','both')
      ) x
    loop
      insert into public.notification_preferences(user_id,timezone)
      select v_recipient,coalesce(p.timezone,'Europe/Moscow') from public.profiles p where p.id=v_recipient
      on conflict(user_id) do nothing;
      select * into v_pref from public.notification_preferences where user_id=v_recipient;

      foreach v_channel in array r.channels loop
        if v_channel='in_app' and not v_pref.in_app_enabled then continue; end if;
        if v_channel='telegram' and not v_pref.telegram_enabled then continue; end if;
        if v_channel='web_push' and not v_pref.web_push_enabled then continue; end if;

        if v_channel='in_app' then v_channel_due:=v_due_at;
        else
          v_channel_due:=public.adjust_external_notification_time(
            v_due_at,coalesce(v_pref.timezone,r.timezone),v_pref.quiet_hours_enabled,v_pref.quiet_start,v_pref.quiet_end
          );
        end if;

        insert into public.notification_deliveries(
          client_id,recipient_id,reminder_rule_id,channel,scheduled_for,occurrence_date,status,title,body,action_path,payload
        ) values (
          r.client_id,v_recipient,r.id,v_channel,v_channel_due,v_local_date,
          case when v_channel='in_app' then 'delivered' else 'pending' end,
          v_title,v_body,r.action_path,
          jsonb_build_object('reminder_type',r.reminder_type,'module_code',r.module_code,'original_due_at',v_due_at,'quiet_hours_applied',v_channel_due>v_due_at)
        ) on conflict do nothing;

        if found then
          if v_channel='in_app' then
            update public.notification_deliveries
            set delivered_at=coalesce(delivered_at,now()),updated_at=now()
            where reminder_rule_id=r.id and recipient_id=v_recipient and channel=v_channel and occurrence_date=v_local_date;
          end if;
          v_count:=v_count+1;
        end if;
      end loop;
    end loop;

    update public.reminder_rules set last_processed_local_date=v_local_date,updated_at=now() where id=r.id;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.adjust_external_notification_time(timestamptz,text,boolean,time,time) from public,anon,authenticated;
grant execute on function public.adjust_external_notification_time(timestamptz,text,boolean,time,time) to service_role;
