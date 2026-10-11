-- Keep close replacements anatomically/biomechanically specific.
insert into public.exercise_substitution_members(group_id,exercise_id,priority,is_default,match_type,notes)
select g.id,e.id,15,false,'direct','Вариант над головой с прямой рукоятью; акцент на длинной головке трицепса.'
from public.exercise_substitution_groups g
join public.exercises e on e.code='TRICEPS_OVERHEAD_STRAIGHT_BAR_EXT'
where g.code='TRICEPS_OVERHEAD'
on conflict(group_id,exercise_id) do update
set priority=excluded.priority,match_type=excluded.match_type,notes=excluded.notes;

insert into public.exercise_substitution_members(group_id,exercise_id,priority,is_default,match_type,notes)
select g.id,e.id,45,false,'direct','Разгибание локтя на трицепс.'
from public.exercise_substitution_groups g
join public.exercises e on e.code='TRICEPS_OVERHEAD_STRAIGHT_BAR_EXT'
where g.code='TRICEPS_EXTENSION'
on conflict(group_id,exercise_id) do update
set priority=excluded.priority,match_type=excluded.match_type,notes=excluded.notes;
