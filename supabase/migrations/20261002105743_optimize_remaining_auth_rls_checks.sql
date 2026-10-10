
drop policy if exists "own food preferences" on public.client_food_preferences;
create policy "own food preferences"
on public.client_food_preferences
for all to authenticated
using(client_id=(select auth.uid()))
with check(client_id=(select auth.uid()));

drop policy if exists "own checklist state" on public.client_material_checklist_state;
create policy "own checklist state"
on public.client_material_checklist_state
for all to authenticated
using(client_id=(select auth.uid()))
with check(client_id=(select auth.uid()));

drop policy if exists food_group_prefs_access on public.client_food_group_preferences;
create policy food_group_prefs_access
on public.client_food_group_preferences
for all to public
using(
  (select auth.uid())=client_id
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_food_group_preferences.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
)
with check(
  (select auth.uid())=client_id
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=client_food_group_preferences.client_id
      and cc.coach_id=(select auth.uid())
      and cc.status='active'
  )
);

drop policy if exists "published materials readable" on public.learning_materials;
create policy "published materials readable"
on public.learning_materials
for select to authenticated
using(
  published
  and (
    access_level in ('public','clients')
    or (
      access_level='trainer'
      and exists(
        select 1 from public.profiles p
        where p.id=(select auth.uid()) and p.role='trainer'
      )
    )
  )
);

drop policy if exists "published checklist items readable" on public.learning_material_checklist_items;
create policy "published checklist items readable"
on public.learning_material_checklist_items
for select to authenticated
using(
  exists(
    select 1 from public.learning_materials m
    where m.id=learning_material_checklist_items.material_id
      and (
        m.published
        or exists(
          select 1 from public.profiles p
          where p.id=(select auth.uid()) and p.role='trainer'
        )
      )
  )
);
