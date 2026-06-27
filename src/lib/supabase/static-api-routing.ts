export function isStaticSupabaseApiRequest(input: RequestInfo | URL) {
  const value = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return value.startsWith("/api/");
}
