-- QA-3 exercise media DB/Storage consistency smoke.
-- Read-only.

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.exercise_media em
  where em.storage_path is not null
    and not exists(
      select 1 from storage.objects o
      where o.bucket_id='exercise-media' and o.name=em.storage_path
    );
  if v_count<>0 then raise exception 'Exercise media rows with missing storage objects: %',v_count; end if;

  select count(*) into v_count
  from storage.objects o
  where o.bucket_id='exercise-media'
    and not exists(
      select 1 from public.exercise_media em
      where em.storage_path=o.name
    );
  if v_count<>0 then raise exception 'Unreferenced exercise media storage objects: %',v_count; end if;

  select count(*) into v_count
  from (
    select exercise_id,kind,created_by
    from public.exercise_media
    where created_by is not null
    group by exercise_id,kind,created_by
    having count(*)>1
  ) x;
  if v_count<>0 then raise exception 'Duplicate trainer-owned exercise media slots: %',v_count; end if;
end $$;
