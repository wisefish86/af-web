-- Catalog wording, seated lateral raise, equipment tags, and Meal Plan food taxonomy.

update public.exercises set name='Мёртвый жук (Dead Bug)',updated_at=now() where code='CORE_DEAD_BUG';
update public.exercises set name='Тяга каната к лицу (Face Pull)',updated_at=now() where code='DELTS_REAR_FACE_PULL';
update public.exercises set name='Жим лёжа в Смите',updated_at=now() where code='CHEST_FLAT_SMITH_PRESS';
update public.exercises set name='Жим на наклонной скамье в Смите',updated_at=now() where code='CHEST_UPPER_SMITH_PRESS';
update public.exercises set name='Жим над головой сидя в Смите',updated_at=now() where code='DELTS_PRESS_SMITH';
update public.exercises set name='Жим гантелей над головой сидя',updated_at=now() where code='DELTS_PRESS_DB_SEATED';
update public.exercises set name='Жим от груди в тренажёре под наклоном',updated_at=now() where code='CHEST_INCLINE_MACHINE_PRESS';
update public.exercises set name='Нордические сгибания ног',updated_at=now() where code='HAMSTRING_NORDIC_CURL';
update public.exercises set name='Отведение руки в сторону на нижнем блоке',updated_at=now() where code='DELTS_SIDE_CABLE_RAISE';
update public.exercises set name='Отведение руки назад на нижнем блоке',updated_at=now() where code='DELTS_REAR_CABLE_EXT';
update public.exercises set name='Подъём на носки в жиме ногами',updated_at=now() where code='CALVES_LEG_PRESS_RAISE';
update public.exercises set name='Разведение гантелей в стороны стоя',updated_at=now() where code='DELTS_SIDE_DB_RAISE';
update public.exercises set name='Разведение рук в стороны в тренажёре',updated_at=now() where code='DELTS_SIDE_MACHINE_RAISE';
update public.exercises set name='Сведение рук в тренажёре «бабочка» (Pec Deck)',updated_at=now() where code='CHEST_PEC_DECK';
update public.exercises set name='Скручивания сидя на верхнем блоке',updated_at=now() where code='CORE_SEATED_CABLE_CRUNCH';
update public.exercises set name='Ягодичный мост от скамьи в Смите',updated_at=now() where code='GLUTE_HIP_THRUST_SMITH';
update public.exercises set name='Ягодичный мост от скамьи со штангой',updated_at=now() where code='GLUTE_HIP_THRUST_BB';

insert into public.exercises(
 code,name,muscle_group,instructions,is_active,description,equipment_code,movement_pattern_code,
 default_rest_seconds,technique_url,is_unilateral,updated_at,mechanics,setup_notes,common_mistakes,
 exercise_type,tracking_type,aliases,load_increment_kg
)
select
 'DELTS_SIDE_DB_RAISE_SEATED','Разведение гантелей в стороны сидя',muscle_group,
 'Поднимай гантели в стороны и немного вперёд, ведя движение локтями. Доходи примерно до уровня плеч или чуть ниже, не пожимая плечами. Затем медленно опускай гантели, сохраняя контроль и напряжение в средней дельте.',
 true,'Изолирующий вариант подъёма гантелей в стороны сидя: меньше возможности помогать корпусом и проще контролировать среднюю дельту.',
 equipment_code,movement_pattern_code,default_rest_seconds,technique_url,false,now(),mechanics,
 'Сядь на край устойчивой скамьи или на скамью со спинкой. Стопы полностью на полу, корпус вертикален и стабилен. Гантели держи по бокам, локти слегка согнуты, плечи опущены.',
 'Раскачка и отрыв корпуса от скамьи; слишком тяжёлые гантели; подъём плеч к ушам; кисти оказываются выше локтей; чрезмерно высокий подъём; быстрый неконтролируемый спуск.',
 exercise_type,tracking_type,array['Подъём гантелей в стороны сидя'],load_increment_kg
from public.exercises
where code='DELTS_SIDE_DB_RAISE'
and not exists(select 1 from public.exercises where code='DELTS_SIDE_DB_RAISE_SEATED');

insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
select seated.id,m.muscle_group_code,m.role
from public.exercises standing
join public.exercise_muscle_groups m on m.exercise_id=standing.id
join public.exercises seated on seated.code='DELTS_SIDE_DB_RAISE_SEATED'
where standing.code='DELTS_SIDE_DB_RAISE'
on conflict do nothing;

insert into public.exercise_substitution_members(group_id,exercise_id,priority,is_default,match_type,notes)
select sm.group_id,seated.id,sm.priority+5,false,sm.match_type,'Вариант сидя с меньшей помощью корпусом'
from public.exercises standing
join public.exercise_substitution_members sm on sm.exercise_id=standing.id
join public.exercises seated on seated.code='DELTS_SIDE_DB_RAISE_SEATED'
where standing.code='DELTS_SIDE_DB_RAISE'
on conflict do nothing;

