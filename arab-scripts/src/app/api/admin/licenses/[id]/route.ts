import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
     const params = await props.params;
     const session = await getServerSession(authOptions);
     if (!session || session.user.role !== 'ADMIN') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

     const { status } = await req.json();

     if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(status)) {
       return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 });
     }

     const updatedLicense = await prisma.license.update({
       where: { id: params.id },
       data: { status }
     });

     return NextResponse.json({ success: true, license: updatedLicense });
  } catch (error) {
     return NextResponse.json({ error: "خطأ أثناء تعديل الترخيص" }, { status: 500 });
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
     const params = await props.params;
     const session = await getServerSession(authOptions);
     if (!session || session.user.role !== 'ADMIN') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

     await prisma.license.delete({
       where: { id: params.id }
     });

     return NextResponse.json({ success: true });
  } catch (error) {
     return NextResponse.json({ error: "خطأ أثناء الحذف" }, { status: 500 });
  }
}
