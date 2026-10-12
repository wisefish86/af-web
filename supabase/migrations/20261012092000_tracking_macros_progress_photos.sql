-- Tracking parity with Sergey coaching sheet: macros, carbs target and real progress photos.

alter table public.client_targets
  add column if not exists carbs_target_g numeric;

alter table public.client_targets
  drop constraint if exists client_targets_carbs_target_g_check;

alter table public.client_targets
  add constraint client_targets_carbs_target_g_check
  check (carbs_target_g is null or (carbs_target_g >= 0 and carbs_target_g <= 1500));

insert into public.tracking_fields(
  code,section,label,data_type,unit,default_enabled,default_required,client_can_disable,sort_order,validation
) values
  ('fat','daily','Жиры','number','г',false,false,true,25,'{}'::jsonb),
  ('carbs','daily','Углеводы','number','г',false,false,true,30,'{}'::jsonb)
on conflict (code) do update
set section=excluded.section,
    label=excluded.label,
    data_type=excluded.data_type,
    unit=excluded.unit,
    sort_order=excluded.sort_order;

create table if not exists public.progress_photos(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  captured_at date not null default current_date,
  view_type text not null default 'other'
    check (view_type in ('front','side','back','other')),
  storage_path text not null,
  note text,
  created_at timestamptz not null default now(),
  unique(client_id,captured_at,view_type,storage_path)
);

alter table public.progress_photos enable row level security;

drop policy if exists progress_photos_select on public.progress_photos;
create policy progress_photos_select on public.progress_photos
for select to authenticated
using (
  client_id=(select auth.uid())
  or exists(
    select 1 from public.coach_clients cc
    where cc.client_id=progress_photos.client_id
      and cc.coach_id=(select auth.uid())
  )
);

drop policy if exists progress_photos_insert_own on public.progress_photos;
create policy progress_photos_insert_own on public.progress_photos
for insert to authenticated
with check (client_id=(select auth.uid()));

drop policy if exists progress_photos_update_own on public.progress_photos;
create policy progress_photos_update_own on public.progress_photos
for update to authenticated
using (client_id=(select auth.uid()))
with check (client_id=(select auth.uid()));

drop policy if exists progress_photos_delete_own on public.progress_photos;
create policy progress_photos_delete_own on public.progress_photos
for delete to authenticated
using (client_id=(select auth.uid()));

grant select,insert,update,delete on public.progress_photos to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'progress-photos','progress-photos',false,8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists progress_photo_objects_select on storage.objects;
create policy progress_photo_objects_select on storage.objects
for select to authenticated
using (
  bucket_id='progress-photos'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or exists(
      select 1 from public.coach_clients cc
      where cc.client_id::text=(storage.foldername(name))[1]
        and cc.coach_id=(select auth.uid())
    )
  )
);

drop policy if exists progress_photo_objects_insert on storage.objects;
create policy progress_photo_objects_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='progress-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists progress_photo_objects_update on storage.objects;
create policy progress_photo_objects_update on storage.objects
for update to authenticated
using (
  bucket_id='progress-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='progress-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists progress_photo_objects_delete on storage.objects;
create policy progress_photo_objects_delete on storage.objects
for delete to authenticated
using (
  bucket_id='progress-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create or replace function public.save_my_nutrition_checkin_v2(
  p_date date,
  p_mode text,
  p_adherence text default null,
  p_deviation text default null,
  p_calories integer default null,
  p_protein_g numeric default null,
  p_fat_g numeric default null,
  p_carbs_g numeric default null,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('meal_plan','manual') then raise exception 'Invalid nutrition mode'; end if;
  if p_calories is not null and p_calories<0 then raise exception 'Calories cannot be negative'; end if;
  if p_protein_g is not null and p_protein_g<0 then raise exception 'Protein cannot be negative'; end if;
  if p_fat_g is not null and p_fat_g<0 then raise exception 'Fat cannot be negative'; end if;
  if p_carbs_g is not null and p_carbs_g<0 then raise exception 'Carbs cannot be negative'; end if;
  if p_deviation is not null and p_deviation not in ('about_target','over','under','unknown') then
    raise exception 'Invalid nutrition deviation';
  end if;

  if p_mode='meal_plan' then
    if p_adherence is null or p_adherence not in ('followed','partial','not_followed') then
      raise exception 'Adherence is required for meal-plan mode';
    end if;
    if p_plan_id is null then raise exception 'Meal Plan is required for meal-plan mode'; end if;
    if not exists(
      select 1 from public.nutrition_plans p
      where p.id=p_plan_id and p.client_id=v_user and p.status in ('active','archived')
    ) then
      raise exception 'Nutrition plan not available';
    end if;
  else
    if p_calories is null then raise exception 'Calories are required for manual mode'; end if;
    p_adherence:=null;
    p_deviation:=null;
    p_plan_id:=null;
  end if;

  insert into public.daily_checkins(
    client_id,checkin_date,nutrition_mode,nutrition_adherence,nutrition_deviation,
    calories,protein_g,fat_g,carbs_g,nutrition_plan_id
  ) values (
    v_user,coalesce(p_date,current_date),p_mode,p_adherence,p_deviation,
    p_calories,p_protein_g,p_fat_g,p_carbs_g,p_plan_id
  )
  on conflict(client_id,checkin_date) do update
  set nutrition_mode=excluded.nutrition_mode,
      nutrition_adherence=excluded.nutrition_adherence,
      nutrition_deviation=excluded.nutrition_deviation,
      calories=excluded.calories,
      protein_g=excluded.protein_g,
      fat_g=excluded.fat_g,
      carbs_g=excluded.carbs_g,
      nutrition_plan_id=excluded.nutrition_plan_id
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.save_my_nutrition_checkin_v2(date,text,text,text,integer,numeric,numeric,numeric,uuid) from public,anon;
grant execute on function public.save_my_nutrition_checkin_v2(date,text,text,text,integer,numeric,numeric,numeric,uuid) to authenticated;
