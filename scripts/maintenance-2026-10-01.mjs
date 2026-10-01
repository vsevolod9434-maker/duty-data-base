import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

function readConnectionString() {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!raw) {
    throw new Error("DIRECT_URL or DATABASE_URL is not configured.");
  }

  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  return url.toString();
}

async function main() {
  const hardeningSql = await readFile(
    path.resolve("supabase/static-pages-access-hardening.sql"),
    "utf8",
  );
  const client = new Client({
    connectionString: readConnectionString(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query("begin");

    const beforeResult = await client.query(
      'select count(*)::int as count from public."DutyMember"',
    );
    const beforeCount = Number(beforeResult.rows[0]?.count ?? 0);

    const releasedResult = await client.query(
      `update public."DutyStaffPosition"
       set "dutyMemberId" = null,
           "assignedAt" = null,
           "assignedBy" = null,
           "updatedBy" = 'Системная очистка',
           "updatedAt" = now()
       where "dutyMemberId" is not null`,
    );

    const deletedResult = await client.query(
      'delete from public."DutyMember"',
    );

    await client.query(hardeningSql);

    const afterResult = await client.query(
      'select count(*)::int as count from public."DutyMember"',
    );
    const afterCount = Number(afterResult.rows[0]?.count ?? 0);

    if (afterCount !== 0) {
      throw new Error(`DutyMember purge verification failed: ${afterCount} rows remain.`);
    }

    await client.query("commit");

    console.log(
      JSON.stringify(
        {
          dutyMembersBefore: beforeCount,
          dutyMembersDeleted: deletedResult.rowCount ?? 0,
          dutyMembersAfter: afterCount,
          staffPositionsReleased: releasedResult.rowCount ?? 0,
          accessHardeningApplied: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
