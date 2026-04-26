import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const isAuthPage = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
    const isAdminPage = req.nextUrl.pathname.startsWith("/admin");
    const isApiAdmin = req.nextUrl.pathname.startsWith("/api/admin");

    if (isAuthPage) {
      if (isAuth) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      return null;
    }

    if (!isAuth) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if ((isAdminPage || isApiAdmin) && token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return null;
  },
  {
    callbacks: {
      // Return true to allow middleware to run on every match
      authorized: () => true,
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register", "/api/admin/:path*"]
};
