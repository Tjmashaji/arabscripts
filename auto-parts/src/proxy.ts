import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

// 1) next-intl يحدد اللغة ويعيد التوجيه عند الحاجة. 2) Supabase يجدد جلسة الدخول ويكتب الكوكيز في نفس الاستجابة.
// لا قرارات صلاحيات هنا: كل صفحة محمية تتحقق في الخادم، وقاعدة البيانات تتحقق مرة أخرى عبر RLS.
export async function proxy(request: NextRequest) {
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth/");
  const response = isAuthRoute ? NextResponse.next() : intl(request);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
