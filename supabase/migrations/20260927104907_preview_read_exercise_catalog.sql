-- Read-only access to the non-personal exercise catalog for preview mode.
-- No client/program/workout data is exposed.
grant select on public.exercises,
  public.muscle_groups,
  public.exercise_muscle_groups,
  public.exercise_equipment,
  public.movement_patterns,
  public.exercise_tags,
  public.exercise_tag_links,
  public.exercise_substitution_groups,
  public.exercise_substitution_members
to anon;

drop policy if exists exercises_preview_read on public.exercises;
create policy exercises_preview_read on public.exercises
for select to anon using (is_active = true);

drop policy if exists muscle_groups_preview_read on public.muscle_groups;
create policy muscle_groups_preview_read on public.muscle_groups
for select to anon using (true);

drop policy if exists exercise_muscles_preview_read on public.exercise_muscle_groups;
create policy exercise_muscles_preview_read on public.exercise_muscle_groups
for select to anon using (
  exists (
    select 1 from public.exercises e
    where e.id = exercise_muscle_groups.exercise_id
      and e.is_active = true
  )
);

drop policy if exists exercise_equipment_preview_read on public.exercise_equipment;
create policy exercise_equipment_preview_read on public.exercise_equipment
for select to anon using (true);

drop policy if exists movement_patterns_preview_read on public.movement_patterns;
create policy movement_patterns_preview_read on public.movement_patterns
for select to anon using (true);

drop policy if exists exercise_tags_preview_read on public.exercise_tags;
create policy exercise_tags_preview_read on public.exercise_tags
for select to anon using (true);

drop policy if exists exercise_tag_links_preview_read on public.exercise_tag_links;
create policy exercise_tag_links_preview_read on public.exercise_tag_links
for select to anon using (
  exists (
    select 1 from public.exercises e
    where e.id = exercise_tag_links.exercise_id
      and e.is_active = true
  )
);

drop policy if exists sub_groups_preview_read on public.exercise_substitution_groups;
create policy sub_groups_preview_read on public.exercise_substitution_groups
for select to anon using (true);

drop policy if exists sub_members_preview_read on public.exercise_substitution_members;
create policy sub_members_preview_read on public.exercise_substitution_members
for select to anon using (
  exists (
    select 1 from public.exercises e
    where e.id = exercise_substitution_members.exercise_id
      and e.is_active = true
  )
);
