
insert into public.client_tracking_config(client_id,field_code,enabled,required,frequency,settings,configured_by)
values
('b15df890-8b72-49b8-b16f-5aa578bea2f0','weight',true,false,'3x_week','{"weekdays":[1,3,6],"time":"08:00"}','72ac0dcb-b169-423c-856c-c1e150c2a187'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','waist',true,false,'weekly','{"weekdays":[6],"time":"08:10"}','72ac0dcb-b169-423c-856c-c1e150c2a187'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','chest',true,false,'monthly','{}','72ac0dcb-b169-423c-856c-c1e150c2a187'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','hips',true,false,'monthly','{}','72ac0dcb-b169-423c-856c-c1e150c2a187'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','thigh',true,false,'monthly','{}','72ac0dcb-b169-423c-856c-c1e150c2a187'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','arm_relaxed',true,false,'monthly','{}','72ac0dcb-b169-423c-856c-c1e150c2a187'),
('b15df890-8b72-49b8-b16f-5aa578bea2f0','arm_flexed',true,false,'monthly','{}','72ac0dcb-b169-423c-856c-c1e150c2a187')
on conflict(client_id,field_code) do nothing;
