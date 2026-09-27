-- Harden trainer-owned exercise relations and provide atomic exercise saving RPC.

drop policy if exists exercise_muscles_insert on public.exercise_muscle_groups;
drop policy if exists exercise_muscles_update on public.exercise_muscle_groups;
drop policy if exists exercise_muscles_delete on public.exercise_muscle_groups;

create policy exercise_muscles_insert on public.exercise_muscle_groups for insert to authenticated
with check (exists (select 1 from public.exercises e where e.id=exercise_muscle_groups.exercise_id and e.created_by=(select auth.uid())));
create policy exercise_muscles_update on public.exercise_muscle_groups for update to authenticated
using (exists (select 1 from public.exercises e where e.id=exercise_muscle_groups.exercise_id and e.created_by=(select auth.uid())))
with check (exists (select 1 from public.exercises e where e.id=exercise_muscle_groups.exercise_id and e.created_by=(select auth.uid())));
create policy exercise_muscles_delete on public.exercise_muscle_groups for delete to authenticated
using (exists (select 1 from public.exercises e where e.id=exercise_muscle_groups.exercise_id and e.created_by=(select auth.uid())));

drop policy if exists sub_groups_insert_trainer on public.exercise_substitution_groups;
drop policy if exists sub_groups_update_trainer on public.exercise_substitution_groups;
drop policy if exists sub_groups_delete_trainer on public.exercise_substitution_groups;

create policy sub_groups_insert_trainer on public.exercise_substitution_groups for insert to authenticated
with check (created_by=(select auth.uid()) and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='trainer'));
create policy sub_groups_update_trainer on public.exercise_substitution_groups for update to authenticated
using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));
create policy sub_groups_delete_trainer on public.exercise_substitution_groups for delete to authenticated
using (created_by=(select auth.uid()));

drop policy if exists sub_members_insert_trainer on public.exercise_substitution_members;
drop policy if exists sub_members_update_trainer on public.exercise_substitution_members;
drop policy if exists sub_members_delete_trainer on public.exercise_substitution_members;

create policy sub_members_insert_trainer on public.exercise_substitution_members for insert to authenticated
with check (
  exists (select 1 from public.exercise_substitution_groups g where g.id=exercise_substitution_members.group_id and g.created_by=(select auth.uid()))
  and exists (select 1 from public.exercises e where e.id=exercise_substitution_members.exercise_id and e.created_by=(select auth.uid()))
);
create policy sub_members_update_trainer on public.exercise_substitution_members for update to authenticated
using (exists (select 1 from public.exercise_substitution_groups g where g.id=exercise_substitution_members.group_id and g.created_by=(select auth.uid())))
with check (
  exists (select 1 from public.exercise_substitution_groups g where g.id=exercise_substitution_members.group_id and g.created_by=(select auth.uid()))
  and exists (select 1 from public.exercises e where e.id=exercise_substitution_members.exercise_id and e.created_by=(select auth.uid()))
);
create policy sub_members_delete_trainer on public.exercise_substitution_members for delete to authenticated
using (exists (select 1 from public.exercise_substitution_groups g where g.id=exercise_substitution_members.group_id and g.created_by=(select auth.uid())));

drop policy if exists exercise_tag_links_insert_trainer on public.exercise_tag_links;
drop policy if exists exercise_tag_links_delete_trainer on public.exercise_tag_links;
create policy exercise_tag_links_insert_trainer on public.exercise_tag_links for insert to authenticated
with check (
  exists (select 1 from public.exercises e where e.id=exercise_tag_links.exercise_id and e.created_by=(select auth.uid()))
  and exists (select 1 from public.exercise_tags t where t.id=exercise_tag_links.tag_id and (t.is_system=true or t.created_by=(select auth.uid())))
);
create policy exercise_tag_links_delete_trainer on public.exercise_tag_links for delete to authenticated
using (exists (select 1 from public.exercises e where e.id=exercise_tag_links.exercise_id and e.created_by=(select auth.uid())));

