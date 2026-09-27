
-- Workout execution, client feedback and trainer inbox v1.

alter table public.workout_sessions
  add column if not exists program_id uuid references public.training_programs(id) on delete set null,
  add column if not exists status text not null default 'in_progress',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.workout_sessions'::regclass
      and conname='workout_sessions_status_check'
  ) then
    alter table public.workout_sessions
      add constraint workout_sessions_status_check
      check (status in ('in_progress','completed','abandoned'));
  end if;
end $$;

alter table public.workout_exercises
  add column if not exists prescribed_sets integer,
  add column if not exists reps_min integer,
  add column if not exists reps_max integer,
  add column if not exists rir_min numeric,
  add column if not exists rir_max numeric,
  add column if not exists rir_enabled boolean not null default true,
  add column if not exists rest_seconds integer not null default 120,
  add column if not exists allow_substitution boolean not null default false,
  add column if not exists substitution_group_id uuid references public.exercise_substitution_groups(id) on delete set null,
  add column if not exists exercise_role text not null default 'main',
  add column if not exists trainer_notes text,
  add column if not exists substituted_from_exercise_id uuid references public.exercises(id) on delete set null,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.workout_exercises'::regclass
      and conname='workout_exercises_rest_seconds_check'
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_rest_seconds_check
      check (rest_seconds between 15 and 1800);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.workout_exercises'::regclass
      and conname='workout_exercises_role_check'
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_role_check
      check (exercise_role in ('main','accessory','optional'));
  end if;
end $$;

create table if not exists public.workout_cardio_entries (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  program_cardio_block_id uuid references public.program_cardio_blocks(id) on delete set null,
  modality_code text not null references public.cardio_modalities(code),
  name text,
  sort_order integer not null default 100,
  prescribed_duration_minutes integer,
  prescribed_hr_min integer,
  prescribed_hr_max integer,
  prescribed_rpe_min numeric(3,1),
  prescribed_rpe_max numeric(3,1),
  prescribed_speed_kmh numeric(5,2),
  prescribed_incline_percent numeric(5,2),
  prescribed_distance_km numeric(6,2),
  trainer_notes text,
  actual_duration_minutes integer,
  actual_hr_avg integer,
  actual_rpe numeric(3,1),
  actual_distance_km numeric(6,2),
  client_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (prescribed_duration_minutes is null or prescribed_duration_minutes between 1 and 600),
  check (actual_duration_minutes is null or actual_duration_minutes between 0 and 600),
  check (actual_hr_avg is null or actual_hr_avg between 30 and 250),
  check (actual_rpe is null or actual_rpe between 1 and 10),
  check (actual_distance_km is null or actual_distance_km >= 0)
);

create index if not exists workout_sessions_client_status_idx
  on public.workout_sessions(client_id, status, started_at desc);
create index if not exists workout_sessions_program_idx
  on public.workout_sessions(program_id);
create index if not exists workout_cardio_session_idx
  on public.workout_cardio_entries(workout_session_id);
create index if not exists workout_exercises_sub_group_idx
  on public.workout_exercises(substitution_group_id);

