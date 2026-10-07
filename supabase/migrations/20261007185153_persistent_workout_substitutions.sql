create table if not exists public.client_program_exercise_preferences(
  client_id uuid not null references public.profiles(id) on delete cascade,
  program_exercise_id uuid not null references public.program_exercises(id) on delete cascade,
  preferred_exercise_id uuid not null references public.exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(client_id,program_exercise_id)
);

alter table public.client_program_exercise_preferences enable row level security;

drop policy if exists client_program_exercise_preferences_read on public.client_program_exercise_preferences;
create policy client_program_exercise_preferences_read
on public.client_program_exercise_preferences
for select
to authenticated
using(
  client_id=(select auth.uid())
  or exists(
    select 1
    from public.coach_clients cc
    where cc.client_id=client_program_exercise_preferences.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

revoke all on table public.client_program_exercise_preferences from public;
revoke all on table public.client_program_exercise_preferences from anon;
revoke all on table public.client_program_exercise_preferences from authenticated;
grant select on table public.client_program_exercise_preferences to authenticated;

create or replace function public.get_allowed_workout_substitutions(p_workout_exercise_id uuid)
returns table(exercise_id uuid,name text,match_type text)
language plpgsql
stable
set search_path=public,pg_temp
as $$
declare
  v_group uuid;
  v_parent uuid;
  v_policy text;
  v_current uuid;
  v_prescribed uuid;
begin
  select we.substitution_group_id,we.substitution_policy,we.exercise_id,
         we.prescribed_exercise_id,g.parent_group_id
  into v_group,v_policy,v_current,v_prescribed,v_parent
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  left join public.exercise_substitution_groups g on g.id=we.substitution_group_id
  where we.id=p_workout_exercise_id
    and we.allow_substitution=true
    and (
      ws.client_id=(select auth.uid())
      or exists(
        select 1
        from public.coach_clients cc
        where cc.client_id=ws.client_id
          and cc.coach_id=(select auth.uid())
          and cc.status='active'
      )
    );

  if not found or v_group is null then return; end if;

  return query
  with candidates as(
    select e.id,e.name,m.match_type,m.priority
    from public.exercise_substitution_members m
    join public.exercises e on e.id=m.exercise_id and e.is_active=true
    where e.id<>v_current
      and (
        (v_policy='strict' and m.group_id=v_group and m.match_type='direct')
        or
        (v_policy='flexible' and m.group_id=v_group and m.match_type in ('direct','acceptable'))
        or
        (v_policy='wide' and (m.group_id=v_group or (v_parent is not null and m.group_id=v_parent)))
      )

    union all

    select e.id,e.name,'direct'::text,0
    from public.exercises e
    where e.id=v_prescribed
      and e.id<>v_current
      and e.is_active=true
  )
  select distinct on(c.id) c.id,c.name,c.match_type
  from candidates c
  order by c.id,
    case c.match_type when 'direct' then 1 when 'acceptable' then 2 else 3 end,
    c.priority,
    c.name;
end;
$$;

create or replace function private.apply_workout_exercise_preference()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $$
declare
  v_client uuid;
  v_preferred uuid;
  v_parent uuid;
  v_allowed boolean:=false;
begin
  if new.program_exercise_id is null
     or new.continued_from_workout_exercise_id is not null
     or new.exercise_id is distinct from new.prescribed_exercise_id
     or new.allow_substitution is not true
     or new.substitution_group_id is null
  then
    return new;
  end if;

  select ws.client_id into v_client
  from public.workout_sessions ws
  where ws.id=new.workout_session_id;

  if v_client is null then return new; end if;

  select p.preferred_exercise_id into v_preferred
  from public.client_program_exercise_preferences p
  where p.client_id=v_client
    and p.program_exercise_id=new.program_exercise_id;

  if v_preferred is null or v_preferred=new.exercise_id then return new; end if;

  select g.parent_group_id into v_parent
  from public.exercise_substitution_groups g
  where g.id=new.substitution_group_id;

  select exists(
    select 1
    from public.exercise_substitution_members m
    join public.exercises e on e.id=m.exercise_id and e.is_active=true
    where e.id=v_preferred
      and (
        (new.substitution_policy='strict' and m.group_id=new.substitution_group_id and m.match_type='direct')
        or
        (new.substitution_policy='flexible' and m.group_id=new.substitution_group_id and m.match_type in ('direct','acceptable'))
        or
        (new.substitution_policy='wide' and (m.group_id=new.substitution_group_id or (v_parent is not null and m.group_id=v_parent)))
      )
  ) into v_allowed;

  if not v_allowed then return new; end if;

  new.substituted_from_exercise_id:=coalesce(new.substituted_from_exercise_id,new.exercise_id);
  new.exercise_id:=v_preferred;

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
  where e.id=v_preferred and e.is_active=true;

  return new;
end;
$$;

drop trigger if exists apply_workout_exercise_preference on public.workout_exercises;
create trigger apply_workout_exercise_preference
before insert on public.workout_exercises
for each row execute function private.apply_workout_exercise_preference();

create or replace function public.replace_workout_exercise_v2(
  p_workout_exercise_id uuid,
  p_new_exercise_id uuid,
  p_persist_preference boolean default false
) returns uuid
language plpgsql
security definer
set search_path=pg_catalog,public
as $$
declare
  v_user uuid:=auth.uid();
  v_program_exercise_id uuid;
  v_prescribed_exercise_id uuid;
  v_result uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select we.program_exercise_id,we.prescribed_exercise_id
  into v_program_exercise_id,v_prescribed_exercise_id
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=v_user;

  if not found then raise exception 'Workout exercise not found or access denied'; end if;

  v_result:=public.replace_workout_exercise(p_workout_exercise_id,p_new_exercise_id);

  if p_persist_preference and v_program_exercise_id is not null then
    if p_new_exercise_id=v_prescribed_exercise_id then
      delete from public.client_program_exercise_preferences p
      where p.client_id=v_user
        and p.program_exercise_id=v_program_exercise_id;
    else
      insert into public.client_program_exercise_preferences(
        client_id,program_exercise_id,preferred_exercise_id,created_at,updated_at
      ) values(
        v_user,v_program_exercise_id,p_new_exercise_id,now(),now()
      )
      on conflict(client_id,program_exercise_id) do update
      set preferred_exercise_id=excluded.preferred_exercise_id,
          updated_at=now();
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.replace_workout_exercise_v2(uuid,uuid,boolean) from public;
revoke all on function public.replace_workout_exercise_v2(uuid,uuid,boolean) from anon;
grant execute on function public.replace_workout_exercise_v2(uuid,uuid,boolean) to authenticated;
