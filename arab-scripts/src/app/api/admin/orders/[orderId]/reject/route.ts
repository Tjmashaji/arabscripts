import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

export async function PATCH(req: Request, props: { params: Promise<{ orderId: string }> }) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = params;

    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
         status: "REJECTED",
         reviewedAt: new Date(),
         reviewedById: session.user.id,
         rejectedReason: "الدفع غير صحيح أو بيانات التحويل خاطئة"
      }
    });

    return NextResponse.json({ success: true, updatedOrder });
  } catch (error) {
    console.error("Reject Order Error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
