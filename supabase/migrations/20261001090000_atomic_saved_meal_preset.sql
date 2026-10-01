create or replace function public.save_my_meal_preset(
  p_name text,
  p_meal_type text,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_meal_id uuid;
  v_item jsonb;
  v_sort int:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Meal name is required'; end if;
  if char_length(btrim(p_name))>120 then raise exception 'Meal name is too long'; end if;
  if p_meal_type not in ('main','light','snack') then raise exception 'Invalid meal type'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Meal must contain at least one item';
  end if;

  insert into public.saved_meals(created_by,name,meal_type)
  values(v_user,btrim(p_name),p_meal_type)
  returning id into v_meal_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(btrim(v_item->>'name'),'') is null then raise exception 'Food name is required'; end if;
    if coalesce((v_item->>'grams')::numeric,0)<=0 or (v_item->>'grams')::numeric>10000 then
      raise exception 'Invalid grams';
    end if;
    if coalesce((v_item->>'kcal_100')::numeric,-1)<0
      or coalesce((v_item->>'protein_100')::numeric,-1)<0
      or coalesce((v_item->>'fat_100')::numeric,-1)<0
      or coalesce((v_item->>'carbs_100')::numeric,-1)<0 then
      raise exception 'Invalid nutrition values';
    end if;

    v_sort:=v_sort+10;
    insert into public.saved_meal_items(
      saved_meal_id,food_id,food_name_snapshot,grams,kcal_100_snapshot,
      protein_100_snapshot,fat_100_snapshot,carbs_100_snapshot,is_fixed,sort_order
    )
    values(
      v_meal_id,
      nullif(v_item->>'food_id','')::uuid,
      btrim(v_item->>'name'),
      (v_item->>'grams')::numeric,
      (v_item->>'kcal_100')::numeric,
      (v_item->>'protein_100')::numeric,
      (v_item->>'fat_100')::numeric,
      (v_item->>'carbs_100')::numeric,
      coalesce((v_item->>'is_fixed')::boolean,false),
      v_sort
    );
  end loop;

  return v_meal_id;
end;
$function$;

revoke execute on function public.save_my_meal_preset(text,text,jsonb) from public,anon;
grant execute on function public.save_my_meal_preset(text,text,jsonb) to authenticated;
