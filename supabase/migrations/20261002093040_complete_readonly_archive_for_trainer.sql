
drop policy if exists archived_coach_reads_nutrition_setup on public.client_nutrition_setup;
create policy archived_coach_reads_nutrition_setup
on public.client_nutrition_setup for select to authenticated
using(exists(
  select 1 from public.coach_clients cc
  where cc.client_id=client_nutrition_setup.client_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists archived_coach_reads_nutrition_plans on public.nutrition_plans;
create policy archived_coach_reads_nutrition_plans
on public.nutrition_plans for select to authenticated
using(
  client_id is not null
  and exists(
    select 1 from public.coach_clients cc
    where cc.client_id=nutrition_plans.client_id
      and cc.coach_id=(select auth.uid())
  )
);

drop policy if exists archived_coach_reads_nutrition_meals on public.nutrition_plan_meals;
create policy archived_coach_reads_nutrition_meals
on public.nutrition_plan_meals for select to authenticated
using(exists(
  select 1
  from public.nutrition_plans p
  join public.coach_clients cc on cc.client_id=p.client_id
  where p.id=nutrition_plan_meals.plan_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists archived_coach_reads_nutrition_variants on public.nutrition_plan_meal_variants;
create policy archived_coach_reads_nutrition_variants
on public.nutrition_plan_meal_variants for select to authenticated
using(exists(
  select 1
  from public.nutrition_plan_meals m
  join public.nutrition_plans p on p.id=m.plan_id
  join public.coach_clients cc on cc.client_id=p.client_id
  where m.id=nutrition_plan_meal_variants.meal_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists archived_coach_reads_nutrition_items on public.nutrition_plan_meal_items;
create policy archived_coach_reads_nutrition_items
on public.nutrition_plan_meal_items for select to authenticated
using(exists(
  select 1
  from public.nutrition_plan_meal_variants v
  join public.nutrition_plan_meals m on m.id=v.meal_id
  join public.nutrition_plans p on p.id=m.plan_id
  join public.coach_clients cc on cc.client_id=p.client_id
  where v.id=nutrition_plan_meal_items.variant_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists archived_coach_reads_workout_exercises on public.workout_exercises;
create policy archived_coach_reads_workout_exercises
on public.workout_exercises for select to authenticated
using(exists(
  select 1
  from public.workout_sessions ws
  join public.coach_clients cc on cc.client_id=ws.client_id
  where ws.id=workout_exercises.workout_session_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists archived_coach_reads_workout_sets on public.workout_sets;
create policy archived_coach_reads_workout_sets
on public.workout_sets for select to authenticated
using(exists(
  select 1
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  join public.coach_clients cc on cc.client_id=ws.client_id
  where we.id=workout_sets.workout_exercise_id
    and cc.coach_id=(select auth.uid())
));

drop policy if exists archived_coach_reads_workout_cardio on public.workout_cardio_entries;
create policy archived_coach_reads_workout_cardio
on public.workout_cardio_entries for select to authenticated
using(exists(
  select 1
  from public.workout_sessions ws
  join public.coach_clients cc on cc.client_id=ws.client_id
  where ws.id=workout_cardio_entries.workout_session_id
    and cc.coach_id=(select auth.uid())
));
