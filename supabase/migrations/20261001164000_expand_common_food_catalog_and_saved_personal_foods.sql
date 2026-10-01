-- Expand the common grocery catalog and preserve personal-food identity in saved meals.

alter table public.saved_meal_items
  add column if not exists client_food_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='saved_meal_items_client_food_id_fkey'
      and conrelid='public.saved_meal_items'::regclass
  ) then
    alter table public.saved_meal_items
      add constraint saved_meal_items_client_food_id_fkey
      foreign key (client_food_id) references public.client_foods(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='saved_meal_items_one_food_source_check'
      and conrelid='public.saved_meal_items'::regclass
  ) then
    alter table public.saved_meal_items
      add constraint saved_meal_items_one_food_source_check
      check (not (food_id is not null and client_food_id is not null));
  end if;
end $$;

create index if not exists saved_meal_items_client_food_id_idx
  on public.saved_meal_items(client_food_id);

create index if not exists nutrition_plan_meal_items_client_food_id_idx
  on public.nutrition_plan_meal_items(client_food_id);

create or replace function public.save_my_meal_preset(
  p_name text,
  p_meal_type text,
  p_items jsonb
)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_meal_id uuid;
  v_item jsonb;
  v_sort int:=0;
  v_food_id uuid;
  v_client_food_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Meal name is required'; end if;
  if char_length(btrim(p_name))>120 then raise exception 'Meal name is too long'; end if;
  if p_meal_type not in ('main','light','snack') then raise exception 'Invalid meal type'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Meal must contain at least one item';
  end if;

  insert into public.saved_meals(created_by,name,meal_type)
  values(v_user,btrim(p_name),p_meal_type)
  returning id into v_meal_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(v_item->>'name'),'') is null then raise exception 'Food name is required'; end if;
    if coalesce((v_item->>'grams')::numeric,0)<=0 or (v_item->>'grams')::numeric>10000 then
      raise exception 'Invalid grams';
    end if;
    if coalesce((v_item->>'kcal_100')::numeric,-1)<0
      or coalesce((v_item->>'protein_100')::numeric,-1)<0
      or coalesce((v_item->>'fat_100')::numeric,-1)<0
      or coalesce((v_item->>'carbs_100')::numeric,-1)<0 then
      raise exception 'Invalid nutrition values';
    end if;

    v_food_id:=nullif(v_item->>'food_id','')::uuid;
    v_client_food_id:=nullif(v_item->>'client_food_id','')::uuid;
    if v_food_id is not null and v_client_food_id is not null then
      raise exception 'Food can have only one source';
    end if;
    if v_food_id is not null and not exists(
      select 1 from public.foods f where f.id=v_food_id and f.is_active=true
    ) then
      raise exception 'Catalog food not found';
    end if;
    if v_client_food_id is not null and not exists(
      select 1 from public.client_foods cf
      where cf.id=v_client_food_id and cf.client_id=v_user and cf.is_active=true
    ) then
      raise exception 'Personal food not found';
    end if;

    v_sort:=v_sort+10;
    insert into public.saved_meal_items(
      saved_meal_id,food_id,client_food_id,food_name_snapshot,grams,kcal_100_snapshot,
      protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order
    )
    values(
      v_meal_id,v_food_id,v_client_food_id,btrim(v_item->>'name'),
      (v_item->>'grams')::numeric,(v_item->>'kcal_100')::numeric,
      (v_item->>'protein_100')::numeric,(v_item->>'fat_100')::numeric,
      (v_item->>'carbs_100')::numeric,
      coalesce((v_item->>'is_fixed')::boolean,false),v_sort
    );
  end loop;

  return v_meal_id;
end;
$function$;

update public.foods
set name='Творог обезжиренный',
    kcal_100=95,protein_100=17,fat_100=1.8,carbs_100=3.3,
    notes='Усреднённые значения. Для точного учёта сверяйте КБЖУ с упаковкой конкретного продукта.',
    updated_at=now()
where name='Творог обезжиренный (0–0,5%)';

update public.foods
set is_active=false,updated_at=now()
where name='Творог 2%';

