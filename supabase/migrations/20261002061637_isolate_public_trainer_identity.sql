
alter table public.trainer_public_profiles
  add column if not exists public_name text,
  add column if not exists public_nickname text,
  add column if not exists public_avatar_url text,
  add column if not exists public_avatar_key text;

update public.trainer_public_profiles tp
set public_name=p.display_name,
    public_nickname=p.nickname,
    public_avatar_url=p.avatar_url,
    public_avatar_key=p.avatar_key
from public.profiles p
where p.id=tp.trainer_id;

create or replace function private.sync_trainer_public_identity()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if new.role='trainer' then
    insert into public.trainer_public_profiles(
      trainer_id,public_name,public_nickname,public_avatar_url,public_avatar_key,headline,is_published
    ) values(
      new.id,new.display_name,new.nickname,new.avatar_url,new.avatar_key,'Тренер Andrey Fitness',true
    )
    on conflict(trainer_id) do update
    set public_name=excluded.public_name,
        public_nickname=excluded.public_nickname,
        public_avatar_url=excluded.public_avatar_url,
        public_avatar_key=excluded.public_avatar_key,
        updated_at=now();
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_trainer_public_identity on public.profiles;
create trigger sync_trainer_public_identity
after insert or update of display_name,nickname,avatar_url,avatar_key,role
on public.profiles
for each row
execute function private.sync_trainer_public_identity();

drop policy if exists profiles_assigned_client_coach_select on public.profiles;
