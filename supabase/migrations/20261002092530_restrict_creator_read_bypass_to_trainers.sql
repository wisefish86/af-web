
drop policy if exists nutrition_plans_select on public.nutrition_plans;
create policy nutrition_plans_select
on public.nutrition_plans for select to authenticated
using(
  (
    created_by=(select auth.uid())
    and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
  )
  or public.my_client_access_active(client_id)
);

drop policy if exists nutrition_meals_select on public.nutrition_plan_meals;
create policy nutrition_meals_select
on public.nutrition_plan_meals for select to authenticated
using(exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id
    and (
      (
        p.created_by=(select auth.uid())
        and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
      )
      or public.my_client_access_active(p.client_id)
    )
));

drop policy if exists nutrition_variants_select on public.nutrition_plan_meal_variants;
create policy nutrition_variants_select
on public.nutrition_plan_meal_variants for select to authenticated
using(exists(
  select 1
  from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and (
      (
        p.created_by=(select auth.uid())
        and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
      )
      or public.my_client_access_active(p.client_id)
    )
));

drop policy if exists nutrition_items_select on public.nutrition_plan_meal_items;
create policy nutrition_items_select
on public.nutrition_plan_meal_items for select to authenticated
using(exists(
  select 1
  from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  where v.id=nutrition_plan_meal_items.variant_id
    and (
      (
        p.created_by=(select auth.uid())
        and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
      )
      or public.my_client_access_active(p.client_id)
    )
));

drop policy if exists programs_access on public.training_programs;
create policy programs_access
on public.training_programs for select to authenticated
using(
  (
    created_by=(select auth.uid())
    and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
  )
  or public.my_client_access_active(client_id)
);

drop policy if exists training_days_access on public.training_days;
create policy training_days_access
on public.training_days for select to authenticated
using(exists(
  select 1 from public.training_programs tp
  where tp.id=training_days.program_id
    and (
      (
        tp.created_by=(select auth.uid())
        and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
      )
      or public.my_client_access_active(tp.client_id)
    )
));

drop policy if exists program_exercises_access on public.program_exercises;
create policy program_exercises_access
on public.program_exercises for select to authenticated
using(exists(
  select 1
  from public.training_days td
  join public.training_programs tp on tp.id=td.program_id
  where td.id=program_exercises.training_day_id
    and (
      (
        tp.created_by=(select auth.uid())
        and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
      )
      or public.my_client_access_active(tp.client_id)
    )
));

drop policy if exists program_cardio_blocks_select on public.program_cardio_blocks;
create policy program_cardio_blocks_select
on public.program_cardio_blocks for select to authenticated
using(exists(
  select 1
  from public.training_days td
  join public.training_programs tp on tp.id=td.program_id
  where td.id=program_cardio_blocks.training_day_id
    and (
      (
        tp.created_by=(select auth.uid())
        and exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role='trainer')
      )
      or public.my_client_access_active(tp.client_id)
    )
));
