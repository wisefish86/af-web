create or replace function public.save_exercise_with_new_groups(
  p_exercise jsonb,
  p_primary_muscles text[] default '{}'::text[],
  p_secondary_muscles text[] default '{}'::text[],
  p_stabilizer_muscles text[] default '{}'::text[],
  p_tags text[] default '{}'::text[],
  p_existing_group_ids uuid[] default '{}'::uuid[],
  p_new_group_names text[] default '{}'::text[]
)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_group_ids uuid[]:=coalesce(p_existing_group_ids,'{}'::uuid[]);
  v_name text;
  v_group_id uuid;
  v_exercise_id uuid;
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.role='trainer') then
    raise exception 'Trainer role required';
  end if;

  foreach v_name in array coalesce(p_new_group_names,'{}'::text[])
  loop
    v_name:=btrim(v_name);
    if v_name='' then continue; end if;

    v_code:='CUSTOM_'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
    insert into public.exercise_substitution_groups(code,name,purpose,scope,created_by)
    values(v_code,v_name,null,'specific',v_user)
    returning id into v_group_id;

    v_group_ids:=array_append(v_group_ids,v_group_id);
  end loop;

  v_exercise_id:=public.save_exercise_v2(
    p_exercise,
    p_primary_muscles,
    p_secondary_muscles,
    p_stabilizer_muscles,
    p_tags,
    v_group_ids
  );

  return v_exercise_id;
end;
$function$;

revoke execute on function public.save_exercise_with_new_groups(
  jsonb,text[],text[],text[],text[],uuid[],text[]
) from public,anon;
grant execute on function public.save_exercise_with_new_groups(
  jsonb,text[],text[],text[],text[],uuid[],text[]
) to authenticated;
