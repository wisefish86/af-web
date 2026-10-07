-- A source exercise that has already been continued into a replacement is a
-- historical segment of the same logical exercise slot. Reopening it would create
-- two active branches, so keep it immutable and continue through its replacement.

create or replace function public.reopen_my_workout_exercise(p_workout_exercise_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
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

  if not found then
    raise exception 'Editable workout exercise not found or access denied';
  end if;

  if exists(
    select 1
    from public.workout_exercises next
    where next.continued_from_workout_exercise_id=p_workout_exercise_id
  ) then
    raise exception 'Switched exercise segment cannot be reopened; continue with its replacement exercise';
  end if;

  if v_completed is null then return true; end if;

  update public.workout_exercises
  set completed_at=null
  where id=p_workout_exercise_id;

  return true;
end;
$function$;

revoke all on function public.reopen_my_workout_exercise(uuid) from public,anon;
grant execute on function public.reopen_my_workout_exercise(uuid) to authenticated;
