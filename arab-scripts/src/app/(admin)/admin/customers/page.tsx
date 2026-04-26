import { PrismaClient } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const prisma = new PrismaClient();

export default async function AdminCustomersPage() {
  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { orders: true, licenses: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20">
      <div className="flex justify-between items-center mb-10">
         <h1 className="text-4xl font-bold">إدارة العملاء والمستخدمين</h1>
      </div>

      <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-primary/20 text-primary">
              <tr>
                <th className="p-4">الاسم</th>
                <th className="p-4">البريد الإلكتروني</th>
                <th className="p-4">الصلاحية</th>
                <th className="p-4 text-center">الطلبات</th>
                <th className="p-4 text-center">التراخيص النشطة</th>
                <th className="p-4">تاريخ التسجيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">لا يوجد مستخدمين</td>
                </tr>
              )}
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-primary/5 transition-colors">
                  <td className="p-4 font-bold">{user.name}</td>
                  <td className="p-4 text-muted-foreground">{user.email}</td>
                  <td className="p-4">
                    <Badge variant={user.role === 'ADMIN' ? 'destructive' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </td>
                  <td className="p-4 text-center font-bold text-lg">{user._count.orders}</td>
                  <td className="p-4 text-center font-bold text-lg text-primary">{user._count.licenses}</td>
                  <td className="p-4 text-xs font-mono">{new Date(user.createdAt).toLocaleDateString('ar-SA')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
