import { PrismaClient } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { LicensesTableClient } from "./LicensesTableClient";

const prisma = new PrismaClient();

export default async function AdminLicensesPage() {
  const licenses = await prisma.license.findMany({
    include: { product: true, user: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20">
      <div className="flex justify-between items-center mb-10">
         <h1 className="text-4xl font-bold">إدارة التراخيص</h1>
      </div>

      <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
        <LicensesTableClient initialLicenses={licenses} />
      </div>
    </div>
  );
}
