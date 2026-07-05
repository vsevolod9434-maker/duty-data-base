-- Repair grants for Supabase Edge Function access-admin.
--
-- The function uses the Supabase service_role key for backend-only access
-- management operations after verifying the caller JWT and AccessUser record.
-- These grants do not disable RLS and do not grant browser roles extra access.
--
-- This file is not applied automatically.

begin;

grant usage on schema public to service_role;

grant select, insert, update, delete
on public."AccessUser"
to service_role;

grant select, insert, update, delete
on public."DutyMember"
to service_role;

commit;
