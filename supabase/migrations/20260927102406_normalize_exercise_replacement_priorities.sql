update public.exercise_substitution_members m
set priority = 25
from public.exercise_substitution_groups g, public.exercises e
where m.group_id = g.id
  and m.exercise_id = e.id
  and g.code = 'BACK_HORIZONTAL_ROW'
  and e.code = 'BACK_MID_TBAR_MACHINE'
  and m.priority = 20;
