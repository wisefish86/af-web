-- Global food creation race guard.
-- Uses authenticated trainer context and rolls all changes back.

begin;

select set_config(
  'request.jwt.claims',
  (
    select jsonb_build_object('sub',p.id,'role','authenticated')::text
    from public.profiles p
    where p.role='trainer'
    limit 1
  ),
  true
);

set local role authenticated;

do $$
declare
  v_trainer uuid:=auth.uid();
  v_name text:='QA duplicate food '||replace(gen_random_uuid()::text,'-','');
  v_failed boolean:=false;
begin
  if v_trainer is null then
    raise exception 'Food race smoke requires a trainer';
  end if;

  insert into public.foods(name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,food_group,created_by)
  values(v_name,100,10,2,12,100,'meat',v_trainer);

  begin
    insert into public.foods(name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,food_group,created_by)
    values('  '||upper(v_name)||'  ',100,10,2,12,100,'meat',v_trainer);
  exception when unique_violation then
    v_failed:=true;
  end;

  if not v_failed then
    raise exception 'Normalized duplicate active food was accepted';
  end if;
end $$;

rollback;
