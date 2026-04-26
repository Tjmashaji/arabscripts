import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part1 = Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({length: 5}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ARAB-${part1}-${part2}`;
}

export async function PATCH(req: Request, props: { params: Promise<{ orderId: string }> }) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = params;

    const order = await prisma.order.findUnique({
       where: { id: orderId },
       include: { items: true }
    });

    if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    if (order.status === "PAID") return NextResponse.json({ error: "الطلب مدفوع مسبقاً" }, { status: 400 });

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
         status: "PAID",
         paidAt: new Date(),
         reviewedAt: new Date(),
         reviewedById: session.user.id
      }
    });

    // Generate Licenses for each item in the order
    for (const item of order.items) {
       // Check if license already exists to avoid duplicates
       const existingLicense = await prisma.license.findFirst({
          where: { productId: item.productId, userId: order.userId }
       });

       if (!existingLicense) {
          await prisma.license.create({
             data: {
                key: generateLicenseKey(),
                productId: item.productId,
                userId: order.userId,
                status: "ACTIVE",
                maxUses: 1
             }
          });
       }
    }

    return NextResponse.json({ success: true, updatedOrder });
  } catch (error) {
    console.error("Approve Order Error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
