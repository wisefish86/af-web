-- Allow clients to safely reopen an already saved workout result for correction.
-- Existing values are kept; only completed_at is cleared.

create or replace function public.reopen_my_workout_set(
  p_workout_exercise_id uuid,
  p_set_number integer
) returns boolean
language plpgsql
security invoker
set search_path=''
as $$
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
      and we.completed_at is null
  ) then
    raise exception 'Editable workout set not found or access denied';
  end if;

  update public.workout_sets s
  set completed_at=null
  where s.workout_exercise_id=p_workout_exercise_id
    and s.set_number=p_set_number
    and s.completed_at is not null;

  if found then return true; end if;

  if exists(
    select 1 from public.workout_sets s
    where s.workout_exercise_id=p_workout_exercise_id
      and s.set_number=p_set_number
      and s.completed_at is null
  ) then return true; end if;

  raise exception 'Workout set not found';
end;
$$;

create or replace function public.reopen_my_workout_cardio(
  p_workout_cardio_entry_id uuid
) returns boolean
language plpgsql
security invoker
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1
    from public.workout_cardio_entries wc
    join public.workout_sessions ws on ws.id=wc.workout_session_id
    where wc.id=p_workout_cardio_entry_id
      and ws.client_id=auth.uid()
      and ws.status='in_progress'
  ) then
    raise exception 'Editable cardio result not found or access denied';
  end if;

  update public.workout_cardio_entries
  set completed_at=null
  where id=p_workout_cardio_entry_id
    and completed_at is not null;

  if found then return true; end if;

  if exists(
    select 1 from public.workout_cardio_entries
    where id=p_workout_cardio_entry_id and completed_at is null
  ) then return true; end if;

  raise exception 'Cardio result not found';
end;
$$;

revoke all on function public.reopen_my_workout_set(uuid,integer) from public,anon;
revoke all on function public.reopen_my_workout_cardio(uuid) from public,anon;
grant execute on function public.reopen_my_workout_set(uuid,integer) to authenticated;
grant execute on function public.reopen_my_workout_cardio(uuid) to authenticated;
