import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log(`[SEED] Starting final MVP seed...`);

  const MOCK_PASSWORD = await bcrypt.hash('12345678', 10);

  // 1. Setup Admin Account
  const admin = await prisma.user.upsert({
    where: { email: 'admin@arabscripts.com' },
    update: { password: MOCK_PASSWORD, role: 'ADMIN' },
    create: {
      email: 'admin@arabscripts.com',
      name: 'مدير المنصة',
      password: MOCK_PASSWORD,
      role: 'ADMIN',
    },
  });
  console.log(`[SEED] Admin account ready: ${admin.email}`);

  // 2. Setup Test User Account
  const user = await prisma.user.upsert({
    where: { email: 'user@arabscripts.com' },
    update: { password: MOCK_PASSWORD, role: 'USER' },
    create: {
      email: 'user@arabscripts.com',
      name: 'عميل تجريبي',
      password: MOCK_PASSWORD,
      role: 'USER',
    },
  });
  console.log(`[SEED] Test user ready: ${user.email}`);

  // 3. Setup Core Categories
  const catPolice = await prisma.category.upsert({
    where: { slug: 'police-ems-systems' },
    update: {},
    create: {
      name: 'أنظمة الشرطة والإسعاف',
      slug: 'police-ems-systems',
      description: 'سكربتات متقدمة للقطاعات الحكومية في الرول بلاي',
    },
  });

  const catUI = await prisma.category.upsert({
    where: { slug: 'user-interfaces' },
    update: {},
    create: {
      name: 'واجهات مستخدم احترافية',
      slug: 'user-interfaces',
      description: 'تصاميم قوائم و HUD للمتعة البصرية',
    },
  });

  console.log(`[SEED] Categories ready.`);

  // 4. Setup 2 Demo Products
  const productMDT = await prisma.product.upsert({
    where: { slug: 'arab-mdt-pro' },
    update: {},
    create: {
      name: 'MDT العربي PRO',
      slug: 'arab-mdt-pro',
      shortDesc: 'أقوى نظام MDT عربي للفايف إم مع تكامل كامل للبصماتوسجل السوابق.',
      longDesc: 'نظام MDT (Mobile Data Terminal) مُصمم خصيصاً ليناسب احتياجات خوادم الرول بلاي العربية (ESX & QBCore).\n\nالمميزات الأساسية:\n- واجهة فخمة بتصميم Dark Mode و Glassmorphism.\n- نظام تقارير متقدم.\n- تكامل مع نظام البصمات.',
      price: 150.00,
      compareAtPrice: 200.00,
      type: 'SCRIPT',
      compatibility: 'ESX',
      version: 'v1.5.0',
      features: 'تصميم UI عصري وخفيف 0.0ms\nنظام مذكرات الاعتقال\nواجهة باللغة العربية',
      categoryId: catPolice.id,
      isFeatured: true,
      status: 'PUBLISHED',
      images: {
         create: [{ url: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?q=80&w=1200&auto=format&fit=crop', isPrimary: true }]
      }
    },
  });

  const productHUD = await prisma.product.upsert({
    where: { slug: 'gulf-hud-premium' },
    update: {},
    create: {
      name: 'Gulf HUD Premium',
      slug: 'gulf-hud-premium',
      shortDesc: 'سكربت احتياجات اللاعب وواجهة العرض بتصميم خليجي فخم جداً.',
      longDesc: 'واجهة مخصصة (HUD) مصممة بعناية لتعطي طابعاً خليجياً هادئاً، مستوحاة من الألعاب الحديثة وتأتي مع مؤثرات صوتية وتنبيهات حية.\n\nالمميزات:\n- لوحة تحكم كاملة للاعب /hud\n- عداد سيارة مصمم خصيصاً.\n- البوصلة مع أسماء الشوارع الحقيقية.',
      price: 85.00,
      type: 'UI',
      compatibility: 'STANDALONE',
      version: 'v2.1.0',
      features: 'دعم جميع الشاشات\nعداد سيارة احترافي\nنظام الجوع والعطش',
      categoryId: catUI.id,
      isFeatured: true,
      status: 'PUBLISHED',
      images: {
         create: [{ url: 'https://images.unsplash.com/photo-1563820612140-5bb9280d9ce0?q=80&w=1200&auto=format&fit=crop', isPrimary: true }]
      }
    },
  });

  console.log(`[SEED] Products seeded: ${productMDT.name}, ${productHUD.name}`);
  console.log(`[SEED] Final seeding finished successfully!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
