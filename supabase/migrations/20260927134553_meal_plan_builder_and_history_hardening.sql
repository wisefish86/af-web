
-- Stress-resistant training history + versioned meal-plan builder.

-- 1) Training program family/version lineage.
alter table public.training_programs
  add column if not exists family_id uuid,
  add column if not exists supersedes_program_id uuid references public.training_programs(id) on delete set null;

update public.training_programs set family_id=id where family_id is null;
alter table public.training_programs alter column family_id set not null;
alter table public.training_programs alter column family_id set default gen_random_uuid();

create index if not exists training_programs_family_version_idx
  on public.training_programs(family_id, version desc);

-- 2) Freeze published training content.
create or replace function public.guard_published_training_program()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Published or archived training programs are immutable; archive instead';
    end if;
    return old;
  end if;

  if old.status<>'draft' then
    if (to_jsonb(new) - array['status','is_active','updated_at']::text[])
       is distinct from
       (to_jsonb(old) - array['status','is_active','updated_at']::text[]) then
      raise exception 'Published or archived training program content is immutable; create a new version';
    end if;

    if old.status='archived' and new.status<>'archived' then
      raise exception 'Archived training programs cannot be reactivated; create a new version';
    end if;

    if old.status='active' and new.status not in ('active','archived') then
      raise exception 'Active training program can only remain active or be archived';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists training_program_history_guard on public.training_programs;
create trigger training_program_history_guard
before update or delete on public.training_programs
for each row execute function public.guard_published_training_program();

create or replace function public.guard_training_program_child()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_day_id uuid;
  v_program_id uuid;
  v_status text;
begin
  if tg_table_name='training_days' then
    v_program_id := case when tg_op='DELETE' then old.program_id else new.program_id end;
  elsif tg_table_name='program_exercises' then
    v_day_id := case when tg_op='DELETE' then old.training_day_id else new.training_day_id end;
    select td.program_id into v_program_id from public.training_days td where td.id=v_day_id;
  elsif tg_table_name='program_cardio_blocks' then
    v_day_id := case when tg_op='DELETE' then old.training_day_id else new.training_day_id end;
    select td.program_id into v_program_id from public.training_days td where td.id=v_day_id;
  end if;

  if v_program_id is not null then
    select tp.status into v_status from public.training_programs tp where tp.id=v_program_id;
    if v_status is distinct from 'draft' then
      raise exception 'Published training program content is immutable; create a new version';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists training_days_history_guard on public.training_days;
create trigger training_days_history_guard
before insert or update or delete on public.training_days
for each row execute function public.guard_training_program_child();

drop trigger if exists program_exercises_history_guard on public.program_exercises;
create trigger program_exercises_history_guard
before insert or update or delete on public.program_exercises
for each row execute function public.guard_training_program_child();

drop trigger if exists program_cardio_history_guard on public.program_cardio_blocks;
create trigger program_cardio_history_guard
before insert or update or delete on public.program_cardio_blocks
for each row execute function public.guard_training_program_child();

-- 3) Immutable-ish snapshots in workout history.
alter table public.workout_exercises
  add column if not exists prescribed_exercise_id uuid references public.exercises(id) on delete set null,
  add column if not exists prescribed_exercise_name_snapshot text,
  add column if not exists exercise_name_snapshot text,
  add column if not exists instructions_snapshot text,
  add column if not exists technique_url_snapshot text,
  add column if not exists primary_muscle_snapshot text,
  add column if not exists image_storage_path_snapshot text,
  add column if not exists image_external_url_snapshot text;

update public.workout_exercises we
set prescribed_exercise_id=coalesce(we.prescribed_exercise_id,we.substituted_from_exercise_id,we.exercise_id),
    prescribed_exercise_name_snapshot=coalesce(
      we.prescribed_exercise_name_snapshot,
      (select e.name from public.exercises e where e.id=coalesce(we.substituted_from_exercise_id,we.exercise_id))
    ),
    exercise_name_snapshot=coalesce(
      we.exercise_name_snapshot,
      (select e.name from public.exercises e where e.id=we.exercise_id)
    ),
    instructions_snapshot=coalesce(
      we.instructions_snapshot,
      (select e.instructions from public.exercises e where e.id=we.exercise_id)
    ),
    technique_url_snapshot=coalesce(
      we.technique_url_snapshot,
      (select e.technique_url from public.exercises e where e.id=we.exercise_id)
    )
