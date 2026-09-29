alter table public.client_food_preferences
  add column if not exists selected boolean not null default false;

create table if not exists public.client_food_group_preferences (
  client_id uuid not null references public.profiles(id) on delete cascade,
  group_key text not null,
  visible boolean not null default true,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  primary key (client_id, group_key),
  constraint client_food_group_preferences_group_key_check
    check (group_key in (
      'meat','fish','eggs','dairy','plant_protein','sports',
      'carb','vegetable','fruit','fat','treat','drink'
    ))
);

alter table public.client_food_group_preferences enable row level security;

drop policy if exists food_group_prefs_access on public.client_food_group_preferences;
create policy food_group_prefs_access
on public.client_food_group_preferences
for all
using (
  auth.uid() = client_id
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id = client_food_group_preferences.client_id
      and cc.coach_id = auth.uid()
      and cc.status = 'active'
  )
)
with check (
  auth.uid() = client_id
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id = client_food_group_preferences.client_id
      and cc.coach_id = auth.uid()
      and cc.status = 'active'
  )
);

update public.foods
set food_group = case
  when name in ('Говядина постная','Индейка филе','Куриная грудка сырая','Куриное бедро без кожи','Печень говяжья','Печень куриная','Ветчина нежирная','Свинина корейка постная','Фарш говяжий 10%') then 'meat'
  when name in ('Кальмар','Креветки очищенные','Лосось','Минтай','Сардины консервированные','Сельдь слабосолёная','Скумбрия','Треска','Тунец в собственном соку','Форель','Хек') then 'fish'
  when name in ('Яйца куриные','Белок яичный') then 'eggs'
  when name in ('Брынза / фета','Йогурт греческий 2%','Йогурт натуральный 2%','Кефир 1%','Кефир 2,5%','Моцарелла','Сыр плавленый','Сыр полутвёрдый','Творог 0%','Творог 2%','Творог 5%','Творог 9%','Молоко 1,5%','Молоко 2,5%','Молоко 3,2%','Ряженка 2,5%','Сметана 10%','Сметана 15%') then 'dairy'
  when name in ('Нут варёный','Нут консервированный','Тофу','Фасоль белая консервированная','Фасоль красная консервированная','Хумус','Чечевица варёная','Чечевица сухая') then 'plant_protein'
  when name in ('Протеиновый батончик (среднее)','Протеиновый напиток готовый (среднее)') then 'sports'
  when name in ('Джем','Зефир','Мороженое пломбир','Мёд','Шоколад молочный','Шоколад тёмный 70%','Печенье овсяное') then 'treat'
  when name in ('Кола без сахара','Кофе чёрный без сахара','Томатный сок','Чай без сахара','Сок апельсиновый') then 'drink'
  when name in ('Семена льна','Семена чиа','Семечки подсолнечные','Семечки тыквенные') or food_group='fat' then 'fat'
  when name in ('Изюм','Курага','Черника / голубика','Чернослив','Ягоды замороженные без сахара') or (food_group='fruit' and name<>'Сок апельсиновый') then 'fruit'
  when name in ('Лук репчатый','Салат листовой','Свёкла','Шампиньоны','Шпинат') or food_group='vegetable' then 'vegetable'
  when name in ('Хлеб пшеничный','Хлеб ржаной','Хлеб цельнозерновой','Хлебцы ржаные') or food_group='carb' then 'carb'
  else food_group
end,
updated_at=now();

update public.foods
set name='Творог обезжиренный (0–0,5%)',
    kcal_100=90, protein_100=18, fat_100=0.5, carbs_100=3.3,
    updated_at=now()
where name='Творог 0%';

update public.foods
set kcal_100=121, protein_100=16, fat_100=5, carbs_100=3, updated_at=now()
where name='Творог 5%';

update public.foods
set kcal_100=157, protein_100=16, fat_100=9, carbs_100=3, updated_at=now()
where name='Творог 9%';

insert into public.foods (
  name,kcal_100,protein_100,fat_100,carbs_100,
  default_portion_g,notes,is_active,food_group,popularity_rank
)
select
  'Протеин сывороточный, порошок (среднее)',
  385,75,6,8,30,
  'Средние справочные значения. Для конкретного продукта лучше использовать БЖУ с упаковки.',
  true,'sports',10
where not exists (
  select 1 from public.foods
  where name='Протеин сывороточный, порошок (среднее)'
);

insert into public.food_category_links(food_id,category_id)
select f.id,c.id
from public.foods f
join public.food_categories c on c.slug='protein'
where f.name='Протеин сывороточный, порошок (среднее)'
on conflict do nothing;

alter table public.foods drop constraint if exists foods_food_group_check;
alter table public.foods
  add constraint foods_food_group_check
  check (
    food_group is null or food_group in (
      'meat','fish','eggs','dairy','plant_protein','sports',
      'carb','vegetable','fruit','fat','treat','drink'
    )
  );
