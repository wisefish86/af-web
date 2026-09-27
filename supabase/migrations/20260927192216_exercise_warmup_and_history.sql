alter table public.program_exercises
  add column if not exists warmup_enabled boolean not null default false,
  add column if not exists warmup_load_percent_min numeric not null default 50,
  add column if not exists warmup_load_percent_max numeric not null default 60,
  add column if not exists warmup_reps_min integer not null default 8,
  add column if not exists warmup_reps_max integer not null default 10,
  add column if not exists warmup_notes text;

alter table public.workout_exercises
  add column if not exists warmup_enabled boolean not null default false,
  add column if not exists warmup_load_percent_min numeric not null default 50,
  add column if not exists warmup_load_percent_max numeric not null default 60,
  add column if not exists warmup_reps_min integer not null default 8,
  add column if not exists warmup_reps_max integer not null default 10,
  add column if not exists warmup_notes text;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.program_exercises'::regclass and conname='program_exercises_warmup_percent_check') then
    alter table public.program_exercises add constraint program_exercises_warmup_percent_check
      check (warmup_load_percent_min between 1 and 100 and warmup_load_percent_max between warmup_load_percent_min and 100);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.program_exercises'::regclass and conname='program_exercises_warmup_reps_check') then
    alter table public.program_exercises add constraint program_exercises_warmup_reps_check
      check (warmup_reps_min between 1 and 50 and warmup_reps_max between warmup_reps_min and 50);
  end if;
end $$;

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
        warmup_notes=nullif(btrim(v_item->>'warmup_notes'),'')
    from public.training_days td
    where pe.training_day_id=td.id
      and td.program_id=p_program_id
      and td.day_index=(v_item->>'day_index')::integer
      and pe.sort_order=(v_item->>'sort_order')::integer;
  end loop;
end;
$$;

revoke all on function public.configure_program_warmups(uuid,jsonb) from public,anon;
grant execute on function public.configure_program_warmups(uuid,jsonb) to authenticated;

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
      new.warmup_notes:=p.warmup_notes;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_workout_exercise_warmup on public.workout_exercises;
create trigger trg_snapshot_workout_exercise_warmup
before insert on public.workout_exercises
for each row execute function public.snapshot_workout_exercise_warmup();

create or replace function public.get_my_exercise_history(p_exercise_id uuid,p_limit integer default 12)
returns table(
  workout_session_id uuid,
  workout_date date,
  completed_at timestamptz,
  sets jsonb
)
language sql
security invoker
stable
set search_path=public,pg_temp
as $$
  select
    ws.id,
    (coalesce(ws.completed_at,ws.started_at) at time zone coalesce(p.timezone,'Europe/Moscow'))::date,
    ws.completed_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'set_number',s.set_number,
          'weight_kg',s.weight_kg,
          'reps',s.reps,
          'rir',s.rir,
          'is_warmup',s.is_warmup,
          'completed_at',s.completed_at
        ) order by s.set_number
      ) filter(where s.id is not null),
      '[]'::jsonb
    )
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  join public.profiles p on p.id=ws.client_id
  left join public.workout_sets s on s.workout_exercise_id=we.id and s.completed_at is not null
  where ws.client_id=auth.uid()
    and we.exercise_id=p_exercise_id
    and ws.status='completed'
  group by ws.id,ws.started_at,ws.completed_at,p.timezone
  order by coalesce(ws.completed_at,ws.started_at) desc
  limit greatest(1,least(coalesce(p_limit,12),50));
$$;

revoke all on function public.get_my_exercise_history(uuid,integer) from public,anon;
grant execute on function public.get_my_exercise_history(uuid,integer) to authenticated;
