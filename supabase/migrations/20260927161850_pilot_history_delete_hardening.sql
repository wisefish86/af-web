drop function if exists public.save_my_nutrition_checkin(date,text,text,integer,numeric,uuid);

alter table public.daily_checkins drop constraint if exists daily_checkins_client_id_fkey;
alter table public.daily_checkins
  add constraint daily_checkins_client_id_fkey foreign key(client_id) references public.profiles(id) on delete restrict;

alter table public.measurements drop constraint if exists measurements_client_id_fkey;
alter table public.measurements
  add constraint measurements_client_id_fkey foreign key(client_id) references public.profiles(id) on delete restrict;

alter table public.monthly_checkins drop constraint if exists monthly_checkins_client_id_fkey;
alter table public.monthly_checkins
  add constraint monthly_checkins_client_id_fkey foreign key(client_id) references public.profiles(id) on delete restrict;

alter table public.training_programs drop constraint if exists training_programs_client_id_fkey;
alter table public.training_programs
  add constraint training_programs_client_id_fkey foreign key(client_id) references public.profiles(id) on delete restrict;

alter table public.workout_sessions drop constraint if exists workout_sessions_client_id_fkey;
alter table public.workout_sessions
  add constraint workout_sessions_client_id_fkey foreign key(client_id) references public.profiles(id) on delete restrict;