create table if not exists public.feedback_threads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid references public.workout_sessions(id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises(id) on delete cascade,
  context_type text not null default 'workout_exercise',
  status text not null default 'new',
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (context_type in ('workout_exercise','workout','general')),
  check (status in ('new','in_progress','resolved'))
);

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.feedback_threads(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_threads_client_status_idx
  on public.feedback_threads(client_id, status, updated_at desc);
create index if not exists feedback_threads_assigned_idx
  on public.feedback_threads(assigned_to, status, updated_at desc);
create index if not exists feedback_threads_workout_exercise_idx
  on public.feedback_threads(workout_exercise_id);
create index if not exists feedback_messages_thread_created_idx
  on public.feedback_messages(thread_id, created_at);

alter table public.workout_cardio_entries enable row level security;
alter table public.feedback_threads enable row level security;
alter table public.feedback_messages enable row level security;

revoke all on public.workout_cardio_entries, public.feedback_threads, public.feedback_messages from anon;
grant select, insert, update on public.workout_cardio_entries to authenticated;
grant select, insert, update on public.feedback_threads to authenticated;
grant select, insert on public.feedback_messages to authenticated;

grant select, insert, update on public.workout_sessions, public.workout_exercises, public.workout_sets to authenticated;

drop policy if exists workout_sessions_access on public.workout_sessions;
drop policy if exists workout_exercises_access on public.workout_exercises;
drop policy if exists workout_sets_access on public.workout_sets;

create policy workout_sessions_select
on public.workout_sessions
for select to authenticated
using (
  client_id=(select auth.uid())
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id=workout_sessions.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create policy workout_sessions_insert_client
on public.workout_sessions
for insert to authenticated
with check (
  client_id=(select auth.uid())
  and (
    training_day_id is null
    or exists (
      select 1
      from public.training_days td
      join public.training_programs tp on tp.id=td.program_id
      where td.id=workout_sessions.training_day_id
        and tp.client_id=(select auth.uid())
        and tp.status='active'
        and tp.is_active=true
    )
  )
);

create policy workout_sessions_update_client
on public.workout_sessions
for update to authenticated
using (client_id=(select auth.uid()))
with check (client_id=(select auth.uid()));

create policy workout_exercises_select
on public.workout_exercises
for select to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id=workout_exercises.workout_session_id
      and (
        ws.client_id=(select auth.uid())
        or exists (
          select 1 from public.coach_clients cc
          where cc.client_id=ws.client_id
            and cc.coach_id=(select auth.uid())
            and cc.status='active'
        )
      )
  )
);

create policy workout_exercises_insert_client
on public.workout_exercises
for insert to authenticated
with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id=workout_exercises.workout_session_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
);

create policy workout_exercises_update_client
on public.workout_exercises
for update to authenticated
using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id=workout_exercises.workout_session_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
)
with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id=workout_exercises.workout_session_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
);

create policy workout_sets_select
on public.workout_sets
for select to authenticated
using (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=workout_sets.workout_exercise_id
      and (
        ws.client_id=(select auth.uid())
        or exists (
          select 1 from public.coach_clients cc
          where cc.client_id=ws.client_id
            and cc.coach_id=(select auth.uid())
            and cc.status='active'
        )
      )
  )
);

create policy workout_sets_insert_client
on public.workout_sets
for insert to authenticated
with check (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=workout_sets.workout_exercise_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
);

create policy workout_sets_update_client
on public.workout_sets
for update to authenticated
using (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=workout_sets.workout_exercise_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
)
with check (
  exists (
    select 1
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.id=workout_sets.workout_exercise_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
);

create policy workout_cardio_select
on public.workout_cardio_entries
for select to authenticated
using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id=workout_cardio_entries.workout_session_id
      and (
        ws.client_id=(select auth.uid())
        or exists (
          select 1 from public.coach_clients cc
          where cc.client_id=ws.client_id
            and cc.coach_id=(select auth.uid())
            and cc.status='active'
        )
      )
  )
);

create policy workout_cardio_insert_client
on public.workout_cardio_entries
for insert to authenticated
with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id=workout_cardio_entries.workout_session_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
);

create policy workout_cardio_update_client
on public.workout_cardio_entries
for update to authenticated
using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id=workout_cardio_entries.workout_session_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
)
with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id=workout_cardio_entries.workout_session_id
      and ws.client_id=(select auth.uid())
      and ws.status='in_progress'
  )
);

create policy feedback_threads_select
on public.feedback_threads
for select to authenticated
using (
  client_id=(select auth.uid())
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id=feedback_threads.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create policy feedback_threads_insert
on public.feedback_threads
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and (
    client_id=(select auth.uid())
    or exists (
      select 1 from public.coach_clients cc
      where cc.client_id=feedback_threads.client_id
        and cc.coach_id=(select auth.uid())
        and cc.status='active'
    )
  )
);

