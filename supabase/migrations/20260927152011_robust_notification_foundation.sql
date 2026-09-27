-- Robust multi-channel notification foundation.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  in_app_enabled boolean not null default true,
  telegram_enabled boolean not null default false,
  web_push_enabled boolean not null default false,
  quiet_hours_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  timezone text not null default 'Europe/Moscow',
  digest_mode text not null default 'immediate',
  updated_at timestamptz not null default now(),
  constraint notification_preferences_digest_check check (digest_mode in ('immediate','morning_digest','evening_digest'))
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon;
grant select,insert,update on public.notification_preferences to authenticated;

drop policy if exists notification_preferences_owner_select on public.notification_preferences;
create policy notification_preferences_owner_select on public.notification_preferences
for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists notification_preferences_owner_insert on public.notification_preferences;
create policy notification_preferences_owner_insert on public.notification_preferences
for insert to authenticated with check (user_id=(select auth.uid()));

drop policy if exists notification_preferences_owner_update on public.notification_preferences;
create policy notification_preferences_owner_update on public.notification_preferences
for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

alter table public.reminder_rules
  add column if not exists name text,
  add column if not exists channels text[] not null default array['in_app']::text[],
  add column if not exists recipient_mode text not null default 'client',
  add column if not exists skip_if_completed boolean not null default true,
  add column if not exists title_template text,
  add column if not exists body_template text,
  add column if not exists action_path text,
  add column if not exists last_processed_local_date date,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.reminder_rules'::regclass and conname='reminder_rules_recipient_mode_check'
  ) then
    alter table public.reminder_rules
      add constraint reminder_rules_recipient_mode_check check (recipient_mode in ('client','coach','both'));
  end if;
end $$;

alter table public.notification_deliveries
  add column if not exists recipient_id uuid references public.profiles(id) on delete restrict,
  add column if not exists occurrence_date date,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists action_path text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.notification_deliveries set recipient_id=client_id where recipient_id is null;
alter table public.notification_deliveries alter column recipient_id set not null;

create unique index if not exists notification_delivery_occurrence_uq
  on public.notification_deliveries(reminder_rule_id,recipient_id,channel,occurrence_date)
  where reminder_rule_id is not null and occurrence_date is not null;

create index if not exists notification_deliveries_recipient_status_idx
  on public.notification_deliveries(recipient_id,status,created_at desc);
create index if not exists notification_deliveries_recipient_unread_idx
  on public.notification_deliveries(recipient_id,created_at desc)
  where read_at is null and dismissed_at is null;

