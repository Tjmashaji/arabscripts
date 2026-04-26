import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part1 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ARAB-${part1}-${part2}`;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "الرجاء تسجيل الدخول أولاً لإتمام الشراء" }, { status: 401 });
    }

    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json({ error: "Product ID is missing" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return NextResponse.json({ error: "المنتج غير موجود" }, { status: 404 });
    }

    // Create Order
    const order = await prisma.order.create({
      data: {
        userId: session.user.id,
        totalAmount: product.price,
        status: "PAID", // Auto paid for local testing
        items: {
          create: {
            productId: product.id,
            price: product.price,
            quantity: 1
          }
        }
      }
    });

    // Create License
    const licenseKey = generateLicenseKey();
    const license = await prisma.license.create({
      data: {
        key: licenseKey,
        productId: product.id,
        userId: session.user.id,
        status: "ACTIVE",
        maxUses: 1,
      }
    });

    return NextResponse.json({ success: true, order, license });

  } catch (error) {
    console.error("Checkout Error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء إنهاء الطلب" }, { status: 500 });
  }
}
