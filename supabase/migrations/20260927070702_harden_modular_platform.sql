-- Hardening and indexing for the modular coaching platform.
-- The initial schema was bootstrapped before migration tracking was enabled.

create index if not exists telegram_link_tokens_client_idx on private.telegram_link_tokens(client_id);
create index if not exists client_modules_module_idx on public.client_modules(module_code);
create index if not exists client_nutrition_assignments_assigned_by_idx on public.client_nutrition_assignments(assigned_by);
create index if not exists client_nutrition_assignments_template_idx on public.client_nutrition_assignments(template_id);
create index if not exists client_tracking_config_field_idx on public.client_tracking_config(field_code);
create index if not exists client_tracking_preferences_field_idx on public.client_tracking_preferences(field_code);
create index if not exists muscle_groups_parent_idx on public.muscle_groups(parent_code);
create index if not exists notification_deliveries_client_idx on public.notification_deliveries(client_id);
create index if not exists notification_deliveries_rule_idx on public.notification_deliveries(reminder_rule_id);
create index if not exists nutrition_plan_templates_created_by_idx on public.nutrition_plan_templates(created_by);
create index if not exists nutrition_template_slots_category_idx on public.nutrition_template_slots(category_id);
create index if not exists nutrition_template_slots_default_food_idx on public.nutrition_template_slots(default_food_id);
create index if not exists reminder_rules_created_by_idx on public.reminder_rules(created_by);
create index if not exists reminder_rules_module_idx on public.reminder_rules(module_code);
create index if not exists training_programs_source_template_idx on public.training_programs(source_template_id);

drop policy if exists tracking_pref_self_insert on public.client_tracking_preferences;
drop policy if exists tracking_pref_self_update on public.client_tracking_preferences;

create policy tracking_pref_self_insert
on public.client_tracking_preferences
for insert to authenticated
with check (
  (select auth.uid()) = client_id
  and exists (
    select 1
    from public.tracking_fields f
    where f.code = client_tracking_preferences.field_code
      and f.client_can_disable = true
      and (
        exists (
          select 1 from public.client_tracking_config c
          where c.client_id = client_tracking_preferences.client_id
            and c.field_code = client_tracking_preferences.field_code
            and c.enabled = true
            and c.required = false
        )
        or (
          not exists (
            select 1 from public.client_tracking_config c
            where c.client_id = client_tracking_preferences.client_id
              and c.field_code = client_tracking_preferences.field_code
          )
          and f.default_enabled = true
          and f.default_required = false
        )
      )
  )
);

create policy tracking_pref_self_update
on public.client_tracking_preferences
for update to authenticated
using ((select auth.uid()) = client_id)
with check (
  (select auth.uid()) = client_id
  and exists (
    select 1
    from public.tracking_fields f
    where f.code = client_tracking_preferences.field_code
      and f.client_can_disable = true
      and (
        exists (
          select 1 from public.client_tracking_config c
          where c.client_id = client_tracking_preferences.client_id
            and c.field_code = client_tracking_preferences.field_code
            and c.enabled = true
            and c.required = false
        )
        or (
          not exists (
            select 1 from public.client_tracking_config c
            where c.client_id = client_tracking_preferences.client_id
              and c.field_code = client_tracking_preferences.field_code
          )
          and f.default_enabled = true
          and f.default_required = false
        )
      )
  )
);

drop policy if exists reminder_rules_self_insert on public.reminder_rules;
drop policy if exists reminder_rules_self_update on public.reminder_rules;
drop policy if exists reminder_rules_self_delete on public.reminder_rules;