drop policy if exists notification_deliveries_read on public.notification_deliveries;
create policy notification_deliveries_read on public.notification_deliveries
for select to authenticated
using (
  recipient_id=(select auth.uid())
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=notification_deliveries.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create or replace function public.get_my_notification_preferences()
returns public.notification_preferences
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_row public.notification_preferences%rowtype;
  v_tz text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select timezone into v_tz from public.profiles where id=v_user;
  insert into public.notification_preferences(user_id,timezone)
  values(v_user,coalesce(v_tz,'Europe/Moscow'))
  on conflict (user_id) do nothing;
  select * into v_row from public.notification_preferences where user_id=v_user;
  return v_row;
end;
$$;

create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  update public.notification_deliveries
  set read_at=coalesce(read_at,now()),updated_at=now()
  where id=p_id and recipient_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_count integer;
begin
  update public.notification_deliveries
  set read_at=coalesce(read_at,now()),updated_at=now()
  where recipient_id=(select auth.uid()) and read_at is null and dismissed_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.dismiss_notification(p_id uuid)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  update public.notification_deliveries
  set dismissed_at=now(),read_at=coalesce(read_at,now()),updated_at=now()
  where id=p_id and recipient_id=(select auth.uid());
  if not found then raise exception 'Notification not found'; end if;
end;
$$;

create or replace function public.reminder_completed(
  p_client_id uuid,p_type text,p_local_date date,p_timezone text
)
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select case p_type
    when 'weight' then exists(select 1 from public.measurements m where m.client_id=p_client_id and m.measured_at=p_local_date and m.weight_kg is not null)
    when 'waist' then exists(select 1 from public.measurements m where m.client_id=p_client_id and m.measured_at=p_local_date and m.waist_cm is not null)
    when 'nutrition' then exists(select 1 from public.daily_checkins d where d.client_id=p_client_id and d.checkin_date=p_local_date and (d.nutrition_adherence is not null or d.calories is not null or d.protein_g is not null))
    when 'daily_checkin' then exists(select 1 from public.daily_checkins d where d.client_id=p_client_id and d.checkin_date=p_local_date)
    when 'workout' then exists(select 1 from public.workout_sessions w where w.client_id=p_client_id and w.status='completed' and (coalesce(w.completed_at,w.started_at) at time zone p_timezone)::date=p_local_date)
    else false
  end;
$$;

create or replace function public.enqueue_due_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  r public.reminder_rules%rowtype;
  v_local_date date; v_local_time time; v_dow integer; v_due_at timestamptz;
  v_recipient uuid; v_channel text; v_count integer:=0;
  v_pref public.notification_preferences%rowtype; v_title text; v_body text;
begin
  for r in select * from public.reminder_rules where enabled=true loop
    v_local_date := (p_now at time zone r.timezone)::date;
    v_local_time := (p_now at time zone r.timezone)::time;
    v_dow := extract(isodow from v_local_date)::integer;
    if r.last_processed_local_date is not null and r.last_processed_local_date>=v_local_date then continue; end if;
    if r.weekdays is not null and array_length(r.weekdays,1)>0 and not (v_dow=any(r.weekdays)) then continue; end if;
    if v_local_time < r.local_time then continue; end if;

    if r.skip_if_completed and public.reminder_completed(r.client_id,r.reminder_type,v_local_date,r.timezone) then
      update public.reminder_rules set last_processed_local_date=v_local_date,updated_at=now() where id=r.id;
      continue;
    end if;

    v_due_at := (v_local_date + r.local_time) at time zone r.timezone;
    v_title := coalesce(r.title_template,r.name,'Напоминание');
    v_body := coalesce(r.body_template,'');

    for v_recipient in
      select x.id from (
        select r.client_id as id where r.recipient_mode in ('client','both')
        union all
        select cc.coach_id from public.coach_clients cc where cc.client_id=r.client_id and cc.status='active' and r.recipient_mode in ('coach','both')
      ) x
    loop
      insert into public.notification_preferences(user_id,timezone)
      select v_recipient,coalesce(p.timezone,'Europe/Moscow') from public.profiles p where p.id=v_recipient
      on conflict (user_id) do nothing;
      select * into v_pref from public.notification_preferences where user_id=v_recipient;

      foreach v_channel in array r.channels loop
        if v_channel='in_app' and not v_pref.in_app_enabled then continue; end if;
        if v_channel='telegram' and not v_pref.telegram_enabled then continue; end if;
        if v_channel='web_push' and not v_pref.web_push_enabled then continue; end if;

        insert into public.notification_deliveries(
          client_id,recipient_id,reminder_rule_id,channel,scheduled_for,occurrence_date,status,title,body,action_path,payload
        ) values (
          r.client_id,v_recipient,r.id,v_channel,v_due_at,v_local_date,
          case when v_channel='in_app' then 'delivered' else 'pending' end,
          v_title,v_body,r.action_path,jsonb_build_object('reminder_type',r.reminder_type,'module_code',r.module_code)
        ) on conflict do nothing;

        if found then
          if v_channel='in_app' then
            update public.notification_deliveries set delivered_at=coalesce(delivered_at,now()),updated_at=now()
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

revoke all on function public.get_my_notification_preferences() from public,anon;
revoke all on function public.mark_notification_read(uuid) from public,anon;
revoke all on function public.mark_all_notifications_read() from public,anon;
revoke all on function public.dismiss_notification(uuid) from public,anon;
revoke all on function public.reminder_completed(uuid,text,date,text) from public,anon,authenticated;
revoke all on function public.enqueue_due_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.dismiss_notification(uuid) to authenticated;
grant execute on function public.enqueue_due_reminders(timestamptz) to service_role;
