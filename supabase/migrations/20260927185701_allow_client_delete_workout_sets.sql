drop policy if exists workout_sets_delete_client on public.workout_sets;
create policy workout_sets_delete_client on public.workout_sets
for delete to authenticated
using (
  exists(
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=workout_sets.workout_exercise_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
);