where we.prescribed_exercise_id is null
   or we.prescribed_exercise_name_snapshot is null
   or we.exercise_name_snapshot is null;

create or replace function public.prevent_delete_referenced_exercise()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if exists(select 1 from public.program_exercises pe where pe.default_exercise_id=old.id)
     or exists(select 1 from public.workout_exercises we where we.exercise_id=old.id or we.prescribed_exercise_id=old.id) then
    raise exception 'Exercise is referenced by program/history. Set is_active=false instead of deleting it';
  end if;
  return old;
end;
$$;

drop trigger if exists exercise_reference_delete_guard on public.exercises;
create trigger exercise_reference_delete_guard
before delete on public.exercises
for each row execute function public.prevent_delete_referenced_exercise();

-- Snapshot exercise catalog data when a workout starts.
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
    workout_session_id,program_exercise_id,exercise_id,prescribed_exercise_id,sort_order,
    prescribed_sets,reps_min,reps_max,rir_min,rir_max,rir_enabled,
    rest_seconds,allow_substitution,substitution_group_id,substitution_policy,
    exercise_role,trainer_notes,
    prescribed_exercise_name_snapshot,exercise_name_snapshot,instructions_snapshot,
    technique_url_snapshot,primary_muscle_snapshot,image_storage_path_snapshot,image_external_url_snapshot
  )
  select
    v_session_id,pe.id,pe.default_exercise_id,pe.default_exercise_id,pe.sort_order,
    pe.sets_min,pe.reps_min,pe.reps_max,pe.rir_min,pe.rir_max,pe.rir_enabled,
    pe.rest_seconds,pe.allow_client_substitution,pe.substitution_group_id,
    pe.substitution_policy,pe.exercise_role,pe.notes,
    e.name,e.name,e.instructions,e.technique_url,
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
  from public.program_exercises pe
  join public.exercises e on e.id=pe.default_exercise_id
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
  v_current uuid;
begin
  select we.exercise_id into v_current
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=p_workout_exercise_id
    and ws.client_id=(select auth.uid())
    and ws.status='in_progress'
    and we.allow_substitution=true;

  if not found then
    raise exception 'Substitution is not allowed';
  end if;

  if not exists (
    select 1
    from public.get_allowed_workout_substitutions(p_workout_exercise_id) s
    where s.exercise_id=p_new_exercise_id
  ) then
    raise exception 'Exercise is not allowed by the substitution policy';
  end if;

  update public.workout_exercises we
  set exercise_id=p_new_exercise_id,
      substituted_from_exercise_id=coalesce(we.substituted_from_exercise_id,v_current),
      exercise_name_snapshot=e.name,
      instructions_snapshot=e.instructions,
      technique_url_snapshot=e.technique_url,
      primary_muscle_snapshot=(
        select emg.muscle_group_code
        from public.exercise_muscle_groups emg
        where emg.exercise_id=e.id and emg.role='primary'
        order by emg.muscle_group_code
        limit 1
      ),
      image_storage_path_snapshot=(
        select m.storage_path
        from public.exercise_media m
        where m.exercise_id=e.id and m.kind='image'
        order by m.sort_order,m.created_at
        limit 1
      ),
      image_external_url_snapshot=(
        select m.external_url
        from public.exercise_media m
        where m.exercise_id=e.id and m.kind='image'
        order by m.sort_order,m.created_at
        limit 1
      )
  from public.exercises e
  where we.id=p_workout_exercise_id and e.id=p_new_exercise_id;

  return p_workout_exercise_id;
end;
$$;

