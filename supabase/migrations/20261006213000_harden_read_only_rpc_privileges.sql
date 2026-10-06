-- Least-privilege hardening for read-only RPCs.
-- Both functions only read data already protected by RLS, so elevated privileges are unnecessary.

alter function public.get_trainer_client_nutrition_plans(uuid) security invoker;
alter function public.get_workout_load_recommendation(uuid) security invoker;
