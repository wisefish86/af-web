-- Transactional smoke for atomic trainer-owned exercise media replacement.

begin;

do $$
declare
  v_trainer uuid;
  v_exercise uuid;
  v_first_id uuid;
  v_second_id uuid;
  v_previous text;
  v_path_one text:='qa/atomic-media-one-'||gen_random_uuid()::text||'.jpg';
  v_path_two text:='qa/atomic-media-two-'||gen_random_uuid()::text||'.jpg';
  v_count integer;
begin
  select id into v_trainer
  from public.profiles
  where role='trainer'
  order by created_at
  limit 1;

  select id into v_exercise
  from public.exercises
  where is_active=true
  order by created_at
  limit 1;

  if v_trainer is null or v_exercise is null then
    raise exception 'QA atomic media smoke requires one trainer and one exercise';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_trainer,'role','authenticated')::text,true);
  set local role authenticated;

  select id,previous_storage_path
  into v_first_id,v_previous
  from public.replace_my_exercise_media(v_exercise,'image',v_path_one,0);

  if v_first_id is null then raise exception 'First media replacement returned no id'; end if;

  select id,previous_storage_path
  into v_second_id,v_previous
  from public.replace_my_exercise_media(v_exercise,'image',v_path_two,0);

  if v_second_id is distinct from v_first_id then
    raise exception 'Media replacement created a second owned slot';
  end if;
  if v_previous is distinct from v_path_one then
    raise exception 'Expected previous path %, got %',v_path_one,v_previous;
  end if;

  select count(*) into v_count
  from public.exercise_media
  where exercise_id=v_exercise and kind='image' and created_by=v_trainer;

  if v_count<>1 then
    raise exception 'Expected one trainer-owned image row, found %',v_count;
  end if;

  if not exists(
    select 1 from public.exercise_media
    where id=v_first_id and storage_path=v_path_two
  ) then
    raise exception 'Replacement path was not committed atomically';
  end if;

  reset role;
end $$;

rollback;