-- 4) Versioned nutrition plans. Published versions are never edited in place.
create table if not exists public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null default gen_random_uuid(),
  client_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  description text,
  daily_kcal_target integer not null check (daily_kcal_target between 500 and 10000),
  protein_target_g numeric(7,2) check (protein_target_g is null or protein_target_g >= 0),
  fat_target_g numeric(7,2) check (fat_target_g is null or fat_target_g >= 0),
  carbs_target_g numeric(7,2) check (carbs_target_g is null or carbs_target_g >= 0),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  version integer not null default 1 check (version>=1),
  created_by uuid not null references public.profiles(id) on delete restrict,
  supersedes_plan_id uuid references public.nutrition_plans(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists nutrition_plans_family_version_uq
  on public.nutrition_plans(family_id,version);
create index if not exists nutrition_plans_client_status_idx
  on public.nutrition_plans(client_id,status,created_at desc);
create index if not exists nutrition_plans_created_by_idx
  on public.nutrition_plans(created_by,created_at desc);

create table if not exists public.nutrition_plan_meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  name text not null,
  meal_type text not null default 'main' check (meal_type in ('main','light','snack')),
  sort_order integer not null default 100,
  kcal_target integer not null check (kcal_target between 0 and 5000),
  target_locked boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_plan_meals_plan_idx
  on public.nutrition_plan_meals(plan_id,sort_order);

create table if not exists public.nutrition_plan_meal_variants (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.nutrition_plan_meals(id) on delete cascade,
  name text not null default 'Основной вариант',
  sort_order integer not null default 100,
  is_default boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_plan_variants_meal_idx
  on public.nutrition_plan_meal_variants(meal_id,sort_order);

create table if not exists public.nutrition_plan_meal_items (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.nutrition_plan_meal_variants(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  food_name_snapshot text not null,
  grams numeric(9,2) not null check (grams>0 and grams<=10000),
  kcal_100_snapshot numeric(9,2) not null check (kcal_100_snapshot>=0),
  protein_100_snapshot numeric(9,2) not null default 0 check (protein_100_snapshot>=0),
  fat_100_snapshot numeric(9,2) not null default 0 check (fat_100_snapshot>=0),
  carbs_100_snapshot numeric(9,2) not null default 0 check (carbs_100_snapshot>=0),
  is_fixed boolean not null default false,
  sort_order integer not null default 100,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_plan_items_variant_idx
  on public.nutrition_plan_meal_items(variant_id,sort_order);
create index if not exists nutrition_plan_items_food_idx
  on public.nutrition_plan_meal_items(food_id);

-- Reusable coach-owned meals/recipes.
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  meal_type text not null default 'main' check (meal_type in ('main','light','snack')),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_meals_created_by_idx on public.saved_meals(created_by,is_active,name);

create table if not exists public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  food_name_snapshot text not null,
  grams numeric(9,2) not null check (grams>0 and grams<=10000),
  kcal_100_snapshot numeric(9,2) not null check (kcal_100_snapshot>=0),
  protein_100_snapshot numeric(9,2) not null default 0 check (protein_100_snapshot>=0),
  fat_100_snapshot numeric(9,2) not null default 0 check (fat_100_snapshot>=0),
  carbs_100_snapshot numeric(9,2) not null default 0 check (carbs_100_snapshot>=0),
  is_fixed boolean not null default false,
  sort_order integer not null default 100
);

create index if not exists saved_meal_items_meal_idx on public.saved_meal_items(saved_meal_id,sort_order);

-- Nutrition history guard.
create or replace function public.guard_published_nutrition_plan()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if tg_op='DELETE' then
    if old.status<>'draft' then
      raise exception 'Published nutrition plans are immutable; archive instead';
    end if;
    return old;
  end if;

  if old.status<>'draft' then
    if (to_jsonb(new) - array['status','updated_at']::text[])
       is distinct from
       (to_jsonb(old) - array['status','updated_at']::text[]) then
      raise exception 'Published nutrition plan content is immutable; create a new version';
    end if;

    if old.status='archived' and new.status<>'archived' then
      raise exception 'Archived nutrition plan cannot be reactivated; clone it as a new version';
    end if;

    if old.status='active' and new.status not in ('active','archived') then
      raise exception 'Active nutrition plan can only remain active or be archived';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nutrition_plan_history_guard on public.nutrition_plans;
create trigger nutrition_plan_history_guard
before update or delete on public.nutrition_plans
for each row execute function public.guard_published_nutrition_plan();

create or replace function public.guard_nutrition_plan_child()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_plan_id uuid;
  v_meal_id uuid;
  v_variant_id uuid;
  v_status text;
begin
  if tg_table_name='nutrition_plan_meals' then
    v_plan_id := case when tg_op='DELETE' then old.plan_id else new.plan_id end;
  elsif tg_table_name='nutrition_plan_meal_variants' then
    v_meal_id := case when tg_op='DELETE' then old.meal_id else new.meal_id end;
    select m.plan_id into v_plan_id from public.nutrition_plan_meals m where m.id=v_meal_id;
  elsif tg_table_name='nutrition_plan_meal_items' then
    v_variant_id := case when tg_op='DELETE' then old.variant_id else new.variant_id end;
    select m.plan_id into v_plan_id
    from public.nutrition_plan_meal_variants v
    join public.nutrition_plan_meals m on m.id=v.meal_id
    where v.id=v_variant_id;
  end if;

  if v_plan_id is not null then
    select p.status into v_status from public.nutrition_plans p where p.id=v_plan_id;
    if v_status is distinct from 'draft' then
      raise exception 'Published nutrition plan content is immutable; create a new version';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists nutrition_meals_history_guard on public.nutrition_plan_meals;
create trigger nutrition_meals_history_guard
before insert or update or delete on public.nutrition_plan_meals
for each row execute function public.guard_nutrition_plan_child();

drop trigger if exists nutrition_variants_history_guard on public.nutrition_plan_meal_variants;
create trigger nutrition_variants_history_guard
before insert or update or delete on public.nutrition_plan_meal_variants
for each row execute function public.guard_nutrition_plan_child();

drop trigger if exists nutrition_items_history_guard on public.nutrition_plan_meal_items;
create trigger nutrition_items_history_guard
before insert or update or delete on public.nutrition_plan_meal_items
for each row execute function public.guard_nutrition_plan_child();

-- RLS.
alter table public.nutrition_plans enable row level security;
alter table public.nutrition_plan_meals enable row level security;
alter table public.nutrition_plan_meal_variants enable row level security;
alter table public.nutrition_plan_meal_items enable row level security;
alter table public.saved_meals enable row level security;
alter table public.saved_meal_items enable row level security;

revoke all on public.nutrition_plans, public.nutrition_plan_meals,
  public.nutrition_plan_meal_variants, public.nutrition_plan_meal_items,
  public.saved_meals, public.saved_meal_items from anon;

grant select,insert,update,delete on public.nutrition_plans, public.nutrition_plan_meals,
  public.nutrition_plan_meal_variants, public.nutrition_plan_meal_items,
  public.saved_meals, public.saved_meal_items to authenticated;

drop policy if exists nutrition_plans_select on public.nutrition_plans;
create policy nutrition_plans_select on public.nutrition_plans
for select to authenticated
using (
  created_by=(select auth.uid())
  or client_id=(select auth.uid())
);

drop policy if exists nutrition_plans_insert on public.nutrition_plans;
create policy nutrition_plans_insert on public.nutrition_plans
for insert to authenticated
with check (
  created_by=(select auth.uid())
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer')
);

drop policy if exists nutrition_plans_update on public.nutrition_plans;
create policy nutrition_plans_update on public.nutrition_plans
for update to authenticated
using (created_by=(select auth.uid()))
with check (created_by=(select auth.uid()));

drop policy if exists nutrition_plans_delete on public.nutrition_plans;
create policy nutrition_plans_delete on public.nutrition_plans
for delete to authenticated
using (created_by=(select auth.uid()) and status='draft');

drop policy if exists nutrition_meals_select on public.nutrition_plan_meals;
create policy nutrition_meals_select on public.nutrition_plan_meals
for select to authenticated
using (exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id
    and (p.created_by=(select auth.uid()) or p.client_id=(select auth.uid()))
));

drop policy if exists nutrition_meals_write on public.nutrition_plan_meals;
create policy nutrition_meals_write on public.nutrition_plan_meals
for all to authenticated
using (exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id and p.created_by=(select auth.uid()) and p.status='draft'
))
with check (exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id and p.created_by=(select auth.uid()) and p.status='draft'
));

