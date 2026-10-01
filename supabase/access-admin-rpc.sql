-- Atomic service-role operation used by the access-admin Edge Function.
-- Keeps access state, staff assignment and member status consistent.

create or replace function public.exclude_duty_member_transaction(target_member_id text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  target_access_user_id text;
begin
  select "accessUserId"
    into target_access_user_id
  from public."DutyMember"
  where "id" = target_member_id
  for update;

  if not found or target_access_user_id is null then
    raise exception 'DUTY_MEMBER_NOT_FOUND';
  end if;

  update public."AccessUser"
  set "isActive" = false
  where "id" = target_access_user_id;

  update public."DutyStaffPosition"
  set
    "assignedAt" = null,
    "dutyMemberId" = null,
    "updatedAt" = now()
  where "dutyMemberId" = target_member_id;

  update public."DutyMember"
  set
    "profileStatus" = 'archived'::public."DutyMemberProfileStatus",
    "serviceStatus" = 'discharged'::public."DutyServiceStatus",
    "updatedAt" = now()
  where "id" = target_member_id;
end
$$;

revoke all on function public.exclude_duty_member_transaction(text) from public;
revoke all on function public.exclude_duty_member_transaction(text) from anon;
revoke all on function public.exclude_duty_member_transaction(text) from authenticated;
grant execute on function public.exclude_duty_member_transaction(text) to service_role;
