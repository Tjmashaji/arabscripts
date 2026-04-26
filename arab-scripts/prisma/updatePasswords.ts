import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("12345678", 10);
  await prisma.user.updateMany({
    data: { password: hash }
  });
  console.log("Passwords updated to 12345678");
}

main().catch(console.error).finally(() => prisma.$disconnect());