drop policy if exists nutrition_variants_select on public.nutrition_plan_meal_variants;
create policy nutrition_variants_select on public.nutrition_plan_meal_variants
for select to authenticated
using (exists(
  select 1 from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and (p.created_by=(select auth.uid()) or p.client_id=(select auth.uid()))
));

drop policy if exists nutrition_variants_write on public.nutrition_plan_meal_variants;
create policy nutrition_variants_write on public.nutrition_plan_meal_variants
for all to authenticated
using (exists(
  select 1 from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and p.created_by=(select auth.uid()) and p.status='draft'
))
with check (exists(
  select 1 from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));

drop policy if exists nutrition_items_select on public.nutrition_plan_meal_items;
create policy nutrition_items_select on public.nutrition_plan_meal_items
for select to authenticated
using (exists(
  select 1
  from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and (p.created_by=(select auth.uid()) or p.client_id=(select auth.uid()))
));

drop policy if exists nutrition_items_write on public.nutrition_plan_meal_items;
create policy nutrition_items_write on public.nutrition_plan_meal_items
for all to authenticated
using (exists(
  select 1
  from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and p.created_by=(select auth.uid()) and p.status='draft'
))
with check (exists(
  select 1
  from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));

drop policy if exists saved_meals_owner on public.saved_meals;
create policy saved_meals_owner on public.saved_meals
for all to authenticated
using (created_by=(select auth.uid()))
with check (created_by=(select auth.uid()));

