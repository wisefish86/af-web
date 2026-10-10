create extension if not exists pg_net;

create or replace function public.claim_due_telegram_deliveries(p_limit integer default 20)
returns table(
  delivery_id uuid,
  recipient_id uuid,
  client_id uuid,
  title text,
  body text,
  action_path text,
  payload jsonb,
  external_id text,
  recipient_role text,
  client_name text,
  attempt_count integer
)
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),50));
begin
  update public.notification_deliveries d
  set status='cancelled',
      error=coalesce(d.error,'Telegram delivery disabled before send'),
      updated_at=now()
  where d.channel='telegram'
    and d.status='pending'
    and d.scheduled_for<=now()
    and (
      not exists(
        select 1 from public.notification_preferences np
        where np.user_id=d.recipient_id and np.telegram_enabled=true
      )
      or not exists(
        select 1 from public.notification_channels nc
        where nc.client_id=d.recipient_id
          and nc.channel='telegram'
          and nc.enabled=true
          and nc.verified_at is not null
          and nullif(nc.external_id,'') is not null
      )
      or not private.notification_topic_enabled(
        d.recipient_id,'telegram',
        case
          when d.payload->>'topic_code' in ('feedback','workouts','progress','nutrition','checkins','general')
            then d.payload->>'topic_code'
          when d.payload->>'kind'='feedback' then 'feedback'
          else 'general'
        end
      )
    );

  return query
  with candidates as (
    select d.id
    from public.notification_deliveries d
    where d.channel='telegram'
      and d.status='pending'
      and d.scheduled_for<=now()
      and exists(
        select 1 from public.notification_preferences np
        where np.user_id=d.recipient_id and np.telegram_enabled=true
      )
      and exists(
        select 1 from public.notification_channels nc
        where nc.client_id=d.recipient_id
          and nc.channel='telegram'
          and nc.enabled=true
          and nc.verified_at is not null
          and nullif(nc.external_id,'') is not null
      )
      and private.notification_topic_enabled(
        d.recipient_id,'telegram',
        case
          when d.payload->>'topic_code' in ('feedback','workouts','progress','nutrition','checkins','general')
            then d.payload->>'topic_code'
          when d.payload->>'kind'='feedback' then 'feedback'
          else 'general'
        end
      )
    order by d.scheduled_for,d.created_at
    for update skip locked
    limit v_limit
  ),
  claimed as (
    update public.notification_deliveries d
    set attempt_count=d.attempt_count+1,
        scheduled_for=now()+interval '2 minutes',
        updated_at=now()
    from candidates c
    where d.id=c.id
    returning d.id,d.recipient_id,d.client_id,d.title,d.body,d.action_path,d.payload,d.attempt_count
  )
  select
    c.id,c.recipient_id,c.client_id,c.title,c.body,c.action_path,c.payload,
    nc.external_id,
    rp.role,
    cp.display_name,
    c.attempt_count
  from claimed c
  join public.notification_channels nc
    on nc.client_id=c.recipient_id
   and nc.channel='telegram'
   and nc.enabled=true
   and nc.verified_at is not null
  join public.profiles rp on rp.id=c.recipient_id
  left join public.profiles cp on cp.id=c.client_id;
end;
$function$;

revoke all on function public.claim_due_telegram_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_due_telegram_deliveries(integer) to service_role;

create or replace function public.finish_telegram_delivery(
  p_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error text default null,
  p_retry_after_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_attempts integer;
  v_retry_seconds integer;
begin
  select attempt_count into v_attempts
  from public.notification_deliveries
  where id=p_id and channel='telegram'
  for update;

  if not found then raise exception 'Telegram delivery not found'; end if;

  if p_success then
    update public.notification_deliveries
    set status='sent',
        sent_at=now(),
        delivered_at=now(),
        provider_message_id=nullif(p_provider_message_id,''),
        error=null,
        updated_at=now()
    where id=p_id;
    return;
  end if;

  if v_attempts>=4 then
    update public.notification_deliveries
    set status='failed',
        error=left(coalesce(nullif(p_error,''),'Telegram delivery failed'),1000),
        updated_at=now()
    where id=p_id;
    return;
  end if;

  v_retry_seconds:=greatest(
    coalesce(p_retry_after_seconds,0),
    least(600,greatest(60,60*v_attempts))
  );

  update public.notification_deliveries
  set status='pending',
      scheduled_for=now()+(v_retry_seconds::text||' seconds')::interval,
      error=left(coalesce(nullif(p_error,''),'Telegram delivery failed; retry scheduled'),1000),
      updated_at=now()
  where id=p_id;
end;
$function$;

revoke all on function public.finish_telegram_delivery(uuid,boolean,text,text,integer) from public,anon,authenticated;
grant execute on function public.finish_telegram_delivery(uuid,boolean,text,text,integer) to service_role;

create or replace function private.kick_telegram_dispatch()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  perform net.http_post(
    url:='https://jjaunlbglskpddslwegp.supabase.co/functions/v1/telegram-dispatch',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:=jsonb_build_object('source','notification_insert'),
    timeout_milliseconds:=10000
  );
  return new;
exception when others then
  raise warning 'Telegram dispatcher kick failed: %',sqlerrm;
  return new;
end;
$function$;

revoke all on function private.kick_telegram_dispatch() from public,anon,authenticated;

drop trigger if exists notification_delivery_kick_telegram on public.notification_deliveries;
create trigger notification_delivery_kick_telegram
after insert on public.notification_deliveries
for each row
when (new.channel='telegram' and new.status='pending')
execute function private.kick_telegram_dispatch();

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='andrey-fit-telegram-dispatch'
  loop
    perform cron.unschedule(v_jobid);
  end loop;
end $$;

select cron.schedule(
  'andrey-fit-telegram-dispatch',
  '* * * * *',
  $cron$
    select net.http_post(
      url:='https://jjaunlbglskpddslwegp.supabase.co/functions/v1/telegram-dispatch',
      headers:='{"Content-Type":"application/json"}'::jsonb,
      body:='{"source":"cron"}'::jsonb,
      timeout_milliseconds:=10000
    );
  $cron$
);