create policy reminder_rules_insert on public.reminder_rules
for insert to authenticated
with check (
  (select auth.uid()) = client_id
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id=reminder_rules.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create policy reminder_rules_update on public.reminder_rules
for update to authenticated
using (
  (select auth.uid()) = client_id
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id=reminder_rules.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
)
with check (
  (select auth.uid()) = client_id
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id=reminder_rules.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

create policy reminder_rules_delete on public.reminder_rules
for delete to authenticated
using (
  (select auth.uid()) = client_id
  or exists (
    select 1 from public.coach_clients cc
    where cc.client_id=reminder_rules.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists client_nutrition_assignment_write on public.client_nutrition_assignments;
create policy client_nutrition_assignment_insert on public.client_nutrition_assignments
for insert to authenticated
with check (exists (
  select 1 from public.coach_clients cc
  where cc.client_id=client_nutrition_assignments.client_id
    and cc.coach_id=(select auth.uid())
    and cc.status='active'
));
create policy client_nutrition_assignment_update on public.client_nutrition_assignments
for update to authenticated
using (exists (
  select 1 from public.coach_clients cc
  where cc.client_id=client_nutrition_assignments.client_id
    and cc.coach_id=(select auth.uid())
    and cc.status='active'
))
with check (exists (
  select 1 from public.coach_clients cc
  where cc.client_id=client_nutrition_assignments.client_id
    and cc.coach_id=(select auth.uid())
    and cc.status='active'
));
create policy client_nutrition_assignment_delete on public.client_nutrition_assignments
for delete to authenticated
using (exists (
  select 1 from public.coach_clients cc
  where cc.client_id=client_nutrition_assignments.client_id
    and cc.coach_id=(select auth.uid())
    and cc.status='active'
));

drop policy if exists exercise_muscles_write on public.exercise_muscle_groups;
create policy exercise_muscles_insert on public.exercise_muscle_groups
for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy exercise_muscles_update on public.exercise_muscle_groups
for update to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy exercise_muscles_delete on public.exercise_muscle_groups
for delete to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));

drop policy if exists nutrition_templates_write on public.nutrition_plan_templates;
create policy nutrition_templates_insert on public.nutrition_plan_templates
for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy nutrition_templates_update on public.nutrition_plan_templates
for update to authenticated
using (created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'))
with check (created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy nutrition_templates_delete on public.nutrition_plan_templates
for delete to authenticated
using (created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));

drop policy if exists nutrition_template_meals_write on public.nutrition_template_meals;
create policy nutrition_template_meals_insert on public.nutrition_template_meals
for insert to authenticated
with check (exists (
  select 1 from public.nutrition_plan_templates t
  where t.id=nutrition_template_meals.template_id and t.created_by=(select auth.uid())
));
create policy nutrition_template_meals_update on public.nutrition_template_meals
for update to authenticated
using (exists (
  select 1 from public.nutrition_plan_templates t
  where t.id=nutrition_template_meals.template_id and t.created_by=(select auth.uid())
))
with check (exists (
  select 1 from public.nutrition_plan_templates t
  where t.id=nutrition_template_meals.template_id and t.created_by=(select auth.uid())
));
create policy nutrition_template_meals_delete on public.nutrition_template_meals
for delete to authenticated
using (exists (
  select 1 from public.nutrition_plan_templates t
  where t.id=nutrition_template_meals.template_id and t.created_by=(select auth.uid())
));

drop policy if exists nutrition_template_slots_write on public.nutrition_template_slots;
create policy nutrition_template_slots_insert on public.nutrition_template_slots
for insert to authenticated
with check (exists (
  select 1 from public.nutrition_template_meals m
  join public.nutrition_plan_templates t on t.id=m.template_id
  where m.id=nutrition_template_slots.meal_id and t.created_by=(select auth.uid())
));
create policy nutrition_template_slots_update on public.nutrition_template_slots
for update to authenticated
using (exists (
  select 1 from public.nutrition_template_meals m
  join public.nutrition_plan_templates t on t.id=m.template_id
  where m.id=nutrition_template_slots.meal_id and t.created_by=(select auth.uid())
))
with check (exists (
  select 1 from public.nutrition_template_meals m
  join public.nutrition_plan_templates t on t.id=m.template_id
  where m.id=nutrition_template_slots.meal_id and t.created_by=(select auth.uid())
));
create policy nutrition_template_slots_delete on public.nutrition_template_slots
for delete to authenticated
using (exists (
  select 1 from public.nutrition_template_meals m
  join public.nutrition_plan_templates t on t.id=m.template_id
  where m.id=nutrition_template_slots.meal_id and t.created_by=(select auth.uid())
));
