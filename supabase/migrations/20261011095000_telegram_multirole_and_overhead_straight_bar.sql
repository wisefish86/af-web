-- Multi-role Telegram: one Telegram account may be linked to separate trainer/client profiles.
drop index if exists public.notification_channels_channel_external_uq;
create index if not exists notification_channels_channel_external_idx
  on public.notification_channels(channel,external_id)
  where external_id is not null and btrim(external_id)<>'';

alter table private.telegram_web_login_sessions
  add column if not exists requested_role text not null default 'client';

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='private.telegram_web_login_sessions'::regclass
      and conname='telegram_web_login_sessions_requested_role_check'
  ) then
    alter table private.telegram_web_login_sessions
      add constraint telegram_web_login_sessions_requested_role_check
      check(requested_role in ('client','trainer'));
  end if;
end $$;

drop function if exists public.create_telegram_web_login_session_service(text);
create function public.create_telegram_web_login_session_service(
  p_token_hash text,
  p_requested_role text default 'client'
)
returns void
language plpgsql
security definer
set search_path to 'public','private','pg_temp'
as $function$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid web login token'; end if;
  if p_requested_role not in ('client','trainer') then raise exception 'Invalid requested role'; end if;

  delete from private.telegram_web_login_sessions
  where expires_at < now()-interval '1 hour' or consumed_at < now()-interval '1 hour';

  insert into private.telegram_web_login_sessions(token_hash,requested_role,expires_at)
  values(p_token_hash,p_requested_role,now()+interval '10 minutes')
  on conflict(token_hash) do nothing;
end;
$function$;

drop function if exists public.read_telegram_web_login_session_service(text);
create function public.read_telegram_web_login_session_service(p_token_hash text)
returns table(
  status text,
  profile_id uuid,
  reason text,
  requested_role text,
  telegram_id text,
  expires_at timestamptz,
  consumed_at timestamptz
)
language sql
security definer
set search_path to 'public','private','pg_temp'
as $function$
  select s.status,s.profile_id,s.reason,s.requested_role,s.telegram_id,s.expires_at,s.consumed_at
  from private.telegram_web_login_sessions s
  where s.token_hash=p_token_hash
  limit 1;
$function$;

revoke all on function public.create_telegram_web_login_session_service(text,text) from public,anon,authenticated;
revoke all on function public.read_telegram_web_login_session_service(text) from public,anon,authenticated;
grant execute on function public.create_telegram_web_login_session_service(text,text) to service_role;
grant execute on function public.read_telegram_web_login_session_service(text) to service_role;

create or replace function public.consume_client_telegram_link_token_service(
  p_token text,
  p_telegram_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public','private','extensions','pg_temp'
as $function$
declare
  v_hash text;
  v_client_id uuid;
  v_existing_external text;
  v_timezone text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{36}$' then raise exception 'Invalid Telegram link token'; end if;
  if p_telegram_id is null or btrim(p_telegram_id)='' then raise exception 'Telegram user required'; end if;

  v_hash:=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex');

  select t.client_id into v_client_id
  from private.telegram_link_tokens t
  where t.token_hash=v_hash and t.used_at is null and t.expires_at>now()
  for update;

  if v_client_id is null then raise exception 'Telegram link expired or already used'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_client_id and p.role='client') then raise exception 'Client profile required'; end if;
  if not exists(select 1 from public.coach_clients cc where cc.client_id=v_client_id and cc.status='active') then raise exception 'Client is not active'; end if;

  select nc.external_id into v_existing_external
  from public.notification_channels nc
  where nc.client_id=v_client_id and nc.channel='telegram'
  limit 1;

  if v_existing_external is not null and v_existing_external<>p_telegram_id then
    raise exception 'Client Telegram is already linked to another account';
  end if;

  update private.telegram_link_tokens set used_at=now()
  where client_id=v_client_id and used_at is null;

  insert into public.notification_channels(client_id,channel,external_id,enabled,verified_at,metadata)
  values(v_client_id,'telegram',p_telegram_id,true,now(),coalesce(p_metadata,'{}'::jsonb))
  on conflict(client_id,channel) do update
    set external_id=excluded.external_id,enabled=true,verified_at=excluded.verified_at,metadata=excluded.metadata;

  select coalesce(p.timezone,'Europe/Moscow') into v_timezone
  from public.profiles p where p.id=v_client_id;

  insert into public.notification_preferences(user_id,telegram_enabled,timezone)
  values(v_client_id,true,coalesce(v_timezone,'Europe/Moscow'))
  on conflict(user_id) do update set telegram_enabled=true,updated_at=now();

  return v_client_id;
end;
$function$;

revoke all on function public.consume_client_telegram_link_token_service(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.consume_client_telegram_link_token_service(text,text,jsonb) to service_role;

-- Existing straight-bar pushdown stays. Add the overhead/stretch-biased straight-bar variant.
insert into public.exercises(
  code,name,muscle_group,instructions,is_active,created_by,description,equipment_code,
  movement_pattern_code,default_rest_seconds,technique_url,is_unilateral,mechanics,
  setup_notes,common_mistakes,exercise_type,tracking_type,aliases,load_increment_kg,exercise_scope
)
values(
  'TRICEPS_OVERHEAD_STRAIGHT_BAR_EXT',
  'Разгибание рук с прямой рукоятью из-за головы на верхнем блоке',
  'Трицепс',
  'Разгибай локти вперёд до почти полного выпрямления рук, сохраняя плечи неподвижными. Затем медленно согни локти и дай длинной головке трицепса хорошо растянуться за головой.',
  true,null,
  'Разгибание на верхнем блоке с прямой рукоятью спиной к блоку. Положение плеча над головой создаёт выраженное растяжение длинной головки трицепса.',
  'cable','elbow_extension',75,null,false,'isolation',
  'Встань спиной к верхнему блоку, возьми прямую рукоять хватом сверху и выведи её за голову. Слегка наклони корпус вперёд, локти держи относительно узко и направляй вперёд/вверх.',
  'Локти широко расходятся; движение плечами вместо локтей; чрезмерный прогиб поясницы; рывок корпусом; короткая амплитуда в растянутой позиции; слишком большой вес.',
  'isolation','weight_reps',
  array['Разгибание на трицепс из-за головы с прямой рукоятью','Overhead cable triceps extension с прямой рукоятью'],
  5,'global'
)
on conflict(code) do update set
  name=excluded.name,muscle_group=excluded.muscle_group,instructions=excluded.instructions,
  description=excluded.description,equipment_code=excluded.equipment_code,
  movement_pattern_code=excluded.movement_pattern_code,default_rest_seconds=excluded.default_rest_seconds,
  setup_notes=excluded.setup_notes,common_mistakes=excluded.common_mistakes,
  exercise_type=excluded.exercise_type,tracking_type=excluded.tracking_type,
  aliases=excluded.aliases,load_increment_kg=excluded.load_increment_kg,is_active=true,updated_at=now();

insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
select e.id,'triceps','primary' from public.exercises e
where e.code='TRICEPS_OVERHEAD_STRAIGHT_BAR_EXT'
on conflict do nothing;

insert into public.exercise_tag_links(exercise_id,tag_id)
select e.id,t.id from public.exercises e
join public.exercise_tags t on t.slug='equip-cable'
where e.code='TRICEPS_OVERHEAD_STRAIGHT_BAR_EXT'
on conflict do nothing;
