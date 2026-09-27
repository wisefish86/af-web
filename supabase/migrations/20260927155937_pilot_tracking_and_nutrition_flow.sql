alter table public.daily_checkins
  add column if not exists nutrition_deviation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.daily_checkins'::regclass
      and conname='daily_checkins_nutrition_deviation_check'
  ) then
    alter table public.daily_checkins
      add constraint daily_checkins_nutrition_deviation_check
      check (nutrition_deviation is null or nutrition_deviation in ('about_target','over','under','unknown'));
  end if;
end $$;

create table if not exists public.client_task_completions(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete restrict,
  task_type text not null,
  period_key text not null,
  completed_at timestamptz not null default now(),
  note text,
  unique(client_id,task_type,period_key)
);

create index if not exists client_task_completions_client_idx
  on public.client_task_completions(client_id,task_type,period_key);

alter table public.client_task_completions enable row level security;
revoke all on public.client_task_completions from anon;
grant select,insert,update on public.client_task_completions to authenticated;

drop policy if exists client_task_completions_access on public.client_task_completions;
create policy client_task_completions_access on public.client_task_completions
for all to authenticated
using (
  client_id=(select auth.uid())
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_task_completions.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
)
with check (
  client_id=(select auth.uid())
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_task_completions.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create or replace function public.mark_my_task_complete(p_task_type text)
returns void
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_period text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_task_type not in ('progress_photo') then raise exception 'Unsupported task type'; end if;
  v_period:=to_char(current_date,'YYYY-MM');

  insert into public.client_task_completions(client_id,task_type,period_key,completed_at)
  values(v_user,p_task_type,v_period,now())
  on conflict(client_id,task_type,period_key)
  do update set completed_at=excluded.completed_at;
end;
$$;

revoke all on function public.mark_my_task_complete(text) from public,anon;
grant execute on function public.mark_my_task_complete(text) to authenticated;

create or replace function public.save_my_nutrition_checkin(
  p_date date,
  p_mode text,
  p_adherence text default null,
  p_deviation text default null,
  p_calories integer default null,
  p_protein_g numeric default null,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('meal_plan','manual') then raise exception 'Invalid nutrition mode'; end if;
  if p_deviation is not null and p_deviation not in ('about_target','over','under','unknown') then
    raise exception 'Invalid nutrition deviation';
  end if;

  if p_mode='meal_plan' then
    if p_adherence is null or p_adherence not in ('followed','partial','not_followed') then
      raise exception 'Adherence is required for meal-plan mode';
    end if;
    if p_plan_id is not null and not exists(
      select 1 from public.nutrition_plans p
      where p.id=p_plan_id and p.client_id=v_user and p.status in ('active','archived')
    ) then
      raise exception 'Nutrition plan not available';
    end if;
  else
    p_adherence:=null;
    p_plan_id:=null;
  end if;

  insert into public.daily_checkins(
    client_id,checkin_date,nutrition_mode,nutrition_adherence,nutrition_deviation,
    calories,protein_g,nutrition_plan_id
  ) values (
    v_user,coalesce(p_date,current_date),p_mode,p_adherence,p_deviation,
    p_calories,p_protein_g,p_plan_id
  )
  on conflict(client_id,checkin_date) do update
  set nutrition_mode=excluded.nutrition_mode,
      nutrition_adherence=excluded.nutrition_adherence,
      nutrition_deviation=excluded.nutrition_deviation,
      calories=excluded.calories,
      protein_g=excluded.protein_g,
      nutrition_plan_id=excluded.nutrition_plan_id
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_my_nutrition_checkin(date,text,text,text,integer,numeric,uuid) from public,anon;
grant execute on function public.save_my_nutrition_checkin(date,text,text,text,integer,numeric,uuid) to authenticated;

create or replace function public.reminder_completed(
  p_client_id uuid,
  p_type text,
  p_local_date date,
  p_timezone text
)
returns boolean
language sql
security definer
stable
set search_path=public,pg_temp
as $$
  select case p_type
    when 'weight' then exists(
      select 1 from public.measurements m
      where m.client_id=p_client_id and m.measured_at=p_local_date and m.weight_kg is not null
    )
    when 'waist' then exists(
      select 1 from public.measurements m
      where m.client_id=p_client_id and m.measured_at=p_local_date and m.waist_cm is not null
    )
    when 'nutrition' then exists(
      select 1 from public.daily_checkins d
      where d.client_id=p_client_id and d.checkin_date=p_local_date
        and (d.nutrition_adherence is not null or d.nutrition_deviation is not null or d.calories is not null or d.protein_g is not null)
    )
    when 'daily_checkin' then exists(
      select 1 from public.daily_checkins d
      where d.client_id=p_client_id and d.checkin_date=p_local_date
        and (d.hunger is not null or d.energy is not null or d.stress is not null or d.sleep is not null or d.ease is not null or nullif(btrim(d.comment),'') is not null)
    )
    when 'workout' then exists(
      select 1 from public.workout_sessions w
      where w.client_id=p_client_id and w.status='completed'
        and (coalesce(w.completed_at,w.started_at) at time zone p_timezone)::date=p_local_date
    )
    when 'monthly_measurements' then exists(
      select 1 from public.measurements m
      where m.client_id=p_client_id
        and date_trunc('month',m.measured_at::timestamp)=date_trunc('month',p_local_date::timestamp)
        and (m.chest_cm is not null or m.hips_cm is not null or m.thigh_cm is not null
             or m.arm_relaxed_cm is not null or m.arm_flexed_cm is not null)
    )
    when 'monthly_checkin' then exists(
      select 1 from public.monthly_checkins m
      where m.client_id=p_client_id
        and date_trunc('month',m.checkin_date::timestamp)=date_trunc('month',p_local_date::timestamp)
    )
    when 'progress_photo' then exists(
      select 1 from public.client_task_completions c
      where c.client_id=p_client_id
        and c.task_type='progress_photo'
        and c.period_key=to_char(p_local_date,'YYYY-MM')
    )
    else false
  end;
$$;

revoke all on function public.reminder_completed(uuid,text,date,text) from public,anon,authenticated;

create or replace function private.apply_default_client_setup(p_client_id uuid,p_coach_id uuid)
returns void
language plpgsql
security definer
set search_path=public,private,pg_temp
as $$
begin
  insert into public.client_tracking_config(client_id,field_code,enabled,required,frequency,settings,configured_by)
  values
    (p_client_id,'calories',true,false,'daily','{}',p_coach_id),
    (p_client_id,'protein',true,false,'daily','{}',p_coach_id),
    (p_client_id,'trained',true,false,'daily','{}',p_coach_id),
    (p_client_id,'hunger',true,false,'daily','{}',p_coach_id),
    (p_client_id,'energy',true,false,'daily','{}',p_coach_id),
    (p_client_id,'stress',true,false,'daily','{}',p_coach_id),
    (p_client_id,'sleep',true,false,'daily','{}',p_coach_id),
    (p_client_id,'ease',true,false,'daily','{}',p_coach_id),
    (p_client_id,'weight',true,false,'3x_week','{"weekdays":[1,3,6],"time":"08:00"}',p_coach_id),
    (p_client_id,'waist',true,false,'weekly','{"weekdays":[6],"time":"08:10"}',p_coach_id),
    (p_client_id,'chest',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'hips',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'thigh',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'arm_relaxed',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'arm_flexed',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'appearance',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'fitness',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'physical_comfort',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'sleep_recovery',true,false,'monthly','{}',p_coach_id),
    (p_client_id,'nutrition',true,false,'monthly','{}',p_coach_id)
  on conflict(client_id,field_code) do update
  set enabled=excluded.enabled,required=excluded.required,frequency=excluded.frequency,
      settings=excluded.settings,configured_by=excluded.configured_by,updated_at=now();

  insert into public.reminder_rules(
    client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,enabled,settings,
    created_by,name,channels,recipient_mode,skip_if_completed,title_template,body_template,action_path
  )
  values
    (p_client_id,'progress','weight','in_app','08:00',array[1,3,6],'Europe/Moscow',true,'{}',p_coach_id,
      'Взвешивание',array['in_app'],'client',true,'Утреннее взвешивание','Запиши вес. Если уже записал — это напоминание будет пропущено.','/progress'),
    (p_client_id,'progress','waist','in_app','08:10',array[6],'Europe/Moscow',true,'{}',p_coach_id,
      'Замер талии',array['in_app'],'client',true,'Замер талии','Сегодня день контрольного замера талии.','/progress'),
    (p_client_id,'nutrition','nutrition','in_app','21:00',array[1,2,3,4,5,6,7],'Europe/Moscow',true,'{}',p_coach_id,
      'Питание за день',array['in_app'],'client',true,'Как прошло питание?','Отметь соблюдение Meal Plan и, если нужно, перебор/недобор калорий.','/nutrition'),
    (p_client_id,'checkins','daily_checkin','in_app','21:10',array[1,2,3,4,5,6,7],'Europe/Moscow',true,'{}',p_coach_id,
      'Самочувствие',array['in_app'],'client',true,'Как самочувствие?','Коротко отметь энергию, сон, стресс, голод и насколько легко было соблюдать питание.','/'),
    (p_client_id,'progress','monthly_measurements','in_app','09:00',array[6],'Europe/Moscow',true,'{"period":"monthly"}',p_coach_id,
      'Дополнительные замеры',array['in_app'],'client',true,'Ежемесячные замеры','Если в этом месяце ещё не снимал объёмы — самое время.','/progress'),
    (p_client_id,'progress','progress_photo','in_app','09:15',array[6],'Europe/Moscow',true,'{"period":"monthly"}',p_coach_id,
      'Фото прогресса',array['in_app'],'client',true,'Фото прогресса','Сделай фото для себя в одинаковом свете и ракурсе. Загружать его в приложение не нужно.','/progress'),
    (p_client_id,'checkins','monthly_checkin','in_app','20:30',array[7],'Europe/Moscow',true,'{"period":"monthly"}',p_coach_id,
      'Ежемесячный обзор',array['in_app'],'client',true,'Итоги месяца','Коротко оцени самочувствие, форму, сон и питание за месяц.','/')
  on conflict do nothing;
end;
$$;

create or replace function public.accept_client_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path=public,private,extensions,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_hash text;
  v_invite public.client_invites%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_token),'') is null then raise exception 'Invite token is required'; end if;

  if not exists(select 1 from public.profiles p where p.id=v_user and p.role='client') then
    raise exception 'Only client accounts can accept client invitations';
  end if;

  v_hash:=encode(digest(convert_to(btrim(p_token),'UTF8'),'sha256'),'hex');

  select * into v_invite
  from public.client_invites i
  where i.token_hash=v_hash
  for update;

  if not found then raise exception 'Invitation not found'; end if;
  if v_invite.revoked_at is not null then raise exception 'Invitation was revoked'; end if;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by=v_user then return v_invite.coach_id; end if;
    raise exception 'Invitation has already been used';
  end if;
  if v_invite.expires_at<=now() then raise exception 'Invitation has expired'; end if;

  insert into public.coach_clients(coach_id,client_id,status,started_at)
  values(v_invite.coach_id,v_user,'active',current_date)
  on conflict(coach_id,client_id) do update
  set status='active',ended_at=null;

  insert into public.client_modules(client_id,module_code,enabled,assigned_by,settings)
  values
    (v_user,'nutrition',true,v_invite.coach_id,'{"tracking_mode":"auto"}'::jsonb),
    (v_user,'training',true,v_invite.coach_id,'{}'::jsonb),
    (v_user,'progress',true,v_invite.coach_id,'{}'::jsonb),
    (v_user,'checkins',true,v_invite.coach_id,'{}'::jsonb),
    (v_user,'notifications',true,v_invite.coach_id,'{}'::jsonb)
  on conflict(client_id,module_code) do update
  set enabled=true,ends_at=null,assigned_by=excluded.assigned_by,updated_at=now();

  perform private.apply_default_client_setup(v_user,v_invite.coach_id);

  update public.client_invites
  set accepted_at=now(),accepted_by=v_user
  where id=v_invite.id;

  return v_invite.coach_id;
end;
$$;
