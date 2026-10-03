
create or replace function public.my_client_access_active(p_client_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  select p_client_id=auth.uid()
    and exists(
      select 1 from public.coach_clients cc
      where cc.client_id=p_client_id and cc.status='active'
    );
$function$;

revoke all on function public.my_client_access_active(uuid) from public,anon;
grant execute on function public.my_client_access_active(uuid) to authenticated;

drop policy if exists measurements_read on public.measurements;
create policy measurements_read
on public.measurements for select to authenticated
using(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=measurements.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists daily_checkins_access on public.daily_checkins;
create policy daily_checkins_access
on public.daily_checkins for all to authenticated
using(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=daily_checkins.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
)
with check(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=daily_checkins.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists monthly_checkins_read on public.monthly_checkins;
create policy monthly_checkins_read
on public.monthly_checkins for select to authenticated
using(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=monthly_checkins.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists client_task_completions_access on public.client_task_completions;
create policy client_task_completions_access
on public.client_task_completions for all to authenticated
using(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_task_completions.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
)
with check(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_task_completions.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists "client writes own nutrition setup" on public.client_nutrition_setup;
create policy "client writes own nutrition setup"
on public.client_nutrition_setup for all to authenticated
using(public.my_client_access_active(client_id))
with check(public.my_client_access_active(client_id));

drop policy if exists "client or assigned coach reads nutrition setup" on public.client_nutrition_setup;
create policy "client or assigned coach reads nutrition setup"
on public.client_nutrition_setup for select to authenticated
using(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_nutrition_setup.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists nutrition_plans_select on public.nutrition_plans;
create policy nutrition_plans_select
on public.nutrition_plans for select to authenticated
using(
  created_by=(select auth.uid())
  or public.my_client_access_active(client_id)
);

drop policy if exists nutrition_meals_select on public.nutrition_plan_meals;
create policy nutrition_meals_select
on public.nutrition_plan_meals for select to authenticated
using(exists(
  select 1 from public.nutrition_plans p
  where p.id=nutrition_plan_meals.plan_id
    and (
      p.created_by=(select auth.uid())
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
      p.created_by=(select auth.uid())
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
      p.created_by=(select auth.uid())
      or public.my_client_access_active(p.client_id)
    )
));

drop policy if exists programs_access on public.training_programs;
create policy programs_access
on public.training_programs for select to authenticated
using(
  created_by=(select auth.uid())
  or public.my_client_access_active(client_id)
);

drop policy if exists training_days_access on public.training_days;
create policy training_days_access
on public.training_days for select to authenticated
using(exists(
  select 1 from public.training_programs tp
  where tp.id=training_days.program_id
    and (
      tp.created_by=(select auth.uid())
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
      tp.created_by=(select auth.uid())
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
      tp.created_by=(select auth.uid())
      or public.my_client_access_active(tp.client_id)
    )
));

drop policy if exists workout_sessions_select on public.workout_sessions;
create policy workout_sessions_select
on public.workout_sessions for select to authenticated
using(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=workout_sessions.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists workout_exercises_select on public.workout_exercises;
create policy workout_exercises_select
on public.workout_exercises for select to authenticated
using(exists(
  select 1 from public.workout_sessions ws
  where ws.id=workout_exercises.workout_session_id
    and (
      public.my_client_access_active(ws.client_id)
      or exists(
        select 1 from public.coach_clients cc
        where cc.client_id=ws.client_id
          and cc.coach_id=(select auth.uid())
          and cc.status='active'
      )
    )
));

drop policy if exists workout_sets_select on public.workout_sets;
create policy workout_sets_select
on public.workout_sets for select to authenticated
using(exists(
  select 1
  from public.workout_exercises we
  join public.workout_sessions ws on ws.id=we.workout_session_id
  where we.id=workout_sets.workout_exercise_id
    and (
      public.my_client_access_active(ws.client_id)
      or exists(
        select 1 from public.coach_clients cc
        where cc.client_id=ws.client_id
          and cc.coach_id=(select auth.uid())
          and cc.status='active'
      )
    )
));

drop policy if exists workout_cardio_select on public.workout_cardio_entries;
create policy workout_cardio_select
on public.workout_cardio_entries for select to authenticated
using(exists(
  select 1 from public.workout_sessions ws
  where ws.id=workout_cardio_entries.workout_session_id
    and (
      public.my_client_access_active(ws.client_id)
      or exists(
        select 1 from public.coach_clients cc
        where cc.client_id=ws.client_id
          and cc.coach_id=(select auth.uid())
          and cc.status='active'
      )
    )
));

drop policy if exists feedback_threads_select on public.feedback_threads;
create policy feedback_threads_select
on public.feedback_threads for select to authenticated
using(
  public.my_client_access_active(client_id)
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=feedback_threads.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists feedback_threads_insert on public.feedback_threads;
create policy feedback_threads_insert
on public.feedback_threads for insert to authenticated
with check(
  created_by=(select auth.uid())
  and (
    public.my_client_access_active(client_id)
    or exists(
      select 1 from public.coach_clients cc
      where cc.client_id=feedback_threads.client_id
        and cc.coach_id=(select auth.uid())
        and cc.status='active'
    )
  )
);

drop policy if exists feedback_messages_select on public.feedback_messages;
create policy feedback_messages_select
on public.feedback_messages for select to authenticated
using(exists(
  select 1 from public.feedback_threads ft
  where ft.id=feedback_messages.thread_id
    and (
      public.my_client_access_active(ft.client_id)
      or exists(
        select 1 from public.coach_clients cc
        where cc.client_id=ft.client_id
          and cc.coach_id=(select auth.uid())
          and cc.status='active'
      )
    )
));

drop policy if exists feedback_messages_insert on public.feedback_messages;
create policy feedback_messages_insert
on public.feedback_messages for insert to authenticated
with check(
  author_id=(select auth.uid())
  and exists(
    select 1 from public.feedback_threads ft
    where ft.id=feedback_messages.thread_id
      and (
        public.my_client_access_active(ft.client_id)
        or exists(
          select 1 from public.coach_clients cc
          where cc.client_id=ft.client_id
            and cc.coach_id=(select auth.uid())
            and cc.status='active'
        )
      )
  )
);
