alter table public.exercise_media
  add column if not exists is_cover boolean not null default false;

create unique index if not exists exercise_media_one_cover_per_exercise_uq
  on public.exercise_media(exercise_id)
  where kind='image' and is_cover=true;

create or replace function public.set_my_exercise_media_cover(p_exercise_id uuid, p_media_id uuid)
returns uuid
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if not exists(
    select 1
    from public.exercise_media em
    where em.id=p_media_id
      and em.exercise_id=p_exercise_id
      and em.kind='image'
      and em.created_by=v_user
  ) then
    raise exception 'Image not found or access denied';
  end if;

  update public.exercise_media
  set is_cover=false
  where exercise_id=p_exercise_id
    and kind='image'
    and created_by=v_user
    and is_cover=true;

  update public.exercise_media
  set is_cover=true, sort_order=0
  where id=p_media_id
    and exercise_id=p_exercise_id
    and created_by=v_user;

  return p_media_id;
end;
$function$;

revoke all on function public.set_my_exercise_media_cover(uuid,uuid) from public;
revoke all on function public.set_my_exercise_media_cover(uuid,uuid) from anon;
grant execute on function public.set_my_exercise_media_cover(uuid,uuid) to authenticated;
