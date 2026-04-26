import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const prisma = new PrismaClient();

export async function GET(req: Request, props: { params: Promise<{ fileId: string }> }) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = params;

    const file = await prisma.productFile.findUnique({
      where: { id: fileId },
      include: { product: true }
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Security Authorization: Does this user own a license for this product? OR are they an admin?
    const isAdmin = session.user.role === 'ADMIN';
    const hasLicense = await prisma.license.findFirst({
       where: { productId: file.productId, userId: session.user.id, status: "ACTIVE" }
    });

    if (!isAdmin && !hasLicense) {
       return NextResponse.json({ error: "Forbidden: You don't own an active license for this product" }, { status: 403 });
    }

    // Generate Supabase Signed URL (Valid for 60 seconds)
    // The fileUrl in the DB is just the filename in the 'products-files' bucket.
    const { data: signedUrlData, error } = await supabase.storage
       .from('products-files')
       .createSignedUrl(file.fileUrl, 60, {
          download: true, // Forces download on the browser
       });

    if (error || !signedUrlData) {
       console.error("Supabase Signed URL Error:", error);
       return NextResponse.json({ error: "Could not generate secure download link" }, { status: 500 });
    }

    // Redirect the user directly to the signed URL so the download starts
    return NextResponse.redirect(signedUrlData.signedUrl);

  } catch (error) {
    console.error("Download API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
