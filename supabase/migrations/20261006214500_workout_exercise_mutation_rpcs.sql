create or replace function public.complete_my_workout_exercise(
  p_workout_exercise_id uuid
) returns timestamptz
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_completed timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select we.completed_at into v_completed
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=v_user
    and ws.status='in_progress'
  for update of we;

  if not found then raise exception 'Editable workout exercise not found or access denied'; end if;
  if v_completed is not null then return v_completed; end if;

  v_completed:=now();
  update public.workout_exercises
  set completed_at=v_completed
  where id=p_workout_exercise_id;

  return v_completed;
end;
$$;

create or replace function public.reopen_my_workout_exercise(
  p_workout_exercise_id uuid
) returns boolean
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_completed timestamptz;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select we.completed_at into v_completed
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=v_user
    and ws.status='in_progress'
  for update of we;

  if not found then raise exception 'Editable workout exercise not found or access denied'; end if;
  if v_completed is null then return true; end if;

  update public.workout_exercises
  set completed_at=null
  where id=p_workout_exercise_id;

  return true;
end;
$$;

revoke all on function public.complete_my_workout_exercise(uuid) from public,anon;
revoke all on function public.reopen_my_workout_exercise(uuid) from public,anon;
grant execute on function public.complete_my_workout_exercise(uuid) to authenticated;
grant execute on function public.reopen_my_workout_exercise(uuid) to authenticated;
