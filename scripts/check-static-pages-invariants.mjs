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

console.log("Static Pages and Supabase SQL invariants passed.");
