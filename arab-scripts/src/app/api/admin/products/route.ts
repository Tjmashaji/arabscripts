import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json({ error: "فشل في جلب المنتجات" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 401 });
    }

    const formData = await req.formData();

    // Parse text fields
    const name = formData.get("name")?.toString();
    const slug = formData.get("slug")?.toString() || uuidv4().slice(0,8);
    const shortDesc = formData.get("shortDesc")?.toString();
    const longDesc = formData.get("longDesc")?.toString();
    const priceStr = formData.get("price")?.toString();
    const comparePriceStr = formData.get("compareAtPrice")?.toString();
    const categoryId = formData.get("categoryId")?.toString();
    const type = formData.get("type")?.toString() || 'SCRIPT';
    const compatibility = formData.get("compatibility")?.toString();
    const version = formData.get("version")?.toString();
    const status = formData.get("status")?.toString() || 'PUBLISHED';
    const isFeatured = formData.get("isFeatured") === 'true';

    if (!name || !shortDesc || !longDesc || !priceStr || !categoryId) {
      return NextResponse.json({ error: "يرجى تعبئة جميع الحقول الأساسية" }, { status: 400 });
    }

    // Process Files
    const imageFile = formData.get("image") as File | null;
    const zipFile = formData.get("file") as File | null;

    if (!imageFile || !zipFile) {
       return NextResponse.json({ error: "يرجى رفع صورة المنتج وملف الـ ZIP" }, { status: 400 });
    }

    // Security constraints
    if (!imageFile.type.startsWith("image/")) {
      return NextResponse.json({ error: "الملف المرفوع ليس صورة صالحة" }, { status: 400 });
    }
    if (!zipFile.name.endsWith(".zip") && !zipFile.name.endsWith(".rar")) {
      return NextResponse.json({ error: "الملف يجب أن يكون بصيغة ZIP أو RAR" }, { status: 400 });
    }

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100MB (Note: Vercel standard body limit is 4.5MB unless configured)

    if (imageFile.size > MAX_IMAGE_SIZE) return NextResponse.json({ error: "حجم الصورة يتجاوز 5MB" }, { status: 400 });
    if (zipFile.size > MAX_ZIP_SIZE) return NextResponse.json({ error: "حجم الملف يتجاوز 100MB" }, { status: 400 });

    // Upload Image to Supabase (Public)
    const imageBytes = await imageFile.arrayBuffer();
    const imageFileName = `${Date.now()}-${uuidv4().slice(0,8)}-${imageFile.name}`;
    
    const { data: imageData, error: imageError } = await supabase.storage
      .from("products-images")
      .upload(imageFileName, imageBytes, { contentType: imageFile.type, upsert: false });

    if (imageError) {
      console.error("Supabase Image Upload Error:", imageError);
      return NextResponse.json({ error: "فشل رفع الصورة السحابي: تأكد من إعدادات Supabase Storage" }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from("products-images").getPublicUrl(imageFileName);
    const imageUrl = publicUrlData.publicUrl;

    // Upload Zip to Supabase (Private)
    const zipBytes = await zipFile.arrayBuffer();
    const zipFileName = `${Date.now()}-${uuidv4().slice(0,8)}-${zipFile.name}`;

    const { data: zipData, error: zipError } = await supabase.storage
      .from("products-files")
      .upload(zipFileName, zipBytes, { contentType: zipFile.type || "application/zip", upsert: false });

    if (zipError) {
      console.error("Supabase File Upload Error:", zipError);
      return NextResponse.json({ error: "فشل رفع ملف السكربت السحابي: تأكد من إعدادات Storage" }, { status: 500 });
    }

    // We store only the file path for the ZIP, not the full URL, to generate signed URLs later
    const fileUrl = zipFileName;

    // Create DB entry
    const product = await prisma.product.create({
      data: {
        name,
        slug,
        shortDesc,
        longDesc,
        price: parseFloat(priceStr),
        compareAtPrice: comparePriceStr ? parseFloat(comparePriceStr) : null,
        type,
        compatibility,
        version,
        status,
        isFeatured,
        categoryId,
        images: {
          create: [{ url: imageUrl, isPrimary: true }]
        },
        files: {
          create: [{ fileName: zipFile.name, fileUrl, version }]
        }
      }
    });

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error("Add Product Error:", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع أثناء الحفظ" }, { status: 500 });
  }
}
