
create or replace function public.abandon_my_empty_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select status into v_status
  from public.workout_sessions
  where id=p_workout_session_id and client_id=v_user
  for update;

  if not found then raise exception 'Тренировка не найдена.'; end if;
  if v_status<>'in_progress' then raise exception 'Закрыть можно только незавершённую тренировку.'; end if;

  if exists(
    select 1
    from public.workout_sets ws
    join public.workout_exercises we on we.id=ws.workout_exercise_id
    where we.workout_session_id=p_workout_session_id
      and ws.completed_at is not null
  ) or exists(
    select 1
    from public.workout_cardio_entries wc
    where wc.workout_session_id=p_workout_session_id
      and wc.completed_at is not null
  ) then
    raise exception 'В этой тренировке уже есть сохранённые результаты.';
  end if;

  update public.workout_sessions
  set status='abandoned',
      completed_at=now(),
      active_workout_exercise_id=null,
      rest_timer_end_at=null,
      rest_timer_name=null,
      updated_at=now()
  where id=p_workout_session_id;

  return p_workout_session_id;
end;
$function$;

revoke all on function public.abandon_my_empty_workout(uuid) from public;
grant execute on function public.abandon_my_empty_workout(uuid) to authenticated;
