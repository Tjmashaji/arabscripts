import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

export async function POST(req: Request, props: { params: Promise<{ orderId: string }> }) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = params;
    const formData = await req.formData();
    
    const paymentReference = formData.get("paymentReference")?.toString();
    const paymentNote = formData.get("paymentNote")?.toString();
    const proofImage = formData.get("proofImage") as File | null;

    if (!paymentReference || !paymentNote) {
       return NextResponse.json({ error: "الرجاء تعبئة جميع الحقول المطلوبة بدقة" }, { status: 400 });
    }

    // Checking Ownership
    const order = await prisma.order.findUnique({ where: { id: orderId, userId: session.user.id } });
    
    if (!order) {
       return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    
    if (order.status !== "PENDING_PAYMENT") {
       return NextResponse.json({ error: "لا يمكن تعديل هذا الطلب بعد الآن" }, { status: 400 });
    }

    let paymentProofUrl = null;

    // Upload to Supabase if exists
    if (proofImage && proofImage.size > 0) {
      if (!proofImage.type.startsWith("image/")) {
         return NextResponse.json({ error: "الملف يجب أن يكون صورة" }, { status: 400 });
      }

      const imageBytes = await proofImage.arrayBuffer();
      const imageFileName = `proofs/${Date.now()}-${uuidv4().slice(0,8)}-proof`;
      
      const { data, error } = await supabase.storage
        .from("products-images") // public bucket
        .upload(imageFileName, imageBytes, { contentType: proofImage.type, upsert: false });

      if (error) {
         console.error("Proof Upload Error:", error);
         return NextResponse.json({ error: "فشل رفع الصورة إلى الخادم" }, { status: 500 });
      }

      const { data: publicUrlData } = supabase.storage.from("products-images").getPublicUrl(imageFileName);
      paymentProofUrl = publicUrlData.publicUrl;
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "PENDING_REVIEW",
        paymentReference,
        paymentNote,
        paymentProofUrl: paymentProofUrl || undefined,
      }
    });

    return NextResponse.json({ success: true, updatedOrder });

  } catch (error) {
    console.error("Submit Payment Proof Error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
