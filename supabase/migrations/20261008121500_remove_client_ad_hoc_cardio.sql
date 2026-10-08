-- Allow clients to undo an accidentally added one-off cardio block
-- while the workout is still active and the block has no completed result.

create or replace function public.remove_my_workout_cardio(
  p_workout_cardio_entry_id uuid
) returns boolean
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_user uuid:=auth.uid();
  v_row public.workout_cardio_entries%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select wc.* into v_row
  from public.workout_cardio_entries wc
  join public.workout_sessions ws on ws.id=wc.workout_session_id
  where wc.id=p_workout_cardio_entry_id
    and ws.client_id=v_user
    and ws.status='in_progress'
    and wc.entry_origin='client_ad_hoc'
  for update of wc;

  if not found then
    raise exception 'Removable client cardio not found or access denied';
  end if;
  if v_row.completed_at is not null then
    raise exception 'Reopen the cardio result before removing it';
  end if;

  delete from public.workout_cardio_entries
  where id=p_workout_cardio_entry_id;

  return true;
end;
$function$;

revoke all on function public.remove_my_workout_cardio(uuid) from public,anon;
grant execute on function public.remove_my_workout_cardio(uuid) to authenticated;