drop policy if exists saved_meal_items_owner on public.saved_meal_items;
create policy saved_meal_items_owner on public.saved_meal_items
for all to authenticated
using (exists(
  select 1 from public.saved_meals sm
  where sm.id=saved_meal_items.saved_meal_id and sm.created_by=(select auth.uid())
))
with check (exists(
  select 1 from public.saved_meals sm
  where sm.id=saved_meal_items.saved_meal_id and sm.created_by=(select auth.uid())
));

-- Atomic save of a draft meal plan.
create or replace function public.save_nutrition_plan(p_plan jsonb)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plan_id uuid;
  v_client_id uuid;
  v_meal jsonb;
  v_variant jsonb;
  v_item jsonb;
  v_meal_id uuid;
  v_variant_id uuid;
  v_food_id uuid;
  v_food public.foods%rowtype;
  v_meal_sort integer := 0;
  v_variant_sort integer;
  v_item_sort integer;
  v_version integer := 1;
  v_family uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.role='trainer') then
    raise exception 'Trainer role required';
  end if;

  v_client_id := nullif(p_plan->>'client_id','')::uuid;
  if v_client_id is not null and not exists(
    select 1 from public.coach_clients cc
    where cc.coach_id=v_user and cc.client_id=v_client_id and cc.status='active'
  ) then
    raise exception 'Client is not assigned to this trainer';
  end if;

  v_plan_id := nullif(p_plan->>'id','')::uuid;

  if v_plan_id is null then
    insert into public.nutrition_plans(
      client_id,name,description,daily_kcal_target,protein_target_g,fat_target_g,carbs_target_g,
      status,created_by,notes
    ) values (
      v_client_id,
      coalesce(nullif(btrim(p_plan->>'name'),''),'План питания'),
      nullif(btrim(p_plan->>'description'),''),
      coalesce(nullif(p_plan->>'daily_kcal_target','')::integer,2000),
      nullif(p_plan->>'protein_target_g','')::numeric,
      nullif(p_plan->>'fat_target_g','')::numeric,
      nullif(p_plan->>'carbs_target_g','')::numeric,
      'draft',v_user,nullif(btrim(p_plan->>'notes'),'')
    )
    returning id into v_plan_id;
  else
    select p.family_id,p.version into v_family,v_version
    from public.nutrition_plans p
    where p.id=v_plan_id and p.created_by=v_user and p.status='draft';

    if not found then
      raise exception 'Draft nutrition plan not found or is already published';
    end if;

    update public.nutrition_plans
    set client_id=v_client_id,
        name=coalesce(nullif(btrim(p_plan->>'name'),''),'План питания'),
        description=nullif(btrim(p_plan->>'description'),''),
        daily_kcal_target=coalesce(nullif(p_plan->>'daily_kcal_target','')::integer,2000),
        protein_target_g=nullif(p_plan->>'protein_target_g','')::numeric,
        fat_target_g=nullif(p_plan->>'fat_target_g','')::numeric,
        carbs_target_g=nullif(p_plan->>'carbs_target_g','')::numeric,
        notes=nullif(btrim(p_plan->>'notes'),''),
        updated_at=now()
    where id=v_plan_id;

    delete from public.nutrition_plan_meals where plan_id=v_plan_id;
  end if;

  for v_meal in select value from jsonb_array_elements(coalesce(p_plan->'meals','[]'::jsonb))
  loop
    v_meal_sort := v_meal_sort + 10;
    insert into public.nutrition_plan_meals(
      plan_id,name,meal_type,sort_order,kcal_target,target_locked,notes
    ) values (
      v_plan_id,
      coalesce(nullif(btrim(v_meal->>'name'),''),'Приём пищи'),
      coalesce(nullif(v_meal->>'meal_type',''),'main'),
      v_meal_sort,
      greatest(0,coalesce(nullif(v_meal->>'kcal_target','')::integer,0)),
      coalesce((v_meal->>'target_locked')::boolean,false),
      nullif(btrim(v_meal->>'notes'),'')
    ) returning id into v_meal_id;

    v_variant_sort := 0;
    for v_variant in select value from jsonb_array_elements(coalesce(v_meal->'variants','[]'::jsonb))
    loop
      v_variant_sort := v_variant_sort + 10;
      insert into public.nutrition_plan_meal_variants(
        meal_id,name,sort_order,is_default,notes
      ) values (
        v_meal_id,
        coalesce(nullif(btrim(v_variant->>'name'),''),'Основной вариант'),
        v_variant_sort,
        coalesce((v_variant->>'is_default')::boolean,v_variant_sort=10),
        nullif(btrim(v_variant->>'notes'),'')
      ) returning id into v_variant_id;

      v_item_sort := 0;
      for v_item in select value from jsonb_array_elements(coalesce(v_variant->'items','[]'::jsonb))
      loop
        v_item_sort := v_item_sort + 10;
        v_food_id := nullif(v_item->>'food_id','')::uuid;

        if v_food_id is not null then
          select * into v_food from public.foods f where f.id=v_food_id and f.is_active=true;
          if not found then raise exception 'Food not found'; end if;

          insert into public.nutrition_plan_meal_items(
            variant_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,
            protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
          ) values (
            v_variant_id,v_food.id,v_food.name,
            coalesce(nullif(v_item->>'grams','')::numeric,coalesce(v_food.default_portion_g,100)),
            v_food.kcal_100,v_food.protein_100,v_food.fat_100,v_food.carbs_100,
            coalesce((v_item->>'is_fixed')::boolean,false),v_item_sort,
            nullif(btrim(v_item->>'notes'),'')
          );
        else
          if nullif(btrim(v_item->>'name'),'') is null then
            raise exception 'Custom food name is required';
          end if;

          insert into public.nutrition_plan_meal_items(
            variant_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,
            protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
          ) values (
            v_variant_id,null,btrim(v_item->>'name'),
            coalesce(nullif(v_item->>'grams','')::numeric,100),
            coalesce(nullif(v_item->>'kcal_100','')::numeric,0),
            coalesce(nullif(v_item->>'protein_100','')::numeric,0),
            coalesce(nullif(v_item->>'fat_100','')::numeric,0),
            coalesce(nullif(v_item->>'carbs_100','')::numeric,0),
            coalesce((v_item->>'is_fixed')::boolean,false),v_item_sort,
            nullif(btrim(v_item->>'notes'),'')
          );
        end if;
      end loop;
    end loop;
  end loop;

  return v_plan_id;
