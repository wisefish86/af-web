-- QA-3 auth/storage hardening:
-- allow trainer read-after-upload checks in exercise-media storage
-- and prevent duplicate trainer-owned media slots.

create unique index if not exists exercise_media_owned_slot_uq
  on public.exercise_media(exercise_id,kind,created_by)
  where created_by is not null;

drop policy if exists exercise_media_storage_select_trainer on storage.objects;
create policy exercise_media_storage_select_trainer
on storage.objects
for select
to authenticated
using (
  bucket_id='exercise-media'
  and exists(
    select 1
    from public.profiles p
    where p.id=(select auth.uid())
      and p.role='trainer'
  )
);
