alter table public.exercises
  add column if not exists exercise_type text,
  add column if not exists tracking_type text not null default 'weight_reps',
  add column if not exists aliases text[] not null default '{}'::text[];

update public.exercises
set exercise_type = case
  when mechanics = 'isolation' then 'isolation'
  else 'compound'
end
where exercise_type is null;

alter table public.exercises
  alter column exercise_type set default 'compound',
  alter column exercise_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.exercises'::regclass and conname='exercises_exercise_type_check'
  ) then
    alter table public.exercises
      add constraint exercises_exercise_type_check
      check (exercise_type in ('compound','isolation','cardio'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.exercises'::regclass and conname='exercises_tracking_type_check'
  ) then
    alter table public.exercises
      add constraint exercises_tracking_type_check
      check (tracking_type in (
        'weight_reps','bodyweight_reps','weighted_bodyweight','assisted_bodyweight',
        'reps_only','duration','weight_duration','distance_duration','weight_distance'
      ));
  end if;
end $$;

insert into public.muscle_groups(code,name,parent_code,sort_order) values
  ('glutes_medius','Средняя ягодичная','glutes',111),
  ('adductors','Приводящие бедра',null,112),
  ('erectors','Разгибатели позвоночника','back',22),
  ('hip_flexors','Сгибатели бедра',null,113),
  ('obliques','Косые мышцы живота','core',141)
on conflict (code) do update
set name=excluded.name,parent_code=excluded.parent_code,sort_order=excluded.sort_order;

insert into public.exercise_equipment(code,name,sort_order) values
  ('fitball','Фитбол',85),
  ('step_platform','Степ / платформа',86),
  ('cardio_stepper','Степпер',87),
  ('stationary_bike','Велотренажёр',88)
on conflict (code) do update set name=excluded.name,sort_order=excluded.sort_order;

insert into public.movement_patterns(code,name,sort_order) values
  ('hip_thrust','Разгибание таза / ягодичный мост',75),
  ('step_up','Зашагивание',81),
  ('hip_abduction','Отведение бедра',82),
  ('hip_extension','Разгибание бедра',83),
  ('chest_fly','Сведение рук на грудь',25),
  ('shoulder_flexion','Подъём руки перед собой',135),
  ('core_flexion','Сгибание корпуса',151),
  ('core_anti_extension','Антиразгибание корпуса',152),
  ('core_rotation','Ротация корпуса',153),
  ('back_extension','Разгибание корпуса',154),
  ('cardio_steady','Равномерное кардио',180),
  ('cardio_interval','Интервальное кардио',181)
on conflict (code) do update set name=excluded.name,sort_order=excluded.sort_order;

create or replace function public.save_exercise_v2(
  p_exercise jsonb,
  p_primary_muscles text[] default '{}',
  p_secondary_muscles text[] default '{}',
  p_stabilizer_muscles text[] default '{}',
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
  v_is_new boolean := false;
  v_type text;
  v_tracking text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user and p.role='trainer') then
    raise exception 'Trainer role required';
  end if;

  v_name := nullif(btrim(p_exercise->>'name'), '');
  if v_name is null then raise exception 'Exercise name is required'; end if;

  v_type := coalesce(nullif(p_exercise->>'exercise_type',''),'compound');
  v_tracking := coalesce(nullif(p_exercise->>'tracking_type',''),'weight_reps');
  v_code := nullif(btrim(p_exercise->>'code'), '');

  if coalesce(nullif(p_exercise->>'id',''),'') = '' then
    v_is_new := true;
    if v_code is null then
      v_code := 'EX_' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    end if;

    insert into public.exercises(
      code,name,description,equipment_code,movement_pattern_code,default_rest_seconds,
      technique_url,is_unilateral,instructions,setup_notes,common_mistakes,mechanics,
      exercise_type,tracking_type,aliases,is_active,created_by,updated_at
    ) values (
      v_code,v_name,nullif(btrim(p_exercise->>'description'),''),
      nullif(p_exercise->>'equipment_code',''),nullif(p_exercise->>'movement_pattern_code',''),
      coalesce((p_exercise->>'default_rest_seconds')::integer,120),
      nullif(btrim(p_exercise->>'technique_url'),''),
      coalesce((p_exercise->>'is_unilateral')::boolean,false),
      nullif(btrim(p_exercise->>'instructions'),''),
      nullif(btrim(p_exercise->>'setup_notes'),''),
      nullif(btrim(p_exercise->>'common_mistakes'),''),
      case when v_type in ('compound','isolation') then v_type else null end,
      v_type,v_tracking,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_exercise->'aliases','[]'::jsonb))),'{}'::text[]),
      coalesce((p_exercise->>'is_active')::boolean,true),v_user,now()
    ) returning id into v_id;
  else
    v_id := (p_exercise->>'id')::uuid;
    update public.exercises e set
      code=coalesce(v_code,e.code),
      name=v_name,
      description=nullif(btrim(p_exercise->>'description'),''),
      equipment_code=nullif(p_exercise->>'equipment_code',''),
      movement_pattern_code=nullif(p_exercise->>'movement_pattern_code',''),
      default_rest_seconds=coalesce((p_exercise->>'default_rest_seconds')::integer,120),
      technique_url=nullif(btrim(p_exercise->>'technique_url'),''),
      is_unilateral=coalesce((p_exercise->>'is_unilateral')::boolean,false),
      instructions=nullif(btrim(p_exercise->>'instructions'),''),
      setup_notes=nullif(btrim(p_exercise->>'setup_notes'),''),
      common_mistakes=nullif(btrim(p_exercise->>'common_mistakes'),''),
      mechanics=case when v_type in ('compound','isolation') then v_type else null end,
      exercise_type=v_type,
      tracking_type=v_tracking,
      aliases=coalesce(array(select jsonb_array_elements_text(coalesce(p_exercise->'aliases','[]'::jsonb))),e.aliases),
      is_active=coalesce((p_exercise->>'is_active')::boolean,true),
      updated_at=now()
    where e.id=v_id;
    if not found then raise exception 'Exercise not found'; end if;
  end if;

  delete from public.exercise_muscle_groups where exercise_id=v_id;

  insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
  select v_id,x,'primary'
  from unnest(coalesce(p_primary_muscles,'{}'::text[])) x
  where x is not null and btrim(x)<>''
  on conflict(exercise_id,muscle_group_code) do update set role='primary';

  insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
  select v_id,x,'secondary'
  from unnest(coalesce(p_secondary_muscles,'{}'::text[])) x
  where x is not null and btrim(x)<>''
    and not (x=any(coalesce(p_primary_muscles,'{}'::text[])))
  on conflict(exercise_id,muscle_group_code) do update set role='secondary';

  insert into public.exercise_muscle_groups(exercise_id,muscle_group_code,role)
  select v_id,x,'stabilizer'
  from unnest(coalesce(p_stabilizer_muscles,'{}'::text[])) x
  where x is not null and btrim(x)<>''
    and not (x=any(coalesce(p_primary_muscles,'{}'::text[])))
    and not (x=any(coalesce(p_secondary_muscles,'{}'::text[])))
  on conflict(exercise_id,muscle_group_code) do update set role='stabilizer';

  delete from public.exercise_tag_links where exercise_id=v_id;
  foreach v_tag in array coalesce(p_tags,'{}'::text[]) loop
    v_tag := btrim(v_tag);
    if v_tag='' then continue; end if;
    v_slug := lower(regexp_replace(v_tag,'[[:space:]]+','-','g'));
    select t.id into v_tag_id
    from public.exercise_tags t
    where t.slug=v_slug and (t.is_system=true or t.created_by=v_user)
    order by t.is_system desc
    limit 1;

    if v_tag_id is null then
      insert into public.exercise_tags(slug,name,created_by,is_system)
      values(v_slug,v_tag,v_user,false)
      returning id into v_tag_id;
    end if;

    insert into public.exercise_tag_links(exercise_id,tag_id)
    values(v_id,v_tag_id)
    on conflict do nothing;
  end loop;

  if v_is_new then
    foreach v_group_id in array coalesce(p_substitution_group_ids,'{}'::uuid[]) loop
      if exists(select 1 from public.exercise_substitution_groups g where g.id=v_group_id) then
        insert into public.exercise_substitution_members(
          group_id,exercise_id,priority,is_default,match_type
        ) values(v_group_id,v_id,100,false,'direct')
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_exercise_v2(jsonb,text[],text[],text[],text[],uuid[]) from public, anon;
grant execute on function public.save_exercise_v2(jsonb,text[],text[],text[],text[],uuid[]) to authenticated;

-- Existing library correction: Face Pull is an accessory/isolation exercise in this taxonomy.
update public.exercises
set exercise_type='isolation', mechanics='isolation'
where code='DELTS_REAR_FACE_PULL';
