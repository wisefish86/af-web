revoke all on function public.save_my_nutrition_setup(
  text,numeric,integer,integer,text
) from public,anon;

grant execute on function public.save_my_nutrition_setup(
  text,numeric,integer,integer,text
) to authenticated;
