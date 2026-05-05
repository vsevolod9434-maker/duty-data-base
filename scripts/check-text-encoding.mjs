import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const textExtensions = new Set([".ts", ".tsx", ".css", ".md", ".json", ".mjs"]);
const ignoredDirectories = new Set([".git", ".next", "node_modules"]);

const suspiciousPatterns = [
  {
    name: "cp1251-mojibake",
    regex: new RegExp("(?:[\\u0420\\u0421][\\u0080-\\u04FF]){3,}", "g"),
  },
  {
    name: "latin1-mojibake",
    regex: new RegExp("(?:[\\u00D0\\u00D1][\\u0080-\\u00BF]){3,}", "g"),
  },
  {
    name: "utf8-punctuation-mojibake",
    regex: new RegExp("\\u0432\\u0402[\\u0090-\\u00BF]?", "g"),
  },
  {
    name: "replacement-character",
    regex: new RegExp("\\uFFFD", "g"),
  },
];

const findings = [];

function walkDirectory(directoryPath) {
  for (const entry of readdirSync(directoryPath)) {
    const fullPath = path.join(directoryPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (!ignoredDirectories.has(entry)) {
        walkDirectory(fullPath);
      }

      continue;
    }

    if (!textExtensions.has(path.extname(entry))) {
      continue;
    }

    inspectFile(fullPath);
  }
}

function inspectFile(filePath) {
  const content = readFileSync(filePath, "utf8");

  for (const { name, regex } of suspiciousPatterns) {
    regex.lastIndex = 0;
    const match = regex.exec(content);

    if (!match) {
      continue;
    }

    findings.push({
      filePath: path.relative(rootDir, filePath),
      kind: name,
      fragment: match[0].replace(/\s+/g, " ").slice(0, 80),
    });

    break;
  }
}

walkDirectory(rootDir);

if (findings.length > 0) {
  console.error("Найдены подозрительные строки с битой кодировкой:");

  for (const finding of findings) {
    console.error(`- ${finding.filePath} [${finding.kind}]: ${finding.fragment}`);
  }

  process.exit(1);
}

console.log("Проверка кодировки пройдена.");
