import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const publicPathPrefixes = ["/api", "/_next", "/auth/callback"];
const publicFilePattern = /\.(?:ico|png|jpg|jpeg|gif|svg|webp|css|js|map|txt|xml)$/i;

function isPublicPath(pathname: string) {
  return pathname === "/login" || publicPathPrefixes.some((prefix) => pathname.startsWith(prefix)) || publicFilePattern.test(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPathPrefixes.some((prefix) => pathname.startsWith(prefix)) || publicFilePattern.test(pathname)) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  if (!user && pathname !== "/login") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  if (isPublicPath(pathname)) {
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
