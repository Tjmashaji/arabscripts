import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
     const params = await props.params;
     const session = await getServerSession(authOptions);
     if (!session || session.user.role !== 'ADMIN') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

     await prisma.product.delete({
       where: { id: params.id }
     });

     return NextResponse.json({ success: true });
  } catch (error) {
     return NextResponse.json({ error: "خطأ أثناء الحذف" }, { status: 500 });
  }
}
