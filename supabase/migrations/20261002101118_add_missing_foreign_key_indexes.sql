
create index if not exists client_material_checklist_state_item_idx
  on public.client_material_checklist_state(item_id);

create index if not exists client_nutrition_setup_tracking_mode_changed_by_idx
  on public.client_nutrition_setup(tracking_mode_changed_by)
  where tracking_mode_changed_by is not null;

create index if not exists workout_sessions_active_workout_exercise_idx
  on public.workout_sessions(active_workout_exercise_id)
  where active_workout_exercise_id is not null;
