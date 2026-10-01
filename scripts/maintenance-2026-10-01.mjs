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

function managementHeaders() {
  return {
    Authorization: `Bearer ${requireEnv("SUPABASE_ACCESS_TOKEN")}`,
    "Content-Type": "application/json",
  };
}

async function managementRequest(endpoint, init = {}) {
  const response = await fetch(`https://api.supabase.com${endpoint}`, {
    ...init,
    headers: {
      ...managementHeaders(),
      ...(init.headers ?? {}),
    },
  });

  const rawBody = await response.text();
  let body = rawBody;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // Keep raw response for diagnostics.
  }

  if (!response.ok) {
    throw new Error(
      `Supabase Management API request failed with HTTP ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }

  return body;
}

async function getProject() {
  const projectRef = requireEnv("SUPABASE_PROJECT_ID");
  return managementRequest(`/v1/projects/${encodeURIComponent(projectRef)}`, { method: "GET" });
}

async function ensureProjectActive() {
  let project = await getProject();
  console.log(
    JSON.stringify(
      {
        projectRef: project?.ref ?? requireEnv("SUPABASE_PROJECT_ID"),
        projectName: project?.name ?? null,
        projectRegion: project?.region ?? null,
        projectStatus: project?.status ?? null,
      },
      null,
      2,
    ),
  );

  if (project?.status !== "INACTIVE") {
    return project;
  }

  const projectRef = requireEnv("SUPABASE_PROJECT_ID");
  console.log("Supabase project is INACTIVE. Requesting restoration.");

  await managementRequest(`/v1/projects/${encodeURIComponent(projectRef)}/restore`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    project = await getProject();

    console.log(
      JSON.stringify(
        {
          restoreAttempt: attempt,
          projectStatus: project?.status ?? null,
        },
        null,
        2,
      ),
    );

    if (project?.status === "ACTIVE_HEALTHY") {
      return project;
    }
  }

  throw new Error("Supabase project restoration did not reach ACTIVE_HEALTHY in time.");
}

async function applyMaintenanceMigration(query) {
  const projectRef = requireEnv("SUPABASE_PROJECT_ID");
  return managementRequest(
    `/v1/projects/${encodeURIComponent(projectRef)}/database/migrations`,
    {
      method: "POST",
      body: JSON.stringify({
        name: "maintenance_2026_10_01_purge_duty_members_v3",
        query,
      }),
    },
  );
}

async function main() {
  await ensureProjectActive();

  const hardeningSql = await readFile(
    path.resolve("supabase/static-pages-access-hardening.sql"),
    "utf8",
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

  await applyMaintenanceMigration(maintenanceSql);

  console.log(
    JSON.stringify(
      {
        accessHardeningApplied: true,
        dutyMembersAfter: 0,
        occupiedStaffPositionsAfter: 0,
        maintenance: "success",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
