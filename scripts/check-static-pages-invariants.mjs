import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rlsSource = readFileSync("supabase/rls-policies.sql", "utf8");
const rlsLines = rlsSource.split(/\r?\n/);

const invalidDollarQuoteLines = rlsLines
  .map((line, index) => ({ line, number: index + 1 }))
  .filter(({ line }) => /^\s*as \$(?!\$)/.test(line) || /^\s*\$;\s*$/.test(line));

assert.deepEqual(
  invalidDollarQuoteLines,
  [],
  "RLS SQL contains a malformed single-dollar function delimiter.",
);

const authoritativePages = [
  "src/app/stalkers/profiles/page.tsx",
  "src/app/stalkers/groups/page.tsx",
  "src/app/apartments/page.tsx",
  "src/app/journals/page.tsx",
];

for (const path of authoritativePages) {
  const source = readFileSync(path, "utf8");
  assert.equal(
    source.includes("readStoredCollection"),
    false,
    `${path} must not use legacy localStorage data as a source-of-truth fallback.`,
  );
}

const navigationPages = [
  "src/app/stalkers/profiles/page.tsx",
  "src/app/apartments/page.tsx",
];

for (const path of navigationPages) {
  const source = readFileSync(path, "utf8");
  assert.equal(
    /window\.location\.(?:href\s*=|assign\()\s*[\`"']\//.test(source),
    false,
    `${path} contains an absolute browser navigation that can lose the GitHub Pages base path.`,
  );
}

const staticApiSource = readFileSync("src/lib/supabase/static-api.ts", "utf8");
for (const guard of [
  "const hasMembers = payload.members !== undefined;",
  "const hasPayments = payload.payments !== undefined;",
  "const hasItems = payload.items !== undefined;",
]) {
  assert.equal(
    staticApiSource.includes(guard),
    true,
    `Static API must preserve omitted child collections: missing guard ${guard}`,
  );
}

const accessAdminSource = readFileSync("supabase/functions/access-admin/index.ts", "utf8");
assert.equal(
  accessAdminSource.includes('.rpc("exclude_duty_member_transaction"'),
  true,
  "Duty-member exclusion must use the atomic database RPC.",
);
assert.equal(
  accessAdminSource.includes("staffPositions:DutyStaffPosition"),
  true,
  "Access-admin responses must include current staff-position relations.",
);
assert.equal(
  accessAdminSource.includes("position: memberData.position"),
  true,
  "Access-admin must persist the duty member position field.",
);
assert.equal(
  accessAdminSource.includes("unit: memberData.unit"),
  true,
  "Access-admin must persist the duty member unit field.",
);

const stalkerUtilsSource = readFileSync("src/lib/stalker-utils.ts", "utf8");
assert.equal(
  stalkerUtilsSource.includes("window.localStorage.setItem(key"),
  false,
  "Legacy operational collections must not be persisted back to localStorage.",
);

const staticAuthGateSourceForStorage = readFileSync("src/components/providers/StaticAuthGate.tsx", "utf8");
assert.equal(
  staticAuthGateSourceForStorage.includes("clearLegacyStoredCollections();"),
  true,
  "App startup must purge legacy browser-side operational collections.",
);

const accessAdminRpcSource = readFileSync("supabase/access-admin-rpc.sql", "utf8");
for (const fragment of [
  'update public."AccessUser"',
  'update public."DutyStaffPosition"',
  'update public."DutyMember"',
  "grant execute on function public.exclude_duty_member_transaction(text) to service_role;",
]) {
  assert.equal(
    accessAdminRpcSource.includes(fragment),
    true,
    `Atomic exclusion RPC is missing required statement: ${fragment}`,
  );
}

console.log("Static Pages and Supabase SQL invariants passed.");
