create or replace function public.sync_completed_workout_to_daily_checkin()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_timezone text;
  v_date date;
begin
  if new.status<>'completed' or new.completed_at is null then return new; end if;
  if tg_op='UPDATE' and old.status='completed' and old.completed_at is not distinct from new.completed_at then return new; end if;

  select coalesce(nullif(p.timezone,''),'Europe/Moscow') into v_timezone
  from public.profiles p where p.id=new.client_id;
  v_date:=(new.completed_at at time zone coalesce(v_timezone,'Europe/Moscow'))::date;

  insert into public.daily_checkins(client_id,checkin_date,trained)
  values(new.client_id,v_date,true)
  on conflict(client_id,checkin_date) do update set trained=true;

  return new;
end;
$function$;

drop trigger if exists workout_session_sync_daily_trained on public.workout_sessions;
create trigger workout_session_sync_daily_trained
after insert or update of status,completed_at on public.workout_sessions
for each row execute function public.sync_completed_workout_to_daily_checkin();

revoke all on function public.sync_completed_workout_to_daily_checkin() from public,anon,authenticated;
