create table if not exists public.trainer_public_profiles(
  trainer_id uuid primary key references public.profiles(id) on delete cascade,
  headline text,
  welcome_message text,
  about_text text,
  experience_text text,
  approach_text text,
  specialties_text text,
  education_text text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trainer_public_profiles enable row level security;

drop policy if exists trainer_public_profiles_read on public.trainer_public_profiles;
create policy trainer_public_profiles_read
on public.trainer_public_profiles
for select to authenticated
using(
  trainer_id=(select auth.uid())
  or (
    is_published=true
    and exists(
      select 1
      from public.coach_clients cc
      where cc.coach_id=trainer_public_profiles.trainer_id
        and cc.client_id=(select auth.uid())
        and cc.status='active'
    )
  )
);

drop policy if exists trainer_public_profiles_insert_own on public.trainer_public_profiles;
create policy trainer_public_profiles_insert_own
on public.trainer_public_profiles
for insert to authenticated
with check(
  trainer_id=(select auth.uid())
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='trainer'
  )
);

drop policy if exists trainer_public_profiles_update_own on public.trainer_public_profiles;
create policy trainer_public_profiles_update_own
on public.trainer_public_profiles
for update to authenticated
using(trainer_id=(select auth.uid()))
with check(trainer_id=(select auth.uid()));

drop policy if exists profiles_assigned_client_coach_select on public.profiles;
create policy profiles_assigned_client_coach_select
on public.profiles
for select to authenticated
using(
  role='trainer'
  and exists(
    select 1
    from public.coach_clients cc
    where cc.coach_id=profiles.id
      and cc.client_id=(select auth.uid())
      and cc.status='active'
  )
);

alter table public.trainer_contact_channels
drop constraint if exists trainer_contact_channels_channel_check;

alter table public.trainer_contact_channels
add constraint trainer_contact_channels_channel_check
check(channel ~ '^[a-z0-9_-]{2,32}$');

alter table public.trainer_contact_channels
drop constraint if exists trainer_contact_channels_url_check;

alter table public.trainer_contact_channels
add constraint trainer_contact_channels_url_check
check(url ~ '^(https://|tel:\+)');

insert into public.trainer_public_profiles(trainer_id,headline,is_published)
select id,'Тренер Andrey Fitness',true
from public.profiles
where role='trainer'
on conflict(trainer_id) do nothing;

-- Trainer contact values are runtime profile data, not migration data.
-- Configure them through the trainer UI / production data instead of hardcoding PII here.