create or replace function public.save_exercise(
  p_exercise jsonb,
  p_primary_muscle text default null,
  p_secondary_muscles text[] default '{}',
  p_tags text[] default '{}',
  p_substitution_group_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_tag text;
  v_slug text;
  v_tag_id uuid;
  v_group_id uuid;
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user and p.role='trainer')
    then raise exception 'Trainer role required'; end if;

  v_name := nullif(btrim(p_exercise->>'name'), '');
  if v_name is null then raise exception 'Exercise name is required'; end if;
  v_code := nullif(btrim(p_exercise->>'code'), '');

  if coalesce(nullif(p_exercise->>'id',''),'') = '' then
    if v_code is null then
      v_code := 'EX_' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    end if;
    insert into public.exercises (
      code,name,description,equipment_code,movement_pattern_code,default_rest_seconds,
      technique_url,is_unilateral,instructions,is_active,created_by,updated_at
    ) values (
      v_code,v_name,nullif(btrim(p_exercise->>'description'),''),
      nullif(p_exercise->>'equipment_code',''),nullif(p_exercise->>'movement_pattern_code',''),
      coalesce((p_exercise->>'default_rest_seconds')::integer,120),
      nullif(btrim(p_exercise->>'technique_url'),''),
      coalesce((p_exercise->>'is_unilateral')::boolean,false),
      nullif(btrim(p_exercise->>'instructions'),''),
      coalesce((p_exercise->>'is_active')::boolean,true),v_user,now()
    ) returning id into v_id;
  else
    v_id := (p_exercise->>'id')::uuid;
    update public.exercises e set
      code=coalesce(v_code,e.code), name=v_name,
      description=nullif(btrim(p_exercise->>'description'),''),
      equipment_code=nullif(p_exercise->>'equipment_code',''),
      movement_pattern_code=nullif(p_exercise->>'movement_pattern_code',''),
      default_rest_seconds=coalesce((p_exercise->>'default_rest_seconds')::integer,120),
      technique_url=nullif(btrim(p_exercise->>'technique_url'),''),
      is_unilateral=coalesce((p_exercise->>'is_unilateral')::boolean,false),
      instructions=nullif(btrim(p_exercise->>'instructions'),''),
      is_active=coalesce((p_exercise->>'is_active')::boolean,true),
      updated_at=now()
    where e.id=v_id and e.created_by=v_user;
    if not found then raise exception 'Exercise not found or access denied'; end if;
  end if;

  delete from public.exercise_muscle_groups where exercise_id=v_id;
  if p_primary_muscle is not null and btrim(p_primary_muscle)<>'' then
    insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
    values(v_id,p_primary_muscle,'primary');
  end if;
  insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
  select v_id,x,'secondary' from unnest(coalesce(p_secondary_muscles,'{}'::text[])) x
  where x is not null and btrim(x)<>'' and x is distinct from p_primary_muscle
  on conflict (exercise_id,muscle_group_code) do update set role='secondary';

  delete from public.exercise_tag_links where exercise_id=v_id;
  foreach v_tag in array coalesce(p_tags,'{}'::text[]) loop
    v_tag := btrim(v_tag);
    if v_tag='' then continue; end if;
    v_slug := lower(regexp_replace(v_tag,'[[:space:]]+','-','g'));
    select t.id into v_tag_id from public.exercise_tags t
      where t.created_by=v_user and t.slug=v_slug limit 1;
    if v_tag_id is null then
      insert into public.exercise_tags(slug,name,created_by,is_system)
      values(v_slug,v_tag,v_user,false) returning id into v_tag_id;
    end if;
    insert into public.exercise_tag_links(exercise_id,tag_id) values(v_id,v_tag_id)
    on conflict do nothing;
  end loop;

  delete from public.exercise_substitution_members m using public.exercise_substitution_groups g
  where m.exercise_id=v_id and g.id=m.group_id and g.created_by=v_user;

  foreach v_group_id in array coalesce(p_substitution_group_ids,'{}'::uuid[]) loop
    if not exists (select 1 from public.exercise_substitution_groups g where g.id=v_group_id and g.created_by=v_user)
      then raise exception 'Substitution group not found or access denied'; end if;
    insert into public.exercise_substitution_members(group_id,exercise_id,priority,is_default)
    values(v_group_id,v_id,100,false) on conflict do nothing;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_exercise(jsonb, text, text[], text[], uuid[]) from public, anon;
grant execute on function public.save_exercise(jsonb, text, text[], text[], uuid[]) to authenticated;