with tags(slug,name) as (
 values
  ('equip-bodyweight','Собственный вес'),('equip-dumbbells','Гантели'),('equip-barbell','Штанга'),
  ('equip-bench','Скамья'),('equip-cable','Блочный тренажёр'),('equip-smith','Машина Смита'),
  ('equip-machine','Тренажёр'),('equip-pullup-bar','Турник'),('equip-ab-wheel','Колесо для пресса'),
  ('equip-rope','Канатная рукоять'),('equip-preacher-bench','Скамья Скотта')
)
insert into public.exercise_tags(slug,name,is_system)
select t.slug,t.name,true from tags t
where not exists(select 1 from public.exercise_tags e where e.slug=t.slug);

insert into public.exercise_tag_links(exercise_id,tag_id)
select e.id,t.id
from public.exercises e
join public.exercise_tags t on t.slug=case e.equipment_code
 when 'bodyweight' then 'equip-bodyweight' when 'dumbbell' then 'equip-dumbbells'
 when 'barbell' then 'equip-barbell' when 'cable' then 'equip-cable'
 when 'smith' then 'equip-smith' when 'machine' then 'equip-machine' else null end
where e.is_active=true on conflict do nothing;

insert into public.exercise_tag_links(exercise_id,tag_id)
select e.id,t.id from public.exercises e join public.exercise_tags t on t.slug='equip-bench'
where e.code in ('QUAD_GLUTE_BULGARIAN_SPLIT','CHEST_FLAT_SMITH_PRESS','CHEST_UPPER_SMITH_PRESS','DELTS_PRESS_SMITH',
'CHEST_FLAT_DB_PRESS','CHEST_UPPER_DB_PRESS','DELTS_PRESS_DB_SEATED','CHEST_FLAT_BB_PRESS','TRICEPS_CLOSE_GRIP_BENCH',
'CHEST_UPPER_BB_PRESS','DELTS_REAR_DB_FLY','BICEPS_INCLINE_DB_CURL','BACK_MID_CHEST_SUPPORTED_DB_ROW',
'GLUTE_HIP_THRUST_SMITH','GLUTE_HIP_THRUST_BB','DELTS_SIDE_DB_RAISE_SEATED') on conflict do nothing;

insert into public.exercise_tag_links(exercise_id,tag_id)
select e.id,t.id from public.exercises e join public.exercise_tags t on t.slug='equip-pullup-bar'
where e.code in ('BACK_LAT_NEUTRAL_PULLUP','BACK_LAT_CHINUP','BACK_LAT_PRONATED_PULLUP','CORE_HANGING_KNEE_RAISE') on conflict do nothing;

insert into public.exercise_tag_links(exercise_id,tag_id)
select e.id,t.id from public.exercises e join public.exercise_tags t on t.slug='equip-ab-wheel'
where e.code='CORE_AB_WHEEL' on conflict do nothing;

insert into public.exercise_tag_links(exercise_id,tag_id)
select e.id,t.id from public.exercises e join public.exercise_tags t on t.slug='equip-rope'
where e.code in ('DELTS_REAR_FACE_PULL','TRICEPS_CABLE_PUSHDOWN','TRICEPS_OVERHEAD_ROPE_EXT') on conflict do nothing;

insert into public.exercise_tag_links(exercise_id,tag_id)
select e.id,t.id from public.exercises e join public.exercise_tags t on t.slug='equip-preacher-bench'
where e.code='BICEPS_PREACHER_CURL' on conflict do nothing;

update public.foods set food_group='meat',updated_at=now() where food_group='eggs';
update public.foods set name='Сывороточный протеин, порошок',popularity_rank=10,updated_at=now()
where id='27890f9f-c9c2-4ca3-a157-2f2858b608cd';
update public.foods set food_group='treat',name='Протеиновый батончик классический (среднее)',popularity_rank=80,updated_at=now()
where id='c273a993-004b-465c-9632-715bcf3fbf2c';
update public.foods set is_active=false,updated_at=now() where id='db2ce47f-4654-4df5-90c2-371e37a23ca2';
update public.foods set popularity_rank=60,updated_at=now() where name='Булгур сухой';
update public.foods set popularity_rank=70,updated_at=now() where name='Кускус сухой';

with new_foods(name,kcal,p,f,c,portion,method,food_group,rank) as (
 values
 ('Казеиновый протеин, порошок',360,80,2,8,30,'dry','sports',20),
 ('Соевый протеин, порошок',365,84,2,5,30,'dry','sports',30),
 ('Гороховый протеин, порошок',370,80,6,5,30,'dry','sports',40),
 ('Яичный альбумин, порошок',365,82,1,6,30,'dry','sports',50),
 ('Перловая крупа сухая',352,9.9,1.2,73.7,80,'dry','carb',80),
 ('Пшено сухое',348,11.5,3.3,69.3,80,'dry','carb',90),
 ('Киноа сухая',368,14.1,6.1,64.2,80,'dry','carb',100),
 ('Кукурузная крупа сухая',337,8.3,1.2,75,80,'dry','carb',110),
 ('Протеиновый батончик шоколадный (среднее)',370,30,13,36,60,'ready','treat',90),
 ('Протеиновый батончик ореховый (среднее)',390,28,16,34,60,'ready','treat',100)
)
insert into public.foods(name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,weighing_method,food_group,popularity_rank,is_active)
select n.name,n.kcal,n.p,n.f,n.c,n.portion,n.method,n.food_group,n.rank,true from new_foods n
where not exists(select 1 from public.foods f where lower(f.name)=lower(n.name));
