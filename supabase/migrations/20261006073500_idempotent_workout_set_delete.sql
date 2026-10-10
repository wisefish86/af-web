create or replace function public.delete_my_workout_set(
  p_workout_exercise_id uuid,
  p_set_number integer
) returns boolean
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_deleted boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_set_number<0 then raise exception 'Invalid set number'; end if;

  if not exists(
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=p_workout_exercise_id
      and ws.client_id=auth.uid()
      and ws.status='in_progress'
  ) then
    raise exception 'In-progress workout exercise not found or access denied';
  end if;

  delete from public.workout_sets
  where workout_exercise_id=p_workout_exercise_id
    and set_number=p_set_number;

  v_deleted:=found;
  return v_deleted;
end;
$$;

revoke execute on function public.delete_my_workout_set(uuid,integer) from public,anon;
grant execute on function public.delete_my_workout_set(uuid,integer) to authenticated;
