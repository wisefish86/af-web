create or replace function public.reopen_my_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_session public.workout_sessions%rowtype;
  v_timezone text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select coalesce(p.timezone,'Europe/Moscow') into v_timezone
  from public.profiles p
  where p.id=v_user;

  select * into v_session
  from public.workout_sessions
  where id=p_workout_session_id and client_id=v_user
  for update;

  if not found then raise exception 'Тренировка не найдена.'; end if;
  if v_session.status<>'completed' then raise exception 'Можно продолжить только завершённую тренировку.'; end if;
  if (v_session.completed_at at time zone v_timezone)::date <> (now() at time zone v_timezone)::date then
    raise exception 'Редактировать можно только тренировку, завершённую сегодня.';
  end if;
  if exists(
    select 1 from public.workout_sessions
    where client_id=v_user and status='in_progress' and id<>p_workout_session_id
  ) then
    raise exception 'Сначала заверши уже начатую тренировку.';
  end if;

  update public.workout_sessions
  set status='in_progress',completed_at=null,updated_at=now(),
      active_workout_exercise_id=null,rest_timer_end_at=null,rest_timer_name=null
  where id=p_workout_session_id;

  return p_workout_session_id;
end;
$function$;

revoke execute on function public.reopen_my_workout(uuid) from public,anon;
grant execute on function public.reopen_my_workout(uuid) to authenticated;
