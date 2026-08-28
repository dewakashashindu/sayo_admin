import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database...');

  // Data එකිනෙකට සම්බන්ධ (Relations) නිසා Delete කරන පිළිවෙළ වැදගත්
  await prisma.tbl_ItemMaster.deleteMany();
  await prisma.tbl_SupplierMaster.deleteMany();
  await prisma.tbl_ItemCategory1.deleteMany();
  await prisma.tbl_ItemCategory2.deleteMany();
  await prisma.tbl_ItemCategory3.deleteMany();
  await prisma.tbl_ItemCategory4.deleteMany();
  await prisma.tbl_UnitConversion.deleteMany();
  await prisma.tbl_UnitSub.deleteMany();
  await prisma.tbl_UnitMaster.deleteMany();
  await prisma.tbl_LocationMaster.deleteMany();

  console.log('All mock data cleared successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });