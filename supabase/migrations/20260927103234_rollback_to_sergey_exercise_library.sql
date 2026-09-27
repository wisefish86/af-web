-- Roll back the accidental import from the unrelated "Новая таблица/тренировки".
-- Keep the exercise taxonomy/UI improvements, but return the library to the 32 exercises
-- from "Дневник сопровождения (Сергей, 37 лет)" -> "[-] Тренировки".

create temporary table tmp_sergey_exercises(
  code text primary key,
  source_name text not null,
  group_code text not null,
  priority integer not null,
  is_default boolean not null,
  match_type text not null,
  notes text
) on commit drop;

insert into tmp_sergey_exercises(code,source_name,group_code,priority,is_default,match_type,notes) values
('CHEST_UPPER_DB_PRESS','Жим гантелей на наклонной скамье (25–35°)','CHEST_UPPER_PRESS',10,true,'direct','Основной вариант из дневника Сергея'),
('CHEST_UPPER_BB_PRESS','Жим штанги на наклонной скамье','CHEST_UPPER_PRESS',20,false,'direct',null),
('CHEST_UPPER_SMITH_PRESS','Жим в тренажёре Смита на наклонной скамье','CHEST_UPPER_PRESS',30,false,'direct','Фиксированная траектория'),

('BACK_MID_CABLE_ROW','Горизонтальная тяга в блочном тренажёре','BACK_HORIZONTAL_ROW',10,true,'direct',null),
('BACK_MID_TBAR_MACHINE','Тяга Т-грифа в тренажёре','BACK_HORIZONTAL_ROW',20,false,'direct',null),
('BACK_MID_DB_ROW','Тяга гантели одной рукой с опорой','BACK_HORIZONTAL_ROW',30,false,'direct','Односторонний вариант'),

('BACK_LAT_NEUTRAL_PULL','Тяга верхнего блока нейтральным хватом к груди','BACK_VERTICAL_PULL',10,true,'direct',null),
('BACK_LAT_NEUTRAL_PULLUP','Подтягивания нейтральным хватом','BACK_VERTICAL_PULL',20,false,'direct','Собственный вес'),
('BACK_LAT_WIDE_PULL','Тяга верхнего блока широким хватом','BACK_VERTICAL_PULL',30,false,'acceptable','Другой хват и механика плеча'),

('DELTS_SIDE_CABLE_RAISE','Отведение руки в сторону с нижнего блока','DELTS_SIDE_RAISE',10,true,'direct',null),
('DELTS_SIDE_DB_RAISE','Разведение гантелей стоя в стороны','DELTS_SIDE_RAISE',20,false,'direct',null),
('DELTS_SIDE_MACHINE_RAISE','Разведение рук в тренажёре','DELTS_SIDE_RAISE',30,false,'direct','Фиксированная траектория'),

('TRICEPS_CABLE_PUSHDOWN','Разгибание рук на верхнем блоке с канатом','TRICEPS_EXTENSION',10,true,'direct',null),
('TRICEPS_OVERHEAD_ROPE_EXT','Разгибание рук с канатом из-за головы','TRICEPS_EXTENSION',20,false,'acceptable','Больше длинная головка в растянутом положении'),
('TRICEPS_FRENCH_DB','Французский жим с гантелью сидя','TRICEPS_EXTENSION',30,false,'acceptable','Свободный вес вместо блока'),

('CORE_CABLE_CRUNCH','Скручивания в кроссовере','CORE_FLEXION',10,true,'direct',null),
('CORE_SEATED_CABLE_CRUNCH','Скручивания на блоке сидя','CORE_FLEXION',20,false,'direct','Сидячий вариант'),

('DELTS_REAR_FACE_PULL','Face Pull (тяга каната к лицу)','DELTS_REAR',10,true,'direct','Основной вариант программы; дополнительно работают наружные ротаторы и мышцы лопаточного пояса'),
('DELTS_REAR_MACHINE_FLY','Разведение рук в тренажёре на заднюю дельту','DELTS_REAR',20,false,'direct','Более изолированное горизонтальное отведение плеча'),
('DELTS_REAR_CABLE_EXT','Отведение руки назад с нижнего блока','DELTS_REAR',30,false,'fallback','Другое движение плеча, но сохраняет акцент на заднюю дельту'),

('CALVES_LEG_PRESS_RAISE','Подъём на носки в тренажёре жима ногами','CALF_RAISE',10,true,'direct','Почти прямое колено'),
('CALVES_STANDING_RAISE','Подъём на носки стоя в тренажёре','CALF_RAISE',20,false,'direct','Почти прямое колено'),
('CALVES_SEATED_RAISE','Подъём на носки сидя','CALF_RAISE',30,false,'acceptable','Согнутое колено сильнее смещает акцент к камбаловидной'),

('HAMSTRING_LEG_CURL','Сгибание ног в тренажёре','HAMSTRING_KNEE_FLEXION',10,true,'direct',null),
('HAMSTRING_SEATED_CURL','Сгибание ног сидя','HAMSTRING_KNEE_FLEXION',20,false,'direct',null),
('HAMSTRING_RDL_DB','Румынская тяга с гантелями','HAMSTRING_KNEE_FLEXION',30,false,'fallback','Тазовый шарнир, а не сгибание колена'),

('QUAD_GLUTE_LEG_PRESS','Жим ногами в тренажёре','QUAD_GLUTE_KNEE_DOMINANT',10,true,'direct',null),
('QUAD_GLUTE_HACK_SQUAT','Гакк-приседания в тренажёре','QUAD_GLUTE_KNEE_DOMINANT',20,false,'direct',null),
('QUAD_GLUTE_BULGARIAN_SPLIT','Болгарские сплит-приседы','QUAD_GLUTE_KNEE_DOMINANT',30,false,'acceptable','Односторонний вариант с повышенными требованиями к стабилизации'),

('TRAPS_SHRUG_DB','Шраги с гантелями / в тренажёре','TRAPS_ELEVATION',10,true,'direct',null),
('TRAPS_SHRUG_SMITH','Шраги в Смите','TRAPS_ELEVATION',20,false,'direct','Фиксированная траектория'),
('TRAPS_FARMER_WALK','Фермерская прогулка','TRAPS_ELEVATION',30,false,'fallback','Нагрузка на трапецию сохраняется, но это перенос, а не чистая элевация лопаток');

-- The 32 exercises already exist; keep their curated canonical names/descriptions.
-- Remove aliases brought from the unrelated spreadsheet, retaining only the original Sergey wording
-- when it differs from the canonical name.
update public.exercises e
set aliases = case when e.name is distinct from s.source_name then array[s.source_name]::text[] else '{}'::text[] end,
    technique_url = null,
    updated_at = now()
from tmp_sergey_exercises s
where e.code=s.code;

-- Correct tracking for bodyweight pull-ups.
update public.exercises
set tracking_type='bodyweight_reps', updated_at=now()
where code='BACK_LAT_NEUTRAL_PULLUP';

-- Remove all exercises not present in Sergey's training diary.
delete from public.exercises e
where not exists(select 1 from tmp_sergey_exercises s where s.code=e.code);

-- Ensure the exact substitution groups represented by the diary exist and are clean.
insert into public.exercise_substitution_groups(code,name,purpose,scope,parent_group_id)
values
('CHEST_UPPER_PRESS','Жимы на верх груди','Жимовые варианты с акцентом на верх груди','specific',null),
('BACK_HORIZONTAL_ROW','Горизонтальные тяги','Тяги к корпусу для середины спины','specific',null),
('BACK_VERTICAL_PULL','Вертикальные тяги','Вертикальные тяги с акцентом на широчайшие','specific',null),
('DELTS_SIDE_RAISE','Отведения на среднюю дельту','Варианты отведения плеча для средней дельты','specific',null),
('TRICEPS_EXTENSION','Разгибания на трицепс','Изолирующие разгибания локтя на трицепс','specific',null),
('CORE_FLEXION','Скручивания на блоке','Нагруженное сгибание корпуса для мышц живота','specific',null),
('DELTS_REAR','Задняя дельта','Упражнения с основным акцентом на заднюю дельту','specific',null),
('CALF_RAISE','Подъёмы на носки','Варианты подошвенного сгибания для икр','specific',null),
('HAMSTRING_KNEE_FLEXION','Сгибания колена на бицепс бедра','Основные варианты сгибания колена; RDL оставлен только как запасная замена из исходного дневника','specific',null),
('QUAD_GLUTE_KNEE_DOMINANT','Коленно-доминантные на ноги','Жимы и приседания с акцентом на квадрицепс и ягодицы','specific',null),
('TRAPS_ELEVATION','Шраги / трапеция','Основные варианты элевации лопаток; фермерская прогулка — запасная замена','specific',null)
on conflict(code) do update set
  name=excluded.name,
  purpose=excluded.purpose,
  scope='specific',
  parent_group_id=null;

-- Remove every substitution group that is not represented in the Sergey diary.
delete from public.exercise_substitution_groups g
where g.code not in (
  'CHEST_UPPER_PRESS','BACK_HORIZONTAL_ROW','BACK_VERTICAL_PULL','DELTS_SIDE_RAISE',
  'TRICEPS_EXTENSION','CORE_FLEXION','DELTS_REAR','CALF_RAISE',
  'HAMSTRING_KNEE_FLEXION','QUAD_GLUTE_KNEE_DOMINANT','TRAPS_ELEVATION'
);

-- Rebuild membership strictly from the diary.
delete from public.exercise_substitution_members m
using public.exercise_substitution_groups g
where m.group_id=g.id;

insert into public.exercise_substitution_members(
  group_id,exercise_id,priority,is_default,match_type,notes
)
select g.id,e.id,s.priority,s.is_default,s.match_type,s.notes
from tmp_sergey_exercises s
join public.exercise_substitution_groups g on g.code=s.group_code
join public.exercises e on e.code=s.code
order by s.group_code,s.priority;

-- Reference values added only for the accidental exercise import are no longer needed.
delete from public.movement_patterns p
where p.code in (
  'hip_thrust','step_up','hip_abduction','hip_extension','chest_fly','shoulder_flexion',
  'core_flexion','core_anti_extension','core_rotation','back_extension','cardio_steady','cardio_interval'
)
and not exists(select 1 from public.exercises e where e.movement_pattern_code=p.code);

delete from public.exercise_equipment q
where q.code in ('fitball','step_platform','cardio_stepper','stationary_bike')
and not exists(select 1 from public.exercises e where e.equipment_code=q.code);

delete from public.muscle_groups mg
where mg.code in ('glutes_medius','adductors','erectors','hip_flexors','obliques')
and not exists(select 1 from public.exercise_muscle_groups emg where emg.muscle_group_code=mg.code);
