alter table public.program_exercises
  add column if not exists warmup_rest_seconds integer not null default 60;

alter table public.workout_exercises
  add column if not exists warmup_rest_seconds integer not null default 60;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.program_exercises'::regclass
      and conname='program_exercises_warmup_rest_check'
  ) then
    alter table public.program_exercises
      add constraint program_exercises_warmup_rest_check
      check (warmup_rest_seconds between 15 and 300);
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.workout_exercises'::regclass
      and conname='workout_exercises_warmup_rest_check'
  ) then
    alter table public.workout_exercises
      add constraint workout_exercises_warmup_rest_check
      check (warmup_rest_seconds between 15 and 300);
  end if;
end $$;

alter table public.workout_sets drop constraint if exists workout_sets_set_number_check;
alter table public.workout_sets
  add constraint workout_sets_set_number_check check (set_number >= 0);

create or replace function public.configure_program_warmups(p_program_id uuid,p_items jsonb)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_item jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1 from public.training_programs
    where id=p_program_id and created_by=v_user and status='draft'
  ) then raise exception 'Draft program not found or access denied'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    update public.program_exercises pe
    set warmup_enabled=coalesce((v_item->>'warmup_enabled')::boolean,false),
        warmup_load_percent_min=coalesce(nullif(v_item->>'warmup_load_percent_min','')::numeric,50),
        warmup_load_percent_max=coalesce(nullif(v_item->>'warmup_load_percent_max','')::numeric,60),
        warmup_reps_min=coalesce(nullif(v_item->>'warmup_reps_min','')::integer,8),
        warmup_reps_max=coalesce(nullif(v_item->>'warmup_reps_max','')::integer,10),
        warmup_rest_seconds=coalesce(nullif(v_item->>'warmup_rest_seconds','')::integer,60),
        warmup_notes=nullif(btrim(v_item->>'warmup_notes'),'')
    from public.training_days td
    where pe.training_day_id=td.id
      and td.program_id=p_program_id
      and td.day_index=(v_item->>'day_index')::integer
      and pe.sort_order=(v_item->>'sort_order')::integer;
  end loop;
end;
$$;

create or replace function public.snapshot_workout_exercise_warmup()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  p public.program_exercises%rowtype;
begin
  if new.program_exercise_id is not null then
    select * into p from public.program_exercises where id=new.program_exercise_id;
    if found then
      new.warmup_enabled:=p.warmup_enabled;
      new.warmup_load_percent_min:=p.warmup_load_percent_min;
      new.warmup_load_percent_max:=p.warmup_load_percent_max;
      new.warmup_reps_min:=p.warmup_reps_min;
      new.warmup_reps_max:=p.warmup_reps_max;
      new.warmup_rest_seconds:=p.warmup_rest_seconds;
      new.warmup_notes:=p.warmup_notes;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.get_previous_exercise_sets(p_exercise_id uuid, p_before timestamptz default now())
returns jsonb
language sql
stable
set search_path=public,pg_temp
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
  where s.completed_at is not null
    and s.is_warmup=false
    and s.set_number>0;
$$;
