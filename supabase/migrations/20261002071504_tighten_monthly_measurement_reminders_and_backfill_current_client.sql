
create or replace function public.reminder_completed(p_client_id uuid, p_type text, p_local_date date, p_timezone text)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
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
    when 'monthly_measurements' then not exists(
      select 1
      from public.client_tracking_config c
      where c.client_id=p_client_id
        and c.enabled=true
        and c.field_code in ('chest','hips','thigh','arm_relaxed','arm_flexed')
        and not exists(
          select 1
          from public.measurements m
          where m.client_id=p_client_id
            and date_trunc('month',m.measured_at::timestamp)=date_trunc('month',p_local_date::timestamp)
            and case c.field_code
              when 'chest' then m.chest_cm is not null
              when 'hips' then m.hips_cm is not null
              when 'thigh' then m.thigh_cm is not null
              when 'arm_relaxed' then m.arm_relaxed_cm is not null
              when 'arm_flexed' then m.arm_flexed_cm is not null
              else false
            end
        )
    )
    when 'monthly_checkin' then exists(
      select 1 from public.monthly_checkins m
      where m.client_id=p_client_id and m.checkin_date=p_local_date
    )
    when 'progress_photo' then exists(
      select 1 from public.client_task_completions c
      where c.client_id=p_client_id
        and c.task_type='progress_photo'
        and c.period_key=to_char(p_local_date,'YYYY-MM')
    )
    else false
  end;
$function$;

insert into public.reminder_rules(
  client_id,module_code,reminder_type,channel,local_time,weekdays,timezone,enabled,settings,
  created_by,name,channels,recipient_mode,skip_if_completed,title_template,body_template,action_path
)
values
('b15df890-8b72-49b8-b16f-5aa578bea2f0','progress','weight','in_app','08:00',array[1,3,6],'Europe/Moscow',true,'{}',
 '72ac0dcb-b169-423c-856c-c1e150c2a187','Взвешивание',array['in_app'],'client',true,'Пора взвеситься','Запиши утренний вес. Если уже записал — напоминание будет пропущено.','/progress'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','progress','waist','in_app','08:10',array[6],'Europe/Moscow',true,'{}',
 '72ac0dcb-b169-423c-856c-c1e150c2a187','Замер талии',array['in_app'],'client',true,'Пора измерить талию','Сегодня день контрольного замера талии.','/progress'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','progress','monthly_measurements','in_app','09:00',array[6],'Europe/Moscow',true,'{"period":"monthly"}',
 '72ac0dcb-b169-423c-856c-c1e150c2a187','Дополнительные замеры',array['in_app'],'client',true,'Ежемесячные замеры','Пора снять остальные объёмы, которые включены в твоём плане контроля прогресса.','/progress')
on conflict(client_id,reminder_type) do update
set module_code=excluded.module_code,
    local_time=excluded.local_time,
    weekdays=excluded.weekdays,
    timezone=excluded.timezone,
    enabled=true,
    settings=excluded.settings,
    channels=excluded.channels,
    recipient_mode=excluded.recipient_mode,
    skip_if_completed=excluded.skip_if_completed,
    title_template=excluded.title_template,
    body_template=excluded.body_template,
    action_path=excluded.action_path,
    updated_at=now(),
    last_processed_local_date=null;
