
create table if not exists public.trainer_contact_channels(
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check(channel in ('telegram','whatsapp','max')),
  url text not null check(url ~ '^https://'),
  label text,
  enabled boolean not null default true,
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(trainer_id,channel)
);

create index if not exists trainer_contact_channels_trainer_idx
on public.trainer_contact_channels(trainer_id);

alter table public.trainer_contact_channels enable row level security;

drop policy if exists trainer_contact_channels_read on public.trainer_contact_channels;
create policy trainer_contact_channels_read
on public.trainer_contact_channels
for select to authenticated
using(
  trainer_id=(select auth.uid())
  or exists(
    select 1
    from public.coach_clients cc
    where cc.coach_id=trainer_contact_channels.trainer_id
      and cc.client_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists trainer_contact_channels_insert_own on public.trainer_contact_channels;
create policy trainer_contact_channels_insert_own
on public.trainer_contact_channels
for insert to authenticated
with check(
  trainer_id=(select auth.uid())
  and exists(
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role='trainer'
  )
);

drop policy if exists trainer_contact_channels_update_own on public.trainer_contact_channels;
create policy trainer_contact_channels_update_own
on public.trainer_contact_channels
for update to authenticated
using(trainer_id=(select auth.uid()))
with check(trainer_id=(select auth.uid()));

drop policy if exists trainer_contact_channels_delete_own on public.trainer_contact_channels;
create policy trainer_contact_channels_delete_own
on public.trainer_contact_channels
for delete to authenticated
using(trainer_id=(select auth.uid()));