end;
$$;

-- Publish = freeze current version, archive previous active plan for the client.
create or replace function public.publish_nutrition_plan(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_client uuid;
begin
  select p.client_id into v_client
  from public.nutrition_plans p
  where p.id=p_plan_id and p.created_by=v_user and p.status='draft';

  if not found then raise exception 'Draft plan not found'; end if;
  if v_client is null then raise exception 'Assign the plan to a client before publishing'; end if;
  if not exists(select 1 from public.nutrition_plan_meals m where m.plan_id=p_plan_id) then
    raise exception 'Plan has no meals';
  end if;

  update public.nutrition_plans
  set status='archived',updated_at=now()
  where client_id=v_client and created_by=v_user and status='active' and id<>p_plan_id;

  update public.nutrition_plans
  set status='active',published_at=now(),updated_at=now()
  where id=p_plan_id;

  return p_plan_id;
end;
$$;

-- Clone any published plan into a new editable version.
create or replace function public.clone_nutrition_plan(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_source public.nutrition_plans%rowtype;
  v_new_plan uuid;
  v_old_meal record;
  v_new_meal uuid;
  v_old_variant record;
  v_new_variant uuid;
  v_next_version integer;
begin
  select * into v_source
  from public.nutrition_plans p
  where p.id=p_plan_id
    and p.created_by=v_user;

  if not found then raise exception 'Plan not found'; end if;

  select coalesce(max(version),0)+1 into v_next_version
  from public.nutrition_plans where family_id=v_source.family_id;

  insert into public.nutrition_plans(
    family_id,client_id,name,description,daily_kcal_target,protein_target_g,fat_target_g,carbs_target_g,
    status,version,created_by,supersedes_plan_id,notes
  ) values (
    v_source.family_id,v_source.client_id,v_source.name,v_source.description,v_source.daily_kcal_target,
    v_source.protein_target_g,v_source.fat_target_g,v_source.carbs_target_g,
    'draft',v_next_version,v_user,v_source.id,v_source.notes
  ) returning id into v_new_plan;

  for v_old_meal in select * from public.nutrition_plan_meals where plan_id=v_source.id order by sort_order
  loop
    insert into public.nutrition_plan_meals(plan_id,name,meal_type,sort_order,kcal_target,target_locked,notes)
    values(v_new_plan,v_old_meal.name,v_old_meal.meal_type,v_old_meal.sort_order,v_old_meal.kcal_target,v_old_meal.target_locked,v_old_meal.notes)
    returning id into v_new_meal;

    for v_old_variant in select * from public.nutrition_plan_meal_variants where meal_id=v_old_meal.id order by sort_order
    loop
      insert into public.nutrition_plan_meal_variants(meal_id,name,sort_order,is_default,notes)
      values(v_new_meal,v_old_variant.name,v_old_variant.sort_order,v_old_variant.is_default,v_old_variant.notes)
      returning id into v_new_variant;

      insert into public.nutrition_plan_meal_items(
        variant_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,
        protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order,notes
      )
      select v_new_variant,i.food_id,i.food_name_snapshot,i.grams,i.kcal_100_snapshot,
        i.protein_100_snapshot,i.fat_100_snapshot,i.carbs_100_snapshot,i.is_fixed,i.sort_order,i.notes
      from public.nutrition_plan_meal_items i
      where i.variant_id=v_old_variant.id
      order by i.sort_order;
    end loop;
  end loop;

  return v_new_plan;
end;
$$;

revoke all on function public.save_nutrition_plan(jsonb) from public,anon;
revoke all on function public.publish_nutrition_plan(uuid) from public,anon;
revoke all on function public.clone_nutrition_plan(uuid) from public,anon;
grant execute on function public.save_nutrition_plan(jsonb) to authenticated;
grant execute on function public.publish_nutrition_plan(uuid) to authenticated;
grant execute on function public.clone_nutrition_plan(uuid) to authenticated;
