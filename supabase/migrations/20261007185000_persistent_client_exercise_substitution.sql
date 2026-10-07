-- Persistent client exercise substitutions for future workouts in the current program.
-- Existing table client_program_exercise_preferences was created earlier but was
-- read-only and not applied when workout snapshots were created.

grant insert,update,delete on table public.client_program_exercise_preferences to authenticated;

drop policy if exists client_program_exercise_preferences_owner_insert on public.client_program_exercise_preferences;
create policy client_program_exercise_preferences_owner_insert
on public.client_program_exercise_preferences
for insert to authenticated
with check (
  client_id=(select auth.uid())
  and exists(
    select 1
    from public.program_exercises pe
    join public.training_days td on td.id=pe.training_day_id
    join public.training_programs tp on tp.id=td.program_id
    where pe.id=program_exercise_id
      and tp.client_id=(select auth.uid())
      and tp.status='active'
      and tp.is_active=true
  )
);

drop policy if exists client_program_exercise_preferences_owner_update on public.client_program_exercise_preferences;
create policy client_program_exercise_preferences_owner_update
on public.client_program_exercise_preferences
for update to authenticated
using (client_id=(select auth.uid()))
with check (
  client_id=(select auth.uid())
  and exists(
    select 1
    from public.program_exercises pe
    join public.training_days td on td.id=pe.training_day_id
    join public.training_programs tp on tp.id=td.program_id
    where pe.id=program_exercise_id
      and tp.client_id=(select auth.uid())
      and tp.status='active'
      and tp.is_active=true
  )
);

drop policy if exists client_program_exercise_preferences_owner_delete on public.client_program_exercise_preferences;
create policy client_program_exercise_preferences_owner_delete
on public.client_program_exercise_preferences
for delete to authenticated
using (client_id=(select auth.uid()));

create or replace function public.replace_workout_exercise_v2(
  p_workout_exercise_id uuid,
  p_new_exercise_id uuid,
  p_persist boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_result uuid;
  v_program_exercise_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  -- Existing replacement RPC remains the single authority for ownership,
  -- active-workout state, allowed substitution policy and continuation logic.
  v_result:=public.replace_workout_exercise(p_workout_exercise_id,p_new_exercise_id);

  if p_persist then
    select we.program_exercise_id into v_program_exercise_id
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=p_workout_exercise_id
      and ws.client_id=v_user
      and ws.status='in_progress';

    if v_program_exercise_id is null then
      raise exception 'Permanent replacement is unavailable for this exercise';
    end if;

    insert into public.client_program_exercise_preferences(
      client_id,program_exercise_id,preferred_exercise_id,created_at,updated_at
    ) values (
      v_user,v_program_exercise_id,p_new_exercise_id,now(),now()
    )
    on conflict(client_id,program_exercise_id) do update
    set preferred_exercise_id=excluded.preferred_exercise_id,
        updated_at=now();
  end if;

  return v_result;
end;
$function$;

revoke all on function public.replace_workout_exercise_v2(uuid,uuid,boolean) from public,anon;
grant execute on function public.replace_workout_exercise_v2(uuid,uuid,boolean) to authenticated;

create or replace function public.apply_client_program_exercise_preference()
returns trigger
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_client uuid;
  v_preferred uuid;
begin
  -- Only initial program snapshots are eligible. Explicit substitutions and
  -- continuation rows already have exercise_id != prescribed_exercise_id.
  if new.program_exercise_id is null
     or new.prescribed_exercise_id is null
     or new.exercise_id is distinct from new.prescribed_exercise_id then
    return new;
  end if;

  select ws.client_id into v_client
  from public.workout_sessions ws
  where ws.id=new.workout_session_id;

  if v_client is null then return new; end if;

  select pref.preferred_exercise_id into v_preferred
  from public.client_program_exercise_preferences pref
  join public.program_exercises pe on pe.id=pref.program_exercise_id
  left join public.exercise_substitution_groups g on g.id=pe.substitution_group_id
  where pref.client_id=v_client
    and pref.program_exercise_id=new.program_exercise_id
    and pe.allow_client_substitution=true
    and pe.substitution_group_id is not null
    and pref.preferred_exercise_id<>pe.default_exercise_id
    and exists(
      select 1 from public.exercises e
      where e.id=pref.preferred_exercise_id and e.is_active=true
    )
    and exists(
      select 1
      from public.exercise_substitution_members m
      where m.exercise_id=pref.preferred_exercise_id
        and (
          (pe.substitution_policy='strict'
            and m.group_id=pe.substitution_group_id
            and m.match_type='direct')
          or
          (pe.substitution_policy='flexible'
            and m.group_id=pe.substitution_group_id
            and m.match_type in ('direct','acceptable'))
          or
          (pe.substitution_policy='wide'
            and (
              m.group_id=pe.substitution_group_id
              or (g.parent_group_id is not null and m.group_id=g.parent_group_id)
            ))
        )
    )
  limit 1;

  if v_preferred is null then return new; end if;

  select
    e.name,
    e.instructions,
    e.technique_url,
    (
      select emg.muscle_group_code
      from public.exercise_muscle_groups emg
      where emg.exercise_id=e.id and emg.role='primary'
      order by emg.muscle_group_code
      limit 1
    ),
    (
      select m.storage_path
      from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image'
      order by m.sort_order,m.created_at
      limit 1
    ),
    (
      select m.external_url
      from public.exercise_media m
      where m.exercise_id=e.id and m.kind='image'
      order by m.sort_order,m.created_at
      limit 1
    )
  into
    new.exercise_name_snapshot,
    new.instructions_snapshot,
    new.technique_url_snapshot,
    new.primary_muscle_snapshot,
    new.image_storage_path_snapshot,
    new.image_external_url_snapshot
  from public.exercises e
  where e.id=v_preferred;

  new.substituted_from_exercise_id:=coalesce(new.substituted_from_exercise_id,new.exercise_id);
  new.exercise_id:=v_preferred;
  return new;
end;
$function$;

drop trigger if exists apply_client_program_exercise_preference_before_insert on public.workout_exercises;
create trigger apply_client_program_exercise_preference_before_insert
before insert on public.workout_exercises
for each row
execute function public.apply_client_program_exercise_preference();

revoke all on function public.apply_client_program_exercise_preference() from public,anon,authenticated;
