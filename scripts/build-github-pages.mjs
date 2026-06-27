import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(root, ".github-pages-build");
const sourceRoot = path.join(buildRoot, "src");
const fallbackBasePath = "/duty-data-base";
const minimalNextEnv = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file is generated for the temporary GitHub Pages build.
// See https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`;

function resolveBasePath() {
  const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
  if (configuredBasePath) {
    return configuredBasePath;
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").pop()?.trim();
  return repositoryName ? `/${repositoryName}` : fallbackBasePath;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: buildRoot,
      env: {
        ...process.env,
        GITHUB_PAGES: "true",
        NEXT_PUBLIC_BASE_PATH: resolveBasePath(),
        NEXT_PUBLIC_STATIC_EXPORT: "true",
      },
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
      }
    });
    child.on("error", reject);
  });
}

async function copyProject() {
  await rm(buildRoot, { force: true, recursive: true });
  await mkdir(buildRoot, { recursive: true });

  for (const file of [
    "next.config.ts",
    "package.json",
    "package-lock.json",
    "postcss.config.mjs",
    "tsconfig.json",
  ]) {
    await cp(path.join(root, file), path.join(buildRoot, file));
  }

  await writeFile(path.join(buildRoot, "next-env.d.ts"), minimalNextEnv);

  await cp(path.join(root, "public"), path.join(buildRoot, "public"), { recursive: true });
  await cp(path.join(root, "src"), sourceRoot, {
    filter(source) {
      return path.resolve(source) !== path.join(root, "src", "app", "api");
    },
    recursive: true,
  });

  const tsconfigPath = path.join(buildRoot, "tsconfig.json");
  const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8"));
  tsconfig.compilerOptions.incremental = false;
  tsconfig.exclude = [...new Set([...(tsconfig.exclude ?? []), "src/lib/prisma.ts", "src/lib/supabase/server.ts", "src/lib/supabase/middleware.ts", "src/lib/auth/require-api-auth.ts"])];
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

async function main() {
  await copyProject();

  try {
    const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
    await run(process.execPath, [nextBin, "build", "--webpack"]);
    await rm(path.join(root, "out"), { force: true, recursive: true });
    await cp(path.join(buildRoot, "out"), path.join(root, "out"), { recursive: true });
    await writeFile(path.join(root, "out", ".nojekyll"), "");
  } finally {
    await rm(buildRoot, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
