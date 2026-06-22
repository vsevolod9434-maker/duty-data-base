const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";

export const publicBasePath =
  configuredBasePath && configuredBasePath !== "/"
    ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`
    : "";

export function withBasePath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return path;
  }

  if (publicBasePath && (path === publicBasePath || path.startsWith(`${publicBasePath}/`))) {
    return path;
  }

  return `${publicBasePath}${path}`;
}

export function stripBasePath(path: string) {
  if (!publicBasePath) {
    return path;
  }

  return path === publicBasePath ? "/" : path.replace(new RegExp(`^${publicBasePath}(?=/|$)`), "") || "/";
}
