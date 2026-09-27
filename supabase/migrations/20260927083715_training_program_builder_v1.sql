-- Training program builder v1: strength/cardio/mixed sessions and cardio blocks.

create table public.cardio_modalities (
  code text primary key,
  name text not null unique,
  sort_order integer not null default 100
);

insert into public.cardio_modalities(code,name,sort_order) values
('treadmill','Беговая дорожка',10),
('walking','Ходьба',20),
('running','Бег',30),
('bike','Велотренажёр',40),
('elliptical','Эллипс',50),
('rower','Гребной тренажёр',60),
('stair','Степпер / лестница',70),
('other','Другое',999)
on conflict (code) do nothing;

alter table public.training_programs
  add column status text not null default 'draft',
  add column weekly_frequency integer,
  add column updated_at timestamptz not null default now();

alter table public.training_programs
  add constraint training_programs_status_check check (status in ('draft','active','archived')),
  add constraint training_programs_weekly_frequency_check check (weekly_frequency is null or weekly_frequency between 1 and 14);

alter table public.training_days
  add column session_type text not null default 'strength',
  add column planned_duration_minutes integer;

alter table public.training_days
  add constraint training_days_session_type_check check (session_type in ('strength','cardio','mixed')),
  add constraint training_days_duration_check check (planned_duration_minutes is null or planned_duration_minutes between 5 and 600);

create table public.program_cardio_blocks (
  id uuid primary key default gen_random_uuid(),
  training_day_id uuid not null references public.training_days(id) on delete cascade,
  modality_code text not null references public.cardio_modalities(code),
  name text,
  sort_order integer not null default 100,
  duration_minutes integer,
  target_hr_min integer,
  target_hr_max integer,
  target_rpe_min numeric(3,1),
  target_rpe_max numeric(3,1),
  speed_kmh numeric(5,2),
  incline_percent numeric(5,2),
  distance_km numeric(6,2),
  notes text,
  created_at timestamptz not null default now(),
  check (duration_minutes is null or duration_minutes between 1 and 600),
  check (target_hr_min is null or target_hr_min between 30 and 250),
  check (target_hr_max is null or target_hr_max between 30 and 250),
  check (target_hr_min is null or target_hr_max is null or target_hr_max >= target_hr_min),
  check (target_rpe_min is null or target_rpe_min between 1 and 10),
  check (target_rpe_max is null or target_rpe_max between 1 and 10),
  check (target_rpe_min is null or target_rpe_max is null or target_rpe_max >= target_rpe_min),
  check (speed_kmh is null or speed_kmh >= 0),
  check (incline_percent is null or incline_percent between 0 and 40),
  check (distance_km is null or distance_km >= 0)
);

create index program_cardio_blocks_day_idx on public.program_cardio_blocks(training_day_id);
create index program_cardio_blocks_modality_idx on public.program_cardio_blocks(modality_code);

alter table public.cardio_modalities enable row level security;
alter table public.program_cardio_blocks enable row level security;

revoke all on public.cardio_modalities, public.program_cardio_blocks from anon;
grant select on public.cardio_modalities to authenticated;
grant select, insert, update, delete on public.program_cardio_blocks to authenticated;

create policy cardio_modalities_read on public.cardio_modalities
for select to authenticated using (true);

create policy program_cardio_blocks_select on public.program_cardio_blocks
for select to authenticated
using (
  exists (
    select 1 from public.training_days td
    join public.training_programs tp on tp.id=td.program_id
    where td.id=program_cardio_blocks.training_day_id
      and (tp.created_by=(select auth.uid()) or tp.client_id=(select auth.uid()))
  )
);

create policy program_cardio_blocks_insert on public.program_cardio_blocks
for insert to authenticated
with check (
  exists (
    select 1 from public.training_days td
    join public.training_programs tp on tp.id=td.program_id
    where td.id=program_cardio_blocks.training_day_id
      and tp.created_by=(select auth.uid())
  )
);

