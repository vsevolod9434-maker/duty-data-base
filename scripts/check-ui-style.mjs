import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

function walk(directoryPath, extensions) {
  const files = [];

  for (const entry of readdirSync(directoryPath)) {
    const fullPath = path.join(directoryPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...walk(fullPath, extensions));
      continue;
    }

    if (extensions.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

const cssFiles = walk(path.join(rootDir, "src", "app"), new Set([".css"]));
const uiSourceFiles = [
  ...walk(path.join(rootDir, "src", "app"), new Set([".tsx"])),
  ...walk(path.join(rootDir, "src", "components"), new Set([".tsx"])),
];

const globalsSource = readFileSync(path.join(rootDir, "src", "app", "globals.css"), "utf8");
assert.equal(
  globalsSource.includes('--font-pda-ui: "Arial Narrow", "Segoe UI", Arial, sans-serif;'),
  true,
  "The PDA interface must define one canonical Cyrillic-capable UI font stack.",
);
for (const alias of [
  "--font-khand: var(--font-pda-ui);",
  "--default-font-family: var(--font-pda-ui);",
  "--default-mono-font-family: var(--font-pda-ui);",
]) {
  assert.equal(
    globalsSource.includes(alias),
    true,
    `Global typography alias is not tied to the canonical PDA font stack: ${alias}`,
  );
}

for (const filePath of cssFiles) {
  const source = readFileSync(filePath, "utf8");

  for (const match of source.matchAll(/font-family:\s*([^;]+);/g)) {
    assert.equal(
      match[1].trim(),
      "var(--font-pda-ui)",
      `${path.relative(rootDir, filePath)} contains a font-family outside the canonical PDA stack: ${match[1].trim()}`,
    );
  }

  const nonCanonicalShorthand = source.match(
    /font:\s*[^;]*(?:Consolas|Lucida Console|Segoe UI|Arial Narrow|Roboto Condensed|monospace|sans-serif)[^;]*;/,
  );
  assert.equal(
    nonCanonicalShorthand,
    null,
    `${path.relative(rootDir, filePath)} contains a font shorthand with a separate font family.`,
  );
}

for (const filePath of uiSourceFiles) {
  const source = readFileSync(filePath, "utf8");

  assert.equal(
    /[\u0400-\u04FF]\.\.\./.test(source),
    false,
    `${path.relative(rootDir, filePath)} contains an ASCII ellipsis in a Cyrillic UI string. Use … instead.`,
  );

  assert.equal(
    /сталкерск(?:ий|ого|ому|им|ом|ая|ой|ую|ие|их|ими|ими)?\s+профил/iu.test(source),
    false,
    `${path.relative(rootDir, filePath)} uses inconsistent terminology. Prefer «профиль сталкера» / «профили сталкеров».`,
  );
}

const topbarSource = readFileSync(
  path.join(rootDir, "src", "components", "layout", "PdaTopbar.tsx"),
  "utf8",
);

assert.equal(
  topbarSource.includes("router.push(withBasePath(tab.href))"),
  false,
  "Next router navigation must not receive an already base-path-prefixed route.",
);
assert.equal(
  topbarSource.includes("router.push(tab.href);"),
  true,
  "Top-level dropdown navigation must route through the unprefixed internal href.",
);

const profilesSource = readFileSync(
  path.join(rootDir, "src", "app", "stalkers", "profiles", "page.tsx"),
  "utf8",
);
const groupsSource = readFileSync(
  path.join(rootDir, "src", "app", "stalkers", "groups", "page.tsx"),
  "utf8",
);

for (const [source, fragment, message] of [
  [profilesSource, 'setActiveProfileTab("Задания");', "Selecting a stalker profile must open a useful records tab by default."],
  [profilesSource, 'router.replace(`/stalkers/profiles?profileId=${encodeURIComponent(profileId)}`', "Selected profile must be reflected in the URL for reload/deep-link continuity."],
  [profilesSource, 'router.push(`/stalkers/groups?groupId=${encodeURIComponent(groupId)}`', "Profile group cards must open the exact related group."],
  [groupsSource, 'setActiveGroupTab("Состав");', "Selecting a stalker group must open its member list by default."],
  [groupsSource, 'router.replace(`/stalkers/groups?groupId=${encodeURIComponent(groupId)}`', "Selected group must be reflected in the URL for reload/deep-link continuity."],
  [groupsSource, 'router.push(`/stalkers/profiles?profileId=${encodeURIComponent(profile.id)}`', "Group members must provide direct navigation to the exact stalker profile."],
]) {
  assert.equal(source.includes(fragment), true, message);
}

const centeredGrid = "grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr);";
assert.equal(
  globalsSource.split(centeredGrid).length - 1 >= 2,
  true,
  "Desktop top navigation must stay centered between equal flexible side tracks.",
);

console.log("UI typography, wording and navigation invariants passed.");
