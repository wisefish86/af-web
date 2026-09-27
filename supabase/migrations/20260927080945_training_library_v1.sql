-- Exercise library v1: structured metadata, tags, media, rest defaults and safer workout inputs.

create table public.exercise_equipment (
  code text primary key,
  name text not null unique,
  sort_order integer not null default 100
);

create table public.movement_patterns (
  code text primary key,
  name text not null unique,
  sort_order integer not null default 100
);

create table public.exercise_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  created_by uuid references public.profiles(id) on delete cascade,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index exercise_tags_system_slug_idx on public.exercise_tags(slug) where is_system = true;
create unique index exercise_tags_owner_slug_idx on public.exercise_tags(created_by, slug) where created_by is not null;
create index exercise_tags_created_by_idx on public.exercise_tags(created_by);

create table public.exercise_tag_links (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  tag_id uuid not null references public.exercise_tags(id) on delete cascade,
  primary key (exercise_id, tag_id)
);
create index exercise_tag_links_tag_idx on public.exercise_tag_links(tag_id);

create table public.exercise_media (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  kind text not null default 'image' check (kind in ('image','video','animation')),
  storage_path text,
  external_url text,
  caption text,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (storage_path is not null and external_url is null)
    or (storage_path is null and external_url is not null)
  )
);
create index exercise_media_exercise_idx on public.exercise_media(exercise_id);
create index exercise_media_created_by_idx on public.exercise_media(created_by);

alter table public.exercises
  add column description text,
  add column equipment_code text references public.exercise_equipment(code),
  add column movement_pattern_code text references public.movement_patterns(code),
  add column default_rest_seconds integer not null default 120,
  add column technique_url text,
  add column is_unilateral boolean not null default false,
  add column updated_at timestamptz not null default now();

alter table public.exercises
  add constraint exercises_default_rest_seconds_check check (default_rest_seconds between 15 and 1800);

create index exercises_equipment_idx on public.exercises(equipment_code);
create index exercises_movement_pattern_idx on public.exercises(movement_pattern_code);

alter table public.program_exercises
  add column rest_seconds integer not null default 120,
  add column rir_enabled boolean not null default true,
  add column allow_client_substitution boolean not null default true;

alter table public.program_exercises
  add constraint program_exercises_rest_seconds_check check (rest_seconds between 15 and 1800),
  add constraint program_exercises_sets_range_check check (sets_min > 0 and sets_max >= sets_min),
  add constraint program_exercises_reps_range_check check (
    (reps_min is null and reps_max is null)
    or (reps_min is not null and reps_min > 0 and reps_max is not null and reps_max >= reps_min)
  ),
  add constraint program_exercises_rir_range_check check (
    (rir_min is null and rir_max is null)
    or (rir_min is not null and rir_min between 0 and 10 and rir_max is not null and rir_max between rir_min and 10)
  );

alter table public.workout_sets
  add column is_warmup boolean not null default false,
  add column completed_at timestamptz;

alter table public.workout_sets
  add constraint workout_sets_weight_check check (weight_kg is null or weight_kg >= 0),
  add constraint workout_sets_reps_check check (reps is null or reps >= 0),
  add constraint workout_sets_rir_check check (rir is null or rir between 0 and 10);

insert into public.exercise_equipment(code, name, sort_order) values
('bodyweight','Собственный вес',10),('dumbbell','Гантели',20),('barbell','Штанга',30),
('smith','Машина Смита',40),('cable','Кроссовер / блок',50),('machine','Тренажёр',60),
('kettlebell','Гиря',70),('bands','Резинки',80),('other','Другое',999)
on conflict (code) do nothing;

insert into public.movement_patterns(code, name, sort_order) values
('horizontal_push','Горизонтальный жим',10),('incline_push','Наклонный жим',20),
('vertical_push','Вертикальный жим',30),('horizontal_pull','Горизонтальная тяга',40),
('vertical_pull','Вертикальная тяга',50),('squat','Присед / жим ногами',60),
('hinge','Тазовый шарнир',70),('lunge','Выпады / сплит-присед',80),
('knee_flexion','Сгибание колена',90),('calf_raise','Подъём на носки',100),
('elbow_flexion','Сгибание локтя',110),('elbow_extension','Разгибание локтя',120),
('lateral_raise','Отведение плеча',130),('rear_delt','Задняя дельта',140),
('core','Кор',150),('shrug','Шраги',160),('other','Другое',999)
on conflict (code) do nothing;

alter table public.exercise_equipment enable row level security;
alter table public.movement_patterns enable row level security;
alter table public.exercise_tags enable row level security;
alter table public.exercise_tag_links enable row level security;
alter table public.exercise_media enable row level security;

revoke all on public.exercise_equipment, public.movement_patterns, public.exercise_tags,
  public.exercise_tag_links, public.exercise_media from anon;

grant select on public.exercise_equipment, public.movement_patterns, public.exercise_tags,
  public.exercise_tag_links, public.exercise_media to authenticated;
grant insert, update, delete on public.exercise_tags, public.exercise_tag_links, public.exercise_media to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;

create policy exercise_equipment_read on public.exercise_equipment for select to authenticated using (true);
create policy movement_patterns_read on public.movement_patterns for select to authenticated using (true);
create policy exercise_tags_read on public.exercise_tags for select to authenticated using (true);
create policy exercise_tag_links_read on public.exercise_tag_links for select to authenticated using (true);
create policy exercise_media_read on public.exercise_media for select to authenticated using (true);

create policy exercise_tags_insert_trainer on public.exercise_tags for insert to authenticated
with check (
  exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer')
  and is_system=false and created_by=(select auth.uid())
);
create policy exercise_tags_update_trainer on public.exercise_tags for update to authenticated
using (created_by=(select auth.uid()) and is_system=false)
with check (created_by=(select auth.uid()) and is_system=false);
create policy exercise_tags_delete_trainer on public.exercise_tags for delete to authenticated
using (created_by=(select auth.uid()) and is_system=false);

create policy exercise_tag_links_insert_trainer on public.exercise_tag_links for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy exercise_tag_links_delete_trainer on public.exercise_tag_links for delete to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));

create policy exercise_media_insert_trainer on public.exercise_media for insert to authenticated
with check (created_by=(select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy exercise_media_update_trainer on public.exercise_media for update to authenticated
using (created_by=(select auth.uid()))
with check (created_by=(select auth.uid()));
create policy exercise_media_delete_trainer on public.exercise_media for delete to authenticated
using (created_by=(select auth.uid()));

drop policy if exists exercises_insert_trainer on public.exercises;
drop policy if exists exercises_update_trainer on public.exercises;
drop policy if exists exercises_delete_trainer on public.exercises;

create policy exercises_insert_trainer on public.exercises for insert to authenticated
with check (created_by=(select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy exercises_update_trainer on public.exercises for update to authenticated
using (created_by=(select auth.uid()))
with check (created_by=(select auth.uid()));
create policy exercises_delete_trainer on public.exercises for delete to authenticated
using (created_by=(select auth.uid()));
