import { NextResponse } from "next/server";
import { ZodError } from "zod";

// أخطاء موجهة للمستخدم برسالة عربية واضحة ورمز ثابت يمكن للواجهة الاعتماد عليه
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const errors = {
  unauthorized: () => new AppError(401, "unauthorized", "يجب تسجيل الدخول أولًا."),
  forbidden: () => new AppError(403, "forbidden", "ليست لديك صلاحية لهذا الإجراء."),
  notFound: (what = "العنصر") => new AppError(404, "not_found", `${what} غير موجود أو لا تملك صلاحية الوصول إليه.`),
  conflict: (msg: string) => new AppError(409, "conflict", msg),
  rateLimited: () => new AppError(429, "rate_limited", "طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مجددًا."),
  invalid: (msg: string, details?: unknown) => new AppError(422, "invalid", msg, details),
  unavailable: (msg: string) => new AppError(503, "service_unavailable", msg),
};

export function toResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const details = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json({ error: { code: "invalid", message: "بعض الحقول غير صحيحة.", details } }, { status: 422 });
  }
  const sqlite = e as { code?: string; message?: string };
  if (sqlite?.code === "ERR_SQLITE_ERROR" && /UNIQUE constraint/.test(sqlite.message ?? "")) {
    return NextResponse.json({ error: { code: "conflict", message: "هذا العنصر موجود مسبقًا." } }, { status: 409 });
  }
  console.error("[api] unexpected error", e);
  return NextResponse.json({ error: { code: "internal", message: "حدث خطأ غير متوقع. حاول مرة أخرى، وإن تكرر تواصل مع الدعم." } }, { status: 500 });
}
