-- Make trainer-owned exercise media activation atomic.
-- Storage upload happens first; this function atomically swaps the DB reference.

create or replace function public.replace_my_exercise_media(
  p_exercise_id uuid,
  p_kind text,
  p_storage_path text,
  p_sort_order integer default 0
)
returns table(id uuid, previous_storage_path text)
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_existing public.exercise_media%rowtype;
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_kind not in ('image','video') then raise exception 'Unsupported media kind'; end if;
  if nullif(btrim(p_storage_path),'') is null then raise exception 'Storage path is required'; end if;
  if p_sort_order<0 then raise exception 'Invalid sort order'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_user and p.role='trainer'
  ) then
    raise exception 'Trainer access required';
  end if;

  -- Serialize concurrent replacements for the same trainer-owned media slot.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_exercise_id::text||':'||p_kind||':'||v_user::text,0)
  );

  select m.*
  into v_existing
  from public.exercise_media m
  where m.exercise_id=p_exercise_id
    and m.kind=p_kind
    and m.created_by=v_user
  for update;

  if found then
    update public.exercise_media
    set storage_path=p_storage_path,
        external_url=null,
        caption=null,
        sort_order=p_sort_order,
        created_by=v_user
    where exercise_media.id=v_existing.id
    returning exercise_media.id into v_id;

    return query select v_id,v_existing.storage_path;
    return;
  end if;

  insert into public.exercise_media(
    exercise_id,kind,storage_path,external_url,caption,sort_order,created_by
  )
  values(
    p_exercise_id,p_kind,p_storage_path,null,null,p_sort_order,v_user
  )
  returning exercise_media.id into v_id;

  return query select v_id,null::text;
end;
$$;

revoke all on function public.replace_my_exercise_media(uuid,text,text,integer) from public,anon;
grant execute on function public.replace_my_exercise_media(uuid,text,text,integer) to authenticated;
