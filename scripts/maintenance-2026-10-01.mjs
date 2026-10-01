import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

async function runQuery(query, readOnly = false) {
  const projectRef = requireEnv("SUPABASE_PROJECT_ID");
  const accessToken = requireEnv("SUPABASE_ACCESS_TOKEN");
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        read_only: readOnly,
      }),
    },
  );

  const rawBody = await response.text();
  let body = rawBody;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Keep the raw response for diagnostics when the API returns non-JSON.
  }

  if (!response.ok) {
    throw new Error(
      `Supabase Management API query failed with HTTP ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }

  return body;
}

async function main() {
  const hardeningSql = await readFile(
    path.resolve("supabase/static-pages-access-hardening.sql"),
    "utf8",
  );

  const before = await runQuery(
    `select
       (select count(*)::int from public."DutyMember") as "dutyMembersBefore",
       (select count(*)::int from public."DutyStaffPosition" where "dutyMemberId" is not null) as "occupiedStaffPositionsBefore"`,
    true,
  );

  const maintenanceSql = `
begin;

update public."DutyStaffPosition"
set "dutyMemberId" = null,
    "assignedAt" = null,
    "assignedBy" = null,
    "updatedBy" = 'Системная очистка',
    "updatedAt" = now()
where "dutyMemberId" is not null;

delete from public."DutyMember";

${hardeningSql}

do $maintenance$
begin
  if exists (select 1 from public."DutyMember") then
    raise exception 'DutyMember purge verification failed';
  end if;

  if exists (
    select 1
    from public."DutyStaffPosition"
    where "dutyMemberId" is not null
  ) then
    raise exception 'DutyStaffPosition release verification failed';
  end if;
end
$maintenance$;

commit;
`;

  const mutationResult = await runQuery(maintenanceSql, false);

  const after = await runQuery(
    `select
       (select count(*)::int from public."DutyMember") as "dutyMembersAfter",
       (select count(*)::int from public."DutyStaffPosition" where "dutyMemberId" is not null) as "occupiedStaffPositionsAfter",
       true as "accessHardeningApplied"`,
    true,
  );

  console.log(JSON.stringify({ before, mutationResult, after }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
