import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const staticAuth = require("../src/lib/supabase/static-auth") as typeof import("../src/lib/supabase/static-auth");
const staticApiRouting = require("../src/lib/supabase/static-api-routing") as typeof import("../src/lib/supabase/static-api-routing");

const { resolveStaticAuthEmail, signInStaticAccessUser, staticLoginErrorMessage } = staticAuth;
const { isStaticSupabaseApiRequest } = staticApiRouting;

type StaticAccessUserProfile = {
  id: string;
  authUserId: string;
  login: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
};

type AccessUserRow = {
  authEmail?: string | null;
  authUserId?: string;
  displayName?: string | null;
  id?: string;
  isActive?: boolean;
  login?: string;
  normalizedLogin?: string;
  role?: string;
};

type MockClientOptions = {
  profile?: StaticAccessUserProfile | null;
  rpcData?: unknown;
  rpcError?: Error | null;
  signInError?: Error | null;
  userId?: string;
  lookupRows?: AccessUserRow[];
};

function createMockClient(options: MockClientOptions) {
  const calls: Array<{ type: string; payload?: unknown }> = [];
  const lookupRows = options.lookupRows ?? [];
  const userId = options.userId ?? "auth-user-1";

  function createQuery(table: string) {
    const filters: Record<string, unknown> = {};
    const query = {
      select(columns: string) {
        calls.push({ type: "select", payload: { table, columns } });
        return query;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return query;
      },
      limit() {
        return query;
      },
      async maybeSingle() {
        calls.push({ type: "maybeSingle", payload: { table, filters: { ...filters } } });

        if (table !== "AccessUser") {
          return { data: null, error: null };
        }

        if (typeof filters.authUserId === "string") {
          return {
            data: options.profile && options.profile.authUserId === filters.authUserId ? options.profile : null,
            error: null,
          };
        }

        const row =
          lookupRows.find((candidate) =>
            Object.entries(filters).every(([key, value]) => candidate[key as keyof AccessUserRow] === value),
          ) ?? null;
        return { data: row, error: null };
      },
    };

    return query;
  }

  const client = {
    calls,
    auth: {
      async signOut(options?: unknown) {
        calls.push({ type: "signOut", payload: options });
        return { error: null };
      },
      async signInWithPassword(credentials: { email: string; password: string }) {
        calls.push({ type: "signInWithPassword", payload: credentials });
        if (options.signInError) {
          return { data: { user: null }, error: options.signInError };
        }
        return { data: { user: { id: userId } }, error: null };
      },
    },
    async rpc(name: string, args: unknown) {
      calls.push({ type: "rpc", payload: { name, args } });
      return { data: options.rpcData ?? null, error: options.rpcError ?? null };
    },
    from(table: string) {
      calls.push({ type: "from", payload: table });
      return createQuery(table);
    },
  };

  return client;
}

const activeProfile: StaticAccessUserProfile = {
  authUserId: "auth-user-1",
  displayName: "Оператор",
  id: "access-user-1",
  isActive: true,
  login: "operator",
  role: "regular",
};

{
  const client = createMockClient({
    profile: activeProfile,
    rpcError: new Error("lookup function is not installed"),
  });

  await signInStaticAccessUser(client as never, "operator@example.test", "password");
  const signInCall = client.calls.find((call) => call.type === "signInWithPassword");
  assert.deepEqual(signInCall?.payload, { email: "operator@example.test", password: "password" });
}

{
  const client = createMockClient({
    profile: activeProfile,
    rpcData: "real-auth@example.test",
  });

  await signInStaticAccessUser(client as never, "operator", "password");
  const signInCall = client.calls.find((call) => call.type === "signInWithPassword");
  assert.deepEqual(signInCall?.payload, { email: "real-auth@example.test", password: "password" });
}

{
  const client = createMockClient({
    profile: activeProfile,
    lookupRows: [
      {
        authEmail: "display-auth@example.test",
        displayName: "Оператор",
        isActive: true,
      },
    ],
  });

  assert.equal(await resolveStaticAuthEmail(client as never, "Оператор"), "display-auth@example.test");
}

{
  const client = createMockClient({
    profile: activeProfile,
    rpcData: "real-auth@example.test",
    signInError: new Error("Invalid login credentials"),
  });

  await assert.rejects(
    () => signInStaticAccessUser(client as never, "operator", "wrong-password"),
    new RegExp(staticLoginErrorMessage),
  );
  assert.equal(client.calls.filter((call) => call.type === "signOut").length, 2);
}

{
  const client = createMockClient({
    profile: activeProfile,
    rpcData: "real-auth@example.test",
  });

  await signInStaticAccessUser(client as never, "operator", "password");
  const accessUserSelects = client.calls.filter(
    (call) => call.type === "select" && String((call.payload as { table?: string }).table) === "AccessUser",
  );
  assert.ok(accessUserSelects.length > 0);
  assert.ok(
    accessUserSelects.every((call) => !String((call.payload as { columns?: string }).columns).includes("password")),
    "static auth must not request AccessUser.password",
  );
}

assert.equal(isStaticSupabaseApiRequest("/api/auth/me"), true);
assert.equal(isStaticSupabaseApiRequest("/api/stalkers"), true);
assert.equal(isStaticSupabaseApiRequest("https://oolkegedhnzilwhbemyu.supabase.co/auth/v1/token"), false);

const loginPageSource = readFileSync("src/app/login/page.tsx", "utf8");
assert.equal(loginPageSource.includes("createTechnicalAuthEmail"), false);
assert.equal(loginPageSource.includes("@duty.local"), false);

console.log("Static auth checks passed.");