create policy feedback_threads_update_coach
on public.feedback_threads
for update to authenticated
using (
  exists (
    select 1 from public.coach_clients cc
    where cc.client_id=feedback_threads.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
)
with check (
  exists (
    select 1 from public.coach_clients cc
    where cc.client_id=feedback_threads.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create policy feedback_messages_select
on public.feedback_messages
for select to authenticated
using (
  exists (
    select 1 from public.feedback_threads ft
    where ft.id=feedback_messages.thread_id
      and (
        ft.client_id=(select auth.uid())
        or exists (
          select 1 from public.coach_clients cc
          where cc.client_id=ft.client_id
            and cc.coach_id=(select auth.uid())
            and cc.status='active'
        )
      )
  )
);

create policy feedback_messages_insert
on public.feedback_messages
for insert to authenticated
with check (
  author_id=(select auth.uid())
  and exists (
    select 1 from public.feedback_threads ft
    where ft.id=feedback_messages.thread_id
      and (
        ft.client_id=(select auth.uid())
        or exists (
          select 1 from public.coach_clients cc
          where cc.client_id=ft.client_id
            and cc.coach_id=(select auth.uid())
            and cc.status='active'
        )
      )
  )
);

create or replace function public.activate_training_program(p_program_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_client uuid;
begin
  select tp.client_id into v_client
  from public.training_programs tp
  where tp.id=p_program_id and tp.created_by=v_user;

  if not found then
    raise exception 'Program not found or access denied';
  end if;

  if v_client is null then
    raise exception 'Assign the program to a client before publishing';
  end if;

  if not exists (select 1 from public.training_days td where td.program_id=p_program_id) then
    raise exception 'Program has no sessions';
  end if;

  update public.training_programs
  set status='archived', is_active=false, updated_at=now()
  where client_id=v_client
    and created_by=v_user
    and id<>p_program_id
    and status='active';

  update public.training_programs
  set status='active', is_active=true, updated_at=now()
  where id=p_program_id and created_by=v_user;

  return p_program_id;
end;
$$;

create or replace function public.start_workout(p_training_day_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_program_id uuid;
  v_session_id uuid;
  v_existing uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select td.program_id into v_program_id
  from public.training_days td
  join public.training_programs tp on tp.id=td.program_id
  where td.id=p_training_day_id
    and tp.client_id=v_user
    and tp.status='active'
    and tp.is_active=true;

  if not found then
    raise exception 'Active session not available for this client';
  end if;

  select ws.id into v_existing
  from public.workout_sessions ws
  where ws.client_id=v_user
    and ws.training_day_id=p_training_day_id
    and ws.status='in_progress'
  order by ws.started_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.workout_sessions(client_id,training_day_id,program_id,status,started_at,updated_at)
  values(v_user,p_training_day_id,v_program_id,'in_progress',now(),now())
  returning id into v_session_id;

  insert into public.workout_exercises(
    workout_session_id,program_exercise_id,exercise_id,sort_order,
    prescribed_sets,reps_min,reps_max,rir_min,rir_max,rir_enabled,
    rest_seconds,allow_substitution,substitution_group_id,exercise_role,trainer_notes
  )
  select
    v_session_id,pe.id,pe.default_exercise_id,pe.sort_order,
    pe.sets_min,pe.reps_min,pe.reps_max,pe.rir_min,pe.rir_max,pe.rir_enabled,
    pe.rest_seconds,pe.allow_client_substitution,pe.substitution_group_id,
    pe.exercise_role,pe.notes
  from public.program_exercises pe
  where pe.training_day_id=p_training_day_id
  order by pe.sort_order;

  insert into public.workout_cardio_entries(
    workout_session_id,program_cardio_block_id,modality_code,name,sort_order,
    prescribed_duration_minutes,prescribed_hr_min,prescribed_hr_max,
    prescribed_rpe_min,prescribed_rpe_max,prescribed_speed_kmh,
    prescribed_incline_percent,prescribed_distance_km,trainer_notes
  )
  select
    v_session_id,pcb.id,pcb.modality_code,pcb.name,pcb.sort_order,
    pcb.duration_minutes,pcb.target_hr_min,pcb.target_hr_max,
    pcb.target_rpe_min,pcb.target_rpe_max,pcb.speed_kmh,
    pcb.incline_percent,pcb.distance_km,pcb.notes
  from public.program_cardio_blocks pcb
  where pcb.training_day_id=p_training_day_id
  order by pcb.sort_order;

  return v_session_id;
end;
$$;

create or replace function public.complete_workout(p_workout_session_id uuid, p_comment text default null)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  update public.workout_sessions
  set status='completed',
      completed_at=coalesce(completed_at,now()),
      comment=nullif(btrim(p_comment),''),
      updated_at=now()
  where id=p_workout_session_id
    and client_id=(select auth.uid())
    and status='in_progress';

  if not found then
    raise exception 'Workout not found or already completed';
  end if;

  return p_workout_session_id;
end;
$$;

create or replace function public.replace_workout_exercise(
  p_workout_exercise_id uuid,
  p_new_exercise_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_group uuid;
  v_current uuid;
begin
  select we.substitution_group_id,we.exercise_id
  into v_group,v_current
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=(select auth.uid())
    and ws.status='in_progress'
    and we.allow_substitution=true;

  if not found or v_group is null then
    raise exception 'Substitution is not allowed';
  end if;

  if not exists (
    select 1 from public.exercise_substitution_members esm
    where esm.group_id=v_group and esm.exercise_id=p_new_exercise_id
  ) then
    raise exception 'Exercise is not in the allowed substitution group';
  end if;

  update public.workout_exercises
  set exercise_id=p_new_exercise_id,
      substituted_from_exercise_id=coalesce(substituted_from_exercise_id,v_current)
  where id=p_workout_exercise_id;

  return p_workout_exercise_id;
end;
$$;

create or replace function public.add_workout_comment(
  p_workout_exercise_id uuid,
  p_body text
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_client uuid;
  v_session uuid;
  v_thread uuid;
begin
  if nullif(btrim(p_body),'') is null then
    raise exception 'Comment cannot be empty';
  end if;

  select ws.client_id,ws.id
  into v_client,v_session
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and (
      ws.client_id=v_user
      or exists (
        select 1 from public.coach_clients cc
        where cc.client_id=ws.client_id
          and cc.coach_id=v_user
          and cc.status='active'
      )
    );

  if not found then
    raise exception 'Workout exercise not found or access denied';
  end if;

  select ft.id into v_thread
  from public.feedback_threads ft
  where ft.workout_exercise_id=p_workout_exercise_id
    and ft.status<>'resolved'
  order by ft.created_at desc
  limit 1;

  if v_thread is null then
    insert into public.feedback_threads(
      client_id,workout_session_id,workout_exercise_id,context_type,status,created_by,updated_at
    )
    values(v_client,v_session,p_workout_exercise_id,'workout_exercise','new',v_user,now())
    returning id into v_thread;
  else
    update public.feedback_threads
    set status=case when v_user=v_client then 'new' else status end,
        updated_at=now(),
        resolved_at=null
    where id=v_thread;
  end if;

  insert into public.feedback_messages(thread_id,author_id,body)
  values(v_thread,v_user,btrim(p_body));

  return v_thread;
end;
$$;

create or replace function public.get_previous_exercise_sets(
  p_exercise_id uuid,
  p_before timestamptz default now()
)
returns jsonb
language sql
security invoker
set search_path=public,pg_temp
stable
as $$
  with previous_session as (
    select we.id as workout_exercise_id, ws.completed_at
    from public.workout_exercises we
    join public.workout_sessions ws on ws.id=we.workout_session_id
    where we.exercise_id=p_exercise_id
      and ws.client_id=(select auth.uid())
      and ws.status='completed'
      and ws.completed_at < p_before
    order by ws.completed_at desc
    limit 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'set_number',s.set_number,
        'weight_kg',s.weight_kg,
        'reps',s.reps,
        'rir',s.rir
      )
      order by s.set_number
    ),
    '[]'::jsonb
  )
  from previous_session ps
  join public.workout_sets s on s.workout_exercise_id=ps.workout_exercise_id
  where s.completed_at is not null;
$$;

revoke all on function public.activate_training_program(uuid) from public,anon;
revoke all on function public.start_workout(uuid) from public,anon;
revoke all on function public.complete_workout(uuid,text) from public,anon;
revoke all on function public.replace_workout_exercise(uuid,uuid) from public,anon;
revoke all on function public.add_workout_comment(uuid,text) from public,anon;
revoke all on function public.get_previous_exercise_sets(uuid,timestamptz) from public,anon;

grant execute on function public.activate_training_program(uuid) to authenticated;
grant execute on function public.start_workout(uuid) to authenticated;
grant execute on function public.complete_workout(uuid,text) to authenticated;
grant execute on function public.replace_workout_exercise(uuid,uuid) to authenticated;
grant execute on function public.add_workout_comment(uuid,text) to authenticated;
grant execute on function public.get_previous_exercise_sets(uuid,timestamptz) to authenticated;
