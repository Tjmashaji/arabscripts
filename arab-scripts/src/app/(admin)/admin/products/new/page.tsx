import { PrismaClient } from "@prisma/client";
import { ProductForm } from "./ProductForm";

const prisma = new PrismaClient();

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-20">
      <h1 className="text-4xl font-bold mb-8">إضافة منتج جديد</h1>
      <div className="glass-card p-8 rounded-2xl">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
