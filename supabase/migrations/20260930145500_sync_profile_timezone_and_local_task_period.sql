create or replace function public.sync_profile_timezone_dependents()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_timezone text:=coalesce(nullif(new.timezone,''),'Europe/Moscow');
begin
  update public.notification_preferences
  set timezone=v_timezone,updated_at=now()
  where user_id=new.id
    and timezone is distinct from v_timezone;

  update public.reminder_rules
  set timezone=v_timezone,last_processed_local_date=null,updated_at=now()
  where client_id=new.id
    and timezone is distinct from v_timezone;

  return new;
end;
$function$;

revoke execute on function public.sync_profile_timezone_dependents() from public, anon, authenticated;

drop trigger if exists sync_profile_timezone_dependents on public.profiles;
create trigger sync_profile_timezone_dependents
after update of timezone on public.profiles
for each row
when (old.timezone is distinct from new.timezone)
execute function public.sync_profile_timezone_dependents();

create or replace function public.mark_my_task_complete(p_task_type text)
returns void
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_timezone text;
  v_period text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_task_type not in ('progress_photo') then raise exception 'Unsupported task type'; end if;

  select coalesce(nullif(p.timezone,''),'Europe/Moscow')
  into v_timezone
  from public.profiles p
  where p.id=v_user;

  v_period:=to_char((now() at time zone coalesce(v_timezone,'Europe/Moscow'))::date,'YYYY-MM');

  insert into public.client_task_completions(client_id,task_type,period_key,completed_at)
  values(v_user,p_task_type,v_period,now())
  on conflict(client_id,task_type,period_key)
  do update set completed_at=excluded.completed_at;
end;
$function$;