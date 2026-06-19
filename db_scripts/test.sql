
select *
FROM tenants


select *
FROM organizations


select users.password_hash,*
from public.users
--This is a bcrypt hash of Admin@123, cost factor 12

select *
from public.users
where email = 'komal.hegde@fitclass.in'

select *
from public.marketing_leads
