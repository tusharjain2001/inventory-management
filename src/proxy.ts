import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "sr_session";
const PUBLIC_PAGES = ["/login", "/forgot-password", "/reset-password"];

// Optimistic check only (cookie present?). The real session validation happens in
// the (app) layout and in every API handler.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PAGES.some((p) => pathname === p)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
