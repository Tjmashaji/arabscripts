import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { licenseKey, productId, productSlug, serverId, resourceName } = body;

    // We can use either productId or productSlug to identify the product
    if (!licenseKey || (!productId && !productSlug)) {
      return NextResponse.json({ valid: false, message: "Missing required parameters" }, { status: 400 });
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("remote-addr") || "unknown";

    // 1. Find the license
    const license = await prisma.license.findUnique({
      where: { key: licenseKey },
      include: { product: true }
    });

    if (!license) {
      return NextResponse.json({ valid: false, message: "Invalid or inactive license" }, { status: 404 });
    }

    // 2. Check if product matches
    const productMatches = (productId && license.productId === productId) || 
                           (productSlug && license.product.slug === productSlug);

    if (!productMatches) {
      return NextResponse.json({ valid: false, message: "License does not match the product" }, { status: 403 });
    }

    // 3. Check status
    if (license.status !== "ACTIVE") {
      return NextResponse.json({ valid: false, message: `License is ${license.status}` }, { status: 403 });
    }

    // 4. Update tracking metrics (Activations / IP / Server / LastCheck)
    // For a real system you'd lock it to an IP/ServerId after first use, but for now we just record it 
    // and bump the activation if it's a new server or IP.
    
    const isNewActivation = !license.activatedServerId;
    if (isNewActivation) {
      if (license.currentUses >= license.maxUses) {
         return NextResponse.json({ valid: false, message: "Maximum activation limit reached" }, { status: 403 });
      }
    }

    const updateData: any = {
      lastCheckAt: new Date(),
      ipAddress: ipAddress !== "unknown" ? ipAddress : license.ipAddress,
    };

    if (serverId) updateData.activatedServerId = serverId;
    if (resourceName) updateData.resourceName = resourceName;
    if (isNewActivation) updateData.currentUses = { increment: 1 };

    await prisma.license.update({
      where: { id: license.id },
      data: updateData
    });

    return NextResponse.json({
      valid: true,
      status: license.status,
      product: license.product.name,
      message: "License verified successfully"
    });

  } catch (error) {
    console.error("[LICENSE_VERIFY_ERROR]", error);
    return NextResponse.json({ valid: false, message: "Internal server error" }, { status: 500 });
  }
}