with seed(name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,weighing_method,food_group) as (
values
('Манная крупа сухая',333,10.3,1,70.6,80,'dry','carb'),
('Ячневая крупа сухая',324,10.4,1.3,65.4,80,'dry','carb'),
('Рис пропаренный сухой',350,7.5,1,78,80,'dry','carb'),
('Макароны обычные сухие',340,11,1.5,70,80,'dry','carb'),
('Спагетти сухие',350,12,1.5,72,80,'dry','carb'),
('Хлеб бородинский',208,6.8,1.3,40.7,40,'as_sold','carb'),
('Батон нарезной',264,7.5,2.9,51.4,40,'as_sold','carb'),
('Тортилья пшеничная',310,8,8,51,60,'as_sold','carb'),
('Пита',275,9,1.2,56,60,'as_sold','carb'),
('Кукурузные хлопья без сахара',357,8.3,1.2,76.4,50,'as_sold','carb'),
('Мюсли без сахара',360,10,8,62,60,'as_sold','carb'),
('Творог зернёный 5%',121,16,5,3,180,'as_sold','dairy'),
('Сыр творожный сливочный',240,6,22,4,40,'as_sold','dairy'),
('Сыр адыгейский',240,18,18,1.5,60,'as_sold','dairy'),
('Сыр сулугуни',286,20,22,0.4,50,'as_sold','dairy'),
('Йогурт питьевой натуральный 2,5%',63,3.2,2.5,7,250,'as_sold','dairy'),
('Йогурт фруктовый 2,5%',95,3.5,2.5,14,150,'as_sold','dairy'),
('Сливки 10%',118,3,10,4,50,'as_sold','dairy'),
('Сливки 20%',206,2.5,20,4,50,'as_sold','dairy'),
('Сметана 20%',206,2.5,20,3.4,30,'as_sold','dairy'),
('Молоко безлактозное 2,5%',52,3,2.5,4.7,250,'as_sold','dairy'),
('Куриные голени без кожи',130,19,6,0,200,'raw','meat'),
('Куриные крылья',186,18,13,0,200,'raw','meat'),
('Фарш куриный',143,18,8,0,180,'raw','meat'),
('Фарш из индейки',161,20,9,0,180,'raw','meat'),
('Фарш свиной',263,17,22,0,180,'raw','meat'),
('Свинина шея',267,17,22,0,180,'raw','meat'),
('Говядина мякоть',187,20,12,0,180,'raw','meat'),
('Сосиски молочные',260,11,23,2,100,'as_sold','meat'),
('Сардельки',300,10,28,2,120,'as_sold','meat'),
('Колбаса варёная',250,12,22,2,60,'as_sold','meat'),
('Колбаса сырокопчёная',430,24,38,1,40,'as_sold','meat'),
('Бекон',500,12,48,1,50,'as_sold','meat'),
('Сердце куриное',159,15.8,10.3,0.8,180,'raw','meat'),
('Желудки куриные',114,18.2,4.2,0.6,180,'raw','meat'),
('Горбуша',140,21,5,0,180,'raw','fish'),
('Кета',127,19,5.6,0,180,'raw','fish'),
('Сёмга слабосолёная',202,22,12,0,100,'as_sold','fish'),
('Форель слабосолёная',186,21,11,0,100,'as_sold','fish'),
('Крабовые палочки',95,7,1,15,100,'as_sold','fish'),
('Морская капуста',43,1.7,0.6,8,100,'as_sold','fish'),
('Мидии',86,12,2,3.7,150,'as_sold','fish'),
('Икра красная',250,32,15,0,30,'as_sold','fish'),
('Шпроты в масле',363,17,32,0,80,'drained','fish'),
('Чеснок',149,6.4,0.5,33,10,'raw','vegetable'),
('Редис',16,0.7,0.1,3.4,100,'as_sold','vegetable'),
('Дайкон',18,0.6,0.1,4.1,150,'raw','vegetable'),
('Тыква',26,1,0.1,6.5,200,'raw','vegetable'),
('Фасоль стручковая',31,1.8,0.2,7,200,'as_sold','vegetable'),
('Горошек зелёный замороженный',77,5.2,0.4,14,150,'as_sold','vegetable'),
('Огурцы маринованные',12,0.5,0.2,2.4,100,'as_sold','vegetable'),
('Помидоры черри',18,0.9,0.2,3.9,150,'as_sold','vegetable'),
('Капуста пекинская',16,1.2,0.2,3.2,200,'raw','vegetable'),
('Руккола',25,2.6,0.7,3.7,70,'as_sold','vegetable'),
('Сельдерей стеблевой',16,0.7,0.2,3,100,'as_sold','vegetable'),
('Капуста краснокочанная',31,1.4,0.2,7.4,200,'raw','vegetable'),
('Лимон',29,1.1,0.3,9.3,100,'as_sold','fruit'),
('Грейпфрут',42,0.8,0.1,10.7,200,'as_sold','fruit'),
('Ананас',50,0.5,0.1,13.1,200,'as_sold','fruit'),
('Манго',60,0.8,0.4,15,180,'as_sold','fruit'),
('Хурма',67,0.5,0.4,15.3,180,'as_sold','fruit'),
('Гранат',83,1.7,1.2,18.7,150,'as_sold','fruit'),
('Слива',46,0.7,0.3,11.4,150,'as_sold','fruit'),
('Вишня',50,1,0.3,12.2,150,'as_sold','fruit'),
('Смородина чёрная',63,1.4,0.4,15.4,150,'as_sold','fruit'),
('Финики',282,2.5,0.4,75,30,'as_sold','fruit'),
('Фундук',628,15,60.8,16.7,25,'as_sold','fat'),
('Фисташки',562,20,45,28,25,'as_sold','fat'),
('Кунжут',573,17.7,49.7,23.4,15,'as_sold','fat'),
('Тахини',595,17,53,21,20,'as_sold','fat'),
('Масло кокосовое',892,0,100,0,10,'as_sold','fat'),
('Оливки',116,0.8,10.7,6,50,'drained','fat'),
('Маслины',115,0.8,10.7,6,50,'drained','fat'),
('Масло сливочное 72,5%',662,0.8,72.5,1.3,10,'as_sold','fat'),
('Фасоль красная варёная',127,8.7,0.5,22.8,150,'cooked','plant_protein'),
('Фасоль белая варёная',139,9.7,0.4,25,150,'cooked','plant_protein'),
('Горох варёный',118,8.3,0.4,21,150,'cooked','plant_protein'),
('Горох сухой',298,20.5,2,49.5,80,'dry','plant_protein'),
('Чечевица консервированная',105,7,0.4,18,150,'drained','plant_protein'),
('Фалафель',333,13,17.8,31.8,100,'as_sold','plant_protein'),
('Печенье сахарное',440,7,14,72,30,'as_sold','treat'),
('Вафли',500,5,27,63,30,'as_sold','treat'),
('Пряники',350,5,3,76,40,'as_sold','treat'),
('Мармелад',320,0.1,0,79,30,'as_sold','treat'),
('Пастила',320,0.5,0,80,30,'as_sold','treat'),
('Сгущённое молоко с сахаром',321,7.2,8.5,56,30,'as_sold','treat'),
('Круассан без начинки',406,8,21,45,60,'as_sold','treat'),
('Чипсы картофельные',520,6,33,50,50,'as_sold','treat'),
('Попкорн готовый',400,8,20,50,40,'as_sold','treat'),
('Сухарики ржаные',410,10,14,66,40,'as_sold','treat'),
('Кетчуп',100,1.5,0.2,22,20,'as_sold','treat'),
('Горчица',140,5.7,6.4,22,10,'as_sold','treat'),
('Соевый соус',53,8.1,0.6,4.9,15,'as_sold','treat'),
('Вода питьевая',0,0,0,0,500,'as_sold','drink'),
('Вода минеральная',0,0,0,0,500,'as_sold','drink'),
('Кола с сахаром',42,0,0,10.6,330,'as_sold','drink'),
('Морс ягодный',40,0,0,10,250,'as_sold','drink'),
('Квас',27,0.2,0,5.2,300,'as_sold','drink'),
('Компот фруктовый',50,0.2,0,12,250,'prepared','drink'),
('Энергетик без сахара',3,0,0,0.5,450,'as_sold','drink'),
('Энергетик с сахаром',45,0,0,11,450,'as_sold','drink')
)
insert into public.foods(
  name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,
  weighing_method,food_group,notes,is_active
)
select
  s.name,s.kcal_100,s.protein_100,s.fat_100,s.carbs_100,s.default_portion_g,
  s.weighing_method,s.food_group,
  'Усреднённые значения. Для точного учёта сверяйте КБЖУ с упаковкой конкретного продукта.',
  true
from seed s
where not exists(
  select 1 from public.foods f where lower(f.name)=lower(s.name)
);
