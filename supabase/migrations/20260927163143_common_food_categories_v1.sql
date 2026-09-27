
with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='protein'
where f.name = any(array[
'Яйца куриные','Белок яичный','Йогурт греческий 2%','Творог 0%','Творог 2%','Творог 5%','Творог 9%',
'Сыр полутвёрдый','Моцарелла','Брынза / фета','Сыр плавленый','Куриная грудка сырая','Куриное бедро без кожи',
'Индейка филе','Говядина постная','Фарш говяжий 10%','Свинина корейка постная','Ветчина нежирная',
'Печень куриная','Печень говяжья','Лосось','Форель','Треска','Минтай','Хек','Скумбрия','Сельдь слабосолёная',
'Тунец в собственном соку','Сардины консервированные','Креветки очищенные','Кальмар','Чечевица сухая',
'Чечевица варёная','Нут варёный','Нут консервированный','Фасоль красная консервированная',
'Фасоль белая консервированная','Тофу','Хумус','Протеиновый батончик (среднее)',
'Протеиновый напиток готовый (среднее)'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='side'
where f.name = any(array[
'Овсяные хлопья','Гречка сухая','Рис белый сухой','Рис бурый сухой','Булгур сухой','Кускус сухой',
'Макароны из твёрдых сортов сухие','Картофель','Батат','Хлеб ржаной','Хлеб цельнозерновой',
'Хлеб пшеничный','Лаваш тонкий','Хлебцы ржаные'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='legumes'
where f.name = any(array[
'Чечевица сухая','Чечевица варёная','Нут варёный','Нут консервированный',
'Фасоль красная консервированная','Фасоль белая консервированная',
'Горошек зелёный консервированный','Кукуруза консервированная','Хумус'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='vegetables'
where f.name = any(array[
'Огурец','Помидор','Перец сладкий','Морковь','Капуста белокочанная','Брокколи','Цветная капуста',
'Кабачок','Баклажан','Свёкла','Лук репчатый','Шпинат','Салат листовой','Шампиньоны',
'Овощная смесь замороженная','Капуста квашеная'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='fruit'
where f.name = any(array[
'Яблоко','Банан','Апельсин','Мандарин','Груша','Персик','Нектарин','Киви','Виноград','Арбуз','Дыня',
'Клубника','Черника / голубика','Малина','Ягоды замороженные без сахара','Авокадо','Изюм','Курага','Чернослив'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='drink'
where f.name = any(array[
'Молоко 1,5%','Молоко 2,5%','Молоко 3,2%','Кефир 1%','Кефир 2,5%','Ряженка 2,5%',
'Кофе чёрный без сахара','Чай без сахара','Сок апельсиновый','Кола без сахара','Томатный сок',
'Протеиновый напиток готовый (среднее)'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='treat'
where f.name = any(array[
'Шоколад тёмный 70%','Шоколад молочный','Зефир','Мёд','Джем','Печенье овсяное','Мороженое пломбир',
'Протеиновый батончик (среднее)'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='breakfast_base'
where f.name = any(array[
'Яйца куриные','Белок яичный','Овсяные хлопья','Йогурт натуральный 2%','Йогурт греческий 2%',
'Творог 0%','Творог 2%','Творог 5%','Творог 9%','Хлеб ржаной','Хлеб цельнозерновой',
'Хлеб пшеничный','Хлебцы ржаные'
]) on conflict do nothing;

with cat as (select id,slug from public.food_categories)
insert into public.food_category_links(food_id,category_id)
select f.id,c.id from public.foods f join cat c on c.slug='addition'
where f.name = any(array[
'Сметана 10%','Сметана 15%','Сыр полутвёрдый','Моцарелла','Брынза / фета','Сыр плавленый',
'Авокадо','Миндаль','Арахис','Грецкий орех','Кешью','Семечки подсолнечные','Семечки тыквенные',
'Семена чиа','Семена льна','Арахисовая паста без сахара','Масло оливковое',
'Масло подсолнечное','Масло сливочное 82,5%'
]) on conflict do nothing;