create policy program_cardio_blocks_update on public.program_cardio_blocks
for update to authenticated
using (
  exists (
    select 1 from public.training_days td
    join public.training_programs tp on tp.id=td.program_id
    where td.id=program_cardio_blocks.training_day_id
      and tp.created_by=(select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.training_days td
    join public.training_programs tp on tp.id=td.program_id
    where td.id=program_cardio_blocks.training_day_id
      and tp.created_by=(select auth.uid())
  )
);

create policy program_cardio_blocks_delete on public.program_cardio_blocks
for delete to authenticated
using (
  exists (
    select 1 from public.training_days td
    join public.training_programs tp on tp.id=td.program_id
    where td.id=program_cardio_blocks.training_day_id
      and tp.created_by=(select auth.uid())
  )
);

create or replace function public.create_training_program(p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_program_id uuid;
  v_day_id uuid;
  v_session jsonb;
  v_item jsonb;
  v_day_index integer := 0;
  v_sort integer;
  v_client_id uuid;
  v_exercise_id uuid;
  v_group_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if not exists (select 1 from public.profiles p where p.id=v_user and p.role='trainer')
    then raise exception 'Trainer role required'; end if;

  if nullif(btrim(p_program->>'name'),'') is null
    then raise exception 'Program name is required'; end if;

  v_client_id := nullif(p_program->>'client_id','')::uuid;

  if v_client_id is not null and not exists (
    select 1 from public.coach_clients cc
    where cc.coach_id=v_user and cc.client_id=v_client_id and cc.status='active'
  ) then raise exception 'Client is not assigned to this trainer'; end if;

  insert into public.training_programs(
    client_id,name,description,is_active,created_by,is_template,version,status,weekly_frequency,updated_at
  ) values (
    v_client_id,btrim(p_program->>'name'),nullif(btrim(p_program->>'description'),''),
    true,v_user,coalesce((p_program->>'is_template')::boolean,v_client_id is null),
    1,'draft',nullif(p_program->>'weekly_frequency','')::integer,now()
  ) returning id into v_program_id;

  for v_session in select value from jsonb_array_elements(coalesce(p_program->'sessions','[]'::jsonb))
  loop
    v_day_index := v_day_index + 1;

    insert into public.training_days(
      program_id,day_index,name,notes,session_type,planned_duration_minutes
    ) values (
      v_program_id,v_day_index,
      coalesce(nullif(btrim(v_session->>'name'),''),'Сессия ' || v_day_index),
      nullif(btrim(v_session->>'notes'),''),
      coalesce(nullif(v_session->>'session_type',''),'strength'),
      nullif(v_session->>'planned_duration_minutes','')::integer
    ) returning id into v_day_id;

    v_sort := 0;
    for v_item in select value from jsonb_array_elements(coalesce(v_session->'items','[]'::jsonb))
    loop
      v_sort := v_sort + 10;

      if v_item->>'type'='exercise' then
        v_exercise_id := nullif(v_item->>'exercise_id','')::uuid;
        if v_exercise_id is null or not exists (
          select 1 from public.exercises e where e.id=v_exercise_id and e.is_active=true
        ) then raise exception 'Exercise not found'; end if;

        v_group_id := nullif(v_item->>'substitution_group_id','')::uuid;
        if v_group_id is not null and not exists (
          select 1 from public.exercise_substitution_groups g where g.id=v_group_id
        ) then raise exception 'Substitution group not found'; end if;

        insert into public.program_exercises(
          training_day_id,substitution_group_id,default_exercise_id,sort_order,
          sets_min,sets_max,reps_min,reps_max,rir_min,rir_max,notes,
          exercise_role,progression_notes,rest_seconds,rir_enabled,allow_client_substitution
        ) values (
          v_day_id,v_group_id,v_exercise_id,v_sort,
          coalesce(nullif(v_item->>'sets_min','')::integer,3),
          coalesce(nullif(v_item->>'sets_max','')::integer,coalesce(nullif(v_item->>'sets_min','')::integer,3)),
          nullif(v_item->>'reps_min','')::integer,nullif(v_item->>'reps_max','')::integer,
          nullif(v_item->>'rir_min','')::numeric,nullif(v_item->>'rir_max','')::numeric,
          nullif(btrim(v_item->>'notes'),''),
          coalesce(nullif(v_item->>'exercise_role',''),'main'),
          nullif(btrim(v_item->>'progression_notes'),''),
          coalesce(nullif(v_item->>'rest_seconds','')::integer,120),
          coalesce((v_item->>'rir_enabled')::boolean,true),
          coalesce((v_item->>'allow_client_substitution')::boolean,true)
        );

      elsif v_item->>'type'='cardio' then
        insert into public.program_cardio_blocks(
          training_day_id,modality_code,name,sort_order,duration_minutes,target_hr_min,target_hr_max,
          target_rpe_min,target_rpe_max,speed_kmh,incline_percent,distance_km,notes
        ) values (
          v_day_id,coalesce(nullif(v_item->>'modality_code',''),'other'),
          nullif(btrim(v_item->>'name'),''),v_sort,
          nullif(v_item->>'duration_minutes','')::integer,
          nullif(v_item->>'target_hr_min','')::integer,nullif(v_item->>'target_hr_max','')::integer,
          nullif(v_item->>'target_rpe_min','')::numeric,nullif(v_item->>'target_rpe_max','')::numeric,
          nullif(v_item->>'speed_kmh','')::numeric,nullif(v_item->>'incline_percent','')::numeric,
          nullif(v_item->>'distance_km','')::numeric,nullif(btrim(v_item->>'notes'),'')
        );
      else
        raise exception 'Unsupported training item type: %', v_item->>'type';
      end if;
    end loop;
  end loop;

  return v_program_id;
end;
$$;

revoke all on function public.create_training_program(jsonb) from public, anon;
grant execute on function public.create_training_program(jsonb) to authenticated;
