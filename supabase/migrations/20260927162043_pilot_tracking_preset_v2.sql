insert into public.tracking_fields(
  code,section,label,data_type,unit,default_enabled,default_required,client_can_disable,sort_order,validation
)
values(
  'monthly_energy','monthly','Энергия за месяц','rating',null,true,false,true,35,'{"min":1,"max":10}'::jsonb
)
on conflict(code) do update
set section=excluded.section,label=excluded.label,data_type=excluded.data_type,
    default_enabled=excluded.default_enabled,client_can_disable=excluded.client_can_disable,
    sort_order=excluded.sort_order,validation=excluded.validation;

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
    (p_client_id,'monthly_energy',true,false,'monthly','{}',p_coach_id),
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
    (p_client_id,'training','workout','in_app','18:00',array[1,3,5],'Europe/Moscow',true,'{}',p_coach_id,
      'Силовая тренировка',array['in_app'],'client',true,'Сегодня силовая','Открой тренировку, когда будешь готов начать.','/workouts'),
    (p_client_id,'nutrition','nutrition','in_app','21:00',array[1,2,3,4,5,6,7],'Europe/Moscow',true,'{}',p_coach_id,
      'Питание за день',array['in_app'],'client',true,'Как прошло питание?','Отметь соблюдение Meal Plan и, если нужно, перебор/недобор калорий.','/nutrition'),
    (p_client_id,'checkins','daily_checkin','in_app','21:10',array[1,2,3,4,5,6,7],'Europe/Moscow',true,'{}',p_coach_id,
      'Самочувствие',array['in_app'],'client',true,'Как самочувствие?','Коротко отметь энергию, сон, стресс, голод и насколько легко было соблюдать питание.','/'),
    (p_client_id,'progress','monthly_measurements','in_app','09:00',array[6],'Europe/Moscow',true,'{"period":"monthly"}',p_coach_id,
      'Дополнительные замеры',array['in_app'],'client',true,'Ежемесячные замеры','Если в этом месяце ещё не снимал объёмы — самое время.','/progress'),
    (p_client_id,'progress','progress_photo','in_app','09:15',array[6],'Europe/Moscow',true,'{"period":"monthly"}',p_coach_id,
      'Фото прогресса',array['in_app'],'client',true,'Фото прогресса','Сделай фото для себя в одинаковом свете и ракурсе. Загружать его в приложение не нужно.','/progress'),
    (p_client_id,'checkins','monthly_checkin','in_app','20:30',array[7],'Europe/Moscow',true,'{"period":"monthly"}',p_coach_id,
      'Ежемесячный обзор',array['in_app'],'client',true,'Итоги месяца','Коротко оцени самочувствие, форму, сон и питание за месяц.','/progress')
  on conflict do nothing;
end;
$$;
