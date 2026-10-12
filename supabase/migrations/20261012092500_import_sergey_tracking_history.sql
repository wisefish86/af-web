-- One-off import from Google Sheet: "Дневник сопровождения (Сергей, 37 лет)".
-- Source tabs: Ежедневно, Вес и талия, Ежемесячно.

insert into public.client_targets(
  client_id,valid_from,calories_target,calorie_tolerance,protein_target_g,fat_min_g,fat_max_g,carbs_target_g,notes,created_by
) values (
  '73c2c668-af0b-4b05-8708-855e153b2746','2026-10-01',2300,100,146,55,92,null,
  'Импорт из дневника сопровождения: рабочий диапазон калорий 2200–2400; явная цель по углеводам в источнике не задана.',
  '72ac0dcb-b169-423c-856c-c1e150c2a187'
)
on conflict(client_id,valid_from) do update
set calories_target=excluded.calories_target,
    calorie_tolerance=excluded.calorie_tolerance,
    protein_target_g=excluded.protein_target_g,
    fat_min_g=excluded.fat_min_g,
    fat_max_g=excluded.fat_max_g,
    carbs_target_g=excluded.carbs_target_g,
    notes=excluded.notes,
    created_by=excluded.created_by;

insert into public.client_tracking_config(client_id,field_code,enabled,required,frequency,settings,configured_by,updated_at)
values
  ('73c2c668-af0b-4b05-8708-855e153b2746','fat',true,false,'daily','{}'::jsonb,'72ac0dcb-b169-423c-856c-c1e150c2a187',now()),
  ('73c2c668-af0b-4b05-8708-855e153b2746','carbs',true,false,'daily','{}'::jsonb,'72ac0dcb-b169-423c-856c-c1e150c2a187',now()),
  ('73c2c668-af0b-4b05-8708-855e153b2746','steps',true,false,'daily','{}'::jsonb,'72ac0dcb-b169-423c-856c-c1e150c2a187',now()),
  ('73c2c668-af0b-4b05-8708-855e153b2746','relationship_with_food',true,false,'monthly','{}'::jsonb,'72ac0dcb-b169-423c-856c-c1e150c2a187',now())
on conflict(client_id,field_code) do update
set enabled=excluded.enabled,
    required=excluded.required,
    frequency=excluded.frequency,
    settings=excluded.settings,
    configured_by=excluded.configured_by,
    updated_at=excluded.updated_at;

insert into public.daily_checkins(
  client_id,checkin_date,nutrition_mode,calories,protein_g,fat_g,carbs_g,steps,trained,
  hunger,energy,stress,sleep,ease,comment
) values
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-01','manual',2009,102.60,49.70,292.31,8361,true,1,4,1,3,4,null),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-02','manual',1921,99.40,74.39,224.07,12383,false,2,5,3,5,2,null),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-03','manual',1794,73.64,56.61,258.70,7231,false,1,5,4,5,4,null),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-04','manual',1144,56.41,37.29,159.33,15570,false,2,5,2,5,5,null),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-05','manual',1816,61.10,83.60,305.29,5217,true,1,5,3,2,5,null),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-06','manual',1902,110.28,41.67,263.85,6109,true,2,4,1,5,3,null),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-07','manual',1741,87.72,74.91,181.83,15461,false,2,2,3,1,3,null)
on conflict(client_id,checkin_date) do update
set nutrition_mode=excluded.nutrition_mode,
    calories=excluded.calories,
    protein_g=excluded.protein_g,
    fat_g=excluded.fat_g,
    carbs_g=excluded.carbs_g,
    steps=excluded.steps,
    trained=excluded.trained,
    hunger=excluded.hunger,
    energy=excluded.energy,
    stress=excluded.stress,
    sleep=excluded.sleep,
    ease=excluded.ease,
    comment=coalesce(daily_checkins.comment,excluded.comment);

insert into public.measurements(
  client_id,measured_at,weight_kg,waist_cm,chest_cm,hips_cm,thigh_cm,arm_relaxed_cm,arm_flexed_cm,note
) values
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-01',92.6,111,111,105,63,31,37,'на СТАРТ!'),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-02',92.3,111,null,null,null,null,null,'Вечером влупил виноград и яблоко'),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-03',92.5,111,null,null,null,null,null,'С Димой у родителей'),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-04',92.5,111,null,null,null,null,null,'С Димой у родителей'),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-05',91.6,111,null,null,null,null,null,'Замер после спорта'),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-06',91.3,111,null,null,null,null,null,'Замер после спорта'),
  ('73c2c668-af0b-4b05-8708-855e153b2746','2026-10-07',91.5,111,null,null,null,null,null,'Не было спорта')
on conflict(client_id,measured_at) do update
set weight_kg=coalesce(excluded.weight_kg,measurements.weight_kg),
    waist_cm=coalesce(excluded.waist_cm,measurements.waist_cm),
    chest_cm=coalesce(excluded.chest_cm,measurements.chest_cm),
    hips_cm=coalesce(excluded.hips_cm,measurements.hips_cm),
    thigh_cm=coalesce(excluded.thigh_cm,measurements.thigh_cm),
    arm_relaxed_cm=coalesce(excluded.arm_relaxed_cm,measurements.arm_relaxed_cm),
    arm_flexed_cm=coalesce(excluded.arm_flexed_cm,measurements.arm_flexed_cm),
    note=coalesce(excluded.note,measurements.note);

insert into public.monthly_checkins(
  client_id,checkin_date,appearance,fitness,physical_comfort,energy,sleep_recovery,nutrition,
  relationship_with_food,improve,next_step,keep,comment
) values (
  '73c2c668-af0b-4b05-8708-855e153b2746','2026-10-01',3,5,2,5,1,7,5,
  'Питание, сон, тренировки',
  'Режим сна в 23:00',
  '4 раза в зал спортивный',
  null
)
on conflict(client_id,checkin_date) do update
set appearance=excluded.appearance,
    fitness=excluded.fitness,
    physical_comfort=excluded.physical_comfort,
    energy=excluded.energy,
    sleep_recovery=excluded.sleep_recovery,
    nutrition=excluded.nutrition,
    relationship_with_food=excluded.relationship_with_food,
    improve=excluded.improve,
    next_step=excluded.next_step,
    keep=excluded.keep,
    comment=coalesce(monthly_checkins.comment,excluded.comment);

insert into public.client_task_completions(client_id,task_type,period_key,completed_at,note)
values(
  '73c2c668-af0b-4b05-8708-855e153b2746','progress_photo','2026-10','2026-10-01T12:00:00+03:00',
  'В исходной Google-таблице отмечено, что фото прогресса сделано; сам файл в таблице отсутствует.'
)
on conflict(client_id,task_type,period_key) do update
set completed_at=excluded.completed_at,
    note=excluded.note;
