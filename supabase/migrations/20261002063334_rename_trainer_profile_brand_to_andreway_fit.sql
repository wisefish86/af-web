
update public.trainer_public_profiles
set headline=replace(headline,'Andrey Fitness','ANDREWAY Fit'),
    updated_at=now()
where headline ilike '%Andrey Fitness%';

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
      new.id,new.display_name,new.nickname,new.avatar_url,new.avatar_key,'Тренер ANDREWAY Fit',true
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
