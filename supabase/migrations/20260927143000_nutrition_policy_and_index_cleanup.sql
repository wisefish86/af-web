
create index if not exists nutrition_plans_supersedes_idx on public.nutrition_plans(supersedes_plan_id);
create index if not exists saved_meal_items_food_idx on public.saved_meal_items(food_id);
create index if not exists training_programs_supersedes_idx on public.training_programs(supersedes_program_id);
create index if not exists workout_exercises_prescribed_exercise_idx on public.workout_exercises(prescribed_exercise_id);

drop policy if exists nutrition_meals_write on public.nutrition_plan_meals;
create policy nutrition_meals_insert on public.nutrition_plan_meals
for insert to authenticated
with check (exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id and p.created_by=(select auth.uid()) and p.status='draft'
));
create policy nutrition_meals_update on public.nutrition_plan_meals
for update to authenticated
using (exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id and p.created_by=(select auth.uid()) and p.status='draft'
))
with check (exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id and p.created_by=(select auth.uid()) and p.status='draft'
));
create policy nutrition_meals_delete on public.nutrition_plan_meals
for delete to authenticated
using (exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id and p.created_by=(select auth.uid()) and p.status='draft'
));

drop policy if exists nutrition_variants_write on public.nutrition_plan_meal_variants;
create policy nutrition_variants_insert on public.nutrition_plan_meal_variants
for insert to authenticated
with check (exists(
  select 1 from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));
create policy nutrition_variants_update on public.nutrition_plan_meal_variants
for update to authenticated
using (exists(
  select 1 from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and p.created_by=(select auth.uid()) and p.status='draft'
))
with check (exists(
  select 1 from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));
create policy nutrition_variants_delete on public.nutrition_plan_meal_variants
for delete to authenticated
using (exists(
  select 1 from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));

drop policy if exists nutrition_items_write on public.nutrition_plan_meal_items;
create policy nutrition_items_insert on public.nutrition_plan_meal_items
for insert to authenticated
with check (exists(
  select 1 from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));
create policy nutrition_items_update on public.nutrition_plan_meal_items
for update to authenticated
using (exists(
  select 1 from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and p.created_by=(select auth.uid()) and p.status='draft'
))
with check (exists(
  select 1 from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));
create policy nutrition_items_delete on public.nutrition_plan_meal_items
for delete to authenticated
using (exists(
  select 1 from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and p.created_by=(select auth.uid()) and p.status='draft'
));
