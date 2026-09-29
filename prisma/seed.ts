// prisma/seed.ts
//
// 2026-09-29 fix (AUTH_SECURITY_REVIEW.md #12)
//   The five demo users used to be created with their passwords in CLEAR TEXT
//   (`PSW: 'admin123'` …). Two things were wrong with that:
//     • the sign-in route compares with bcrypt, so those accounts could never
//       actually log in — the hash check failed and the screen just said
//       "invalid username or password";
//     • the password was readable by anybody who could open the table.
//   Now every password is bcrypt-hashed, and NO password is hard-coded: set
//   SEED_PASSWORD_ADMIN / _MANAGER / _TECH1 / _RECEPTION / _TECH2, otherwise a
//   random one is generated and printed once at the end of the seed.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { passwordProblem } from '../src/lib/passwordPolicy';

const prisma = new PrismaClient();

/** 8 letters + 8 digits, shuffled — always satisfies the app password rule. */
function randomPassword(): string {
  const letters = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += letters[crypto.randomInt(0, letters.length)];
  for (let i = 0; i < 8; i++) out += digits[crypto.randomInt(0, digits.length)];
  const chars = out.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const generatedPasswords: Array<{ login: string; password: string }> = [];

/** Password for a seeded account: from the environment, else newly generated. */
function seedPassword(envKey: string, login: string): string {
  const fromEnv = (process.env[envKey] || '').trim();
  if (fromEnv) {
    const problem = passwordProblem(fromEnv);
    if (problem) throw new Error(`${envKey} does not satisfy the password rule: ${problem}`);
    return fromEnv;
  }
  const generated = randomPassword();
  const problem = passwordProblem(generated);   // never ship a password that would be refused
  if (problem) throw new Error(`generated password rejected: ${problem}`);
  generatedPasswords.push({ login, password: generated });
  return generated;
}

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

const padId = (prefix: string, num: number, len: number = 10) => {
  const strNum = num.toString().padStart(len - prefix.length, '0');
  return `${prefix}${strNum}`;
};

async function main() {
  console.log('🌱 Starting Database Seeding...');

  // 1. Locations (5 Locations)
  const locations = [
    { LocCode: 'LOC0000001', LocDes: 'COLOMBO MAIN BRANCH', Address: 'No 123, Galle Road, Colombo 03', Enable: true },
    { LocCode: 'LOC0000002', LocDes: 'KANDY BRANCH', Address: 'No 45, Peradeniya Road, Kandy', Enable: true },
    { LocCode: 'LOC0000003', LocDes: 'KURUNEGALA BRANCH', Address: 'No 78, Negombo Road, Kurunegala', Enable: true },
    { LocCode: 'LOC0000004', LocDes: 'GALLE BRANCH', Address: 'No 12, Main Street, Galle', Enable: true },
    { LocCode: 'LOC0000005', LocDes: 'JAFFNA BRANCH', Address: 'No 99, Hospital Road, Jaffna', Enable: true },
  ];
  await prisma.tbl_LocationMaster.createMany({ data: locations, skipDuplicates: true });

  // 2. Master Units & Sub Units
  const masterUnits = [
    { MasterUnitID: 'UNIT000001', UnitDes: 'NOS', Enable: true },
    { MasterUnitID: 'UNIT000002', UnitDes: 'PCS', Enable: true },
    { MasterUnitID: 'UNIT000003', UnitDes: 'KG', Enable: true },
    { MasterUnitID: 'UNIT000004', UnitDes: 'BOTTLE', Enable: true },
    { MasterUnitID: 'UNIT000005', UnitDes: 'PACKET', Enable: true },
  ];
  await prisma.tbl_UnitMaster.createMany({ data: masterUnits, skipDuplicates: true });

  // 3. Item Categories
  const categories = [
    { CatCode: 'CAT0000001', CatDes: 'Hair Care & Styling', Enable: true },
    { CatCode: 'CAT0000002', CatDes: 'Skin Treatments', Enable: true },
    { CatCode: 'CAT0000003', CatDes: 'Facial & Cleanup', Enable: true },
    { CatCode: 'CAT0000004', CatDes: 'Nail Art & Spa', Enable: true },
    { CatCode: 'CAT0000005', CatDes: 'Makeup Products', Enable: true },
  ];
  await prisma.tbl_ItemCategory1.createMany({ data: categories, skipDuplicates: true });

  // 4. Suppliers
  const suppliers = [
    { SupID: 'SUP0000001', SupName: 'Loreal Cosmetics Lanka', SuppAdd1: 'Colombo 07', ContactNO: '0112345678', Emails: 'info@loreal.lk', Web: 'www.loreal.lk', DebtAmount: 0 },
    { SupID: 'SUP0000002', SupName: 'Keune Hair Beauty', SuppAdd1: 'Nugegoda', ContactNO: '0112889900', Emails: 'sales@keune.lk', Web: 'www.keune.lk', DebtAmount: 15000 },
    { SupID: 'SUP0000003', SupName: 'Janet Ayurveda Products', SuppAdd1: 'Rajagiriya', ContactNO: '0112776655', Emails: 'support@janet.lk', Web: 'www.janet.lk', DebtAmount: 0 },
    { SupID: 'SUP0000004', SupName: 'Dreamron Lanka PLC', SuppAdd1: 'Maharagama', ContactNO: '0112850850', Emails: 'contact@dreamron.lk', Web: 'www.dreamron.lk', DebtAmount: 5000 },
    { SupID: 'SUP0000005', SupName: 'Nature Secret Lanka', SuppAdd1: 'Horana', ContactNO: '0342261000', Emails: 'info@naturesecret.lk', Web: 'www.naturesecret.lk', DebtAmount: 0 },
  ];
  await prisma.tbl_SupplierMaster.createMany({ data: suppliers, skipDuplicates: true });

  // 5. User Groups
  const userGroups = [
    { GroupId: 'GRP0000001', GroupDes: 'Administrator' },
    { GroupId: 'GRP0000002', GroupDes: 'Manager' },
    { GroupId: 'GRP0000003', GroupDes: 'Receptionist' },
    { GroupId: 'GRP0000004', GroupDes: 'Technician' },
    { GroupId: 'GRP0000005', GroupDes: 'Cashier' },
  ];
  await prisma.tbl_usergroups.createMany({ data: userGroups, skipDuplicates: true });

  // 6. Booking Types
  const bookingTypes = [
    { BooikingTypeID: 'BKT0000001', BookingTypeDes: 'Walk-In', Enabel: true },
    { BooikingTypeID: 'BKT0000002', BookingTypeDes: 'Online Booking', Enabel: true },
    { BooikingTypeID: 'BKT0000003', BookingTypeDes: 'Phone Booking', Enabel: true },
    { BooikingTypeID: 'BKT0000004', BookingTypeDes: 'WhatsApp Booking', Enabel: true },
    { BooikingTypeID: 'BKT0000005', BookingTypeDes: 'VIP Appointment', Enabel: true },
  ];
  await prisma.tbl_bookingtypes.createMany({ data: bookingTypes, skipDuplicates: true });

  // 7. Technician Specialities
  const specialities = [
    { SpecAreaID: 'SPC0000001', Specilities: 'Hair Coloring' },
    { SpecAreaID: 'SPC0000002', Specilities: 'Hair Cutting & Styling' },
    { SpecAreaID: 'SPC0000003', Specilities: 'Facial Treatment' },
    { SpecAreaID: 'SPC0000004', Specilities: 'Nail Art' },
    { SpecAreaID: 'SPC0000005', Specilities: 'Skin Care & Makeup' },
  ];
  await prisma.tbl_technicianspecilities.createMany({ data: specialities, skipDuplicates: true });

  // 8. Users — the passwords are hashed, never stored as typed
  const users = [
    {
      UserId: 'USR0000001', NIC: '901234567V', LogName: 'admin',
      PSW: await hashPassword(seedPassword('SEED_PASSWORD_ADMIN', 'admin')),
      GroupId: 'GRP0000001', UserName: 'Kamal Perera',
      Address: 'No 12, Temple Road, Colombo 05', WorkingLocID: 'LOC0000001',
      ContNo: '0771234567', Email: 'kamal@sayo.lk',
      DOB: new Date('1990-03-15'), DOJ: new Date('2020-01-01'), DOL: new Date('1900-01-01'),
      CreateUser: 'ADMIN00001', Picture: null, Rmks: 'Main admin user', Enable: true,
    },
    {
      UserId: 'USR0000002', NIC: '856789012V', LogName: 'manager01',
      PSW: await hashPassword(seedPassword('SEED_PASSWORD_MANAGER', 'manager01')),
      GroupId: 'GRP0000002', UserName: 'Nadeeka Silva',
      Address: 'No 45, Lake Drive, Kandy', WorkingLocID: 'LOC0000002',
      ContNo: '0777654321', Email: 'nadeeka@sayo.lk',
      DOB: new Date('1985-07-22'), DOJ: new Date('2020-03-15'), DOL: new Date('1900-01-01'),
      CreateUser: 'ADMIN00001', Picture: null, Rmks: 'Kandy branch manager', Enable: true,
    },
    {
      UserId: 'USR0000003', NIC: '952345678V', LogName: 'tech.amali',
      PSW: await hashPassword(seedPassword('SEED_PASSWORD_TECH1', 'tech.amali')),
      GroupId: 'GRP0000004', UserName: 'Amali Fernando',
      Address: 'No 78, Main Street, Galle', WorkingLocID: 'LOC0000004',
      ContNo: '0712345678', Email: 'amali@sayo.lk',
      DOB: new Date('1995-11-10'), DOJ: new Date('2021-06-01'), DOL: new Date('1900-01-01'),
      CreateUser: 'ADMIN00001', Picture: null, Rmks: 'Senior hair technician', Enable: true,
    },
    {
      UserId: 'USR0000004', NIC: '881234567V', LogName: 'recep.saman',
      PSW: await hashPassword(seedPassword('SEED_PASSWORD_RECEPTION', 'recep.saman')),
      GroupId: 'GRP0000003', UserName: 'Saman Kumara',
      Address: 'No 33, Peradeniya Road, Kandy', WorkingLocID: 'LOC0000002',
      ContNo: '0769876543', Email: 'saman@sayo.lk',
      DOB: new Date('1988-04-05'), DOJ: new Date('2022-01-10'), DOL: new Date('1900-01-01'),
      CreateUser: 'ADMIN00001', Picture: null, Rmks: 'Front desk receptionist', Enable: true,
    },
    {
      UserId: 'USR0000005', NIC: '972233445V', LogName: 'tech.dilani',
      PSW: await hashPassword(seedPassword('SEED_PASSWORD_TECH2', 'tech.dilani')),
      GroupId: 'GRP0000004', UserName: 'Dilani Rathnayake',
      Address: 'No 55, Hospital Road, Jaffna', WorkingLocID: 'LOC0000005',
      ContNo: '0751122334', Email: 'dilani@sayo.lk',
      DOB: new Date('1997-09-18'), DOJ: new Date('2021-09-01'), DOL: new Date('1900-01-01'),
      CreateUser: 'ADMIN00001', Picture: null, Rmks: 'Nail & skin specialist', Enable: true,
    },
  ];

  /* An existing row keeps its password: the seed never overwrites a password
     somebody has already changed (the upsert below leaves it alone). */
  for (const user of users) {
    await prisma.tbl_userdetails.upsert({
      where: { UserId: user.UserId },
      update: {},
      create: user,
    });
  }

  // 9. Technician Speciality Assignments
  const assignments = [
    { UserID: 'USR0000003', SpecAreaID: 'SPC0000001' },
    { UserID: 'USR0000003', SpecAreaID: 'SPC0000002' },
    { UserID: 'USR0000005', SpecAreaID: 'SPC0000004' },
    { UserID: 'USR0000005', SpecAreaID: 'SPC0000005' },
  ];
  await prisma.tbl_technicianspecilityassignment.createMany({ data: assignments, skipDuplicates: true });

  // 10. Items (50 records)
  const baseItems = [
    { name: 'Hair Color Dark Brown 60ml', cost: 1200, price: 1800, catIdx: 0 },
    { name: 'Keratin Shampoo 250ml', cost: 2500, price: 3400, catIdx: 0 },
    { name: 'Hair Conditioning Cream 500g', cost: 1800, price: 2600, catIdx: 0 },
    { name: 'Hair Serum Smoothing 100ml', cost: 1500, price: 2200, catIdx: 0 },
    { name: 'Hair Bleaching Powder 400g', cost: 3200, price: 4500, catIdx: 0 },
    { name: 'Vitamin C Facial Serum', cost: 2800, price: 3900, catIdx: 1 },
    { name: 'Aloe Vera Hydrating Gel', cost: 850, price: 1300, catIdx: 1 },
    { name: 'Gold Facial Kit 5-in-1', cost: 4500, price: 6500, catIdx: 2 },
    { name: 'Tea Tree Face Wash 150ml', cost: 1100, price: 1650, catIdx: 2 },
    { name: 'Gel Nail Polish Red 15ml', cost: 950, price: 1500, catIdx: 3 },
  ];

  const itemsData = [];
  for (let i = 1; i <= 50; i++) {
    const base = baseItems[(i - 1) % baseItems.length];
    const loc = locations[(i - 1) % locations.length];
    const sup = suppliers[(i - 1) % suppliers.length];
    const cat = categories[base.catIdx];
    const unit = masterUnits[(i - 1) % masterUnits.length];
    const itemCode = padId('ITM', i, 15);
    const cost = base.cost + (i * 20);
    const margin = 20;
    const retailPrice = cost + (cost * margin) / 100;

    itemsData.push({
      LocCode: loc.LocCode,
      ItemCode: itemCode,
      ServiceItem: i % 4 === 0,
      MOF: 'O',
      ItemDes: `${base.name} - Vol ${Math.ceil(i / 10)}`,
      ItemPrintDes: `${base.name}`.substring(0, 50),
      MasterUnitID: unit.MasterUnitID,
      Category1: cat.CatCode,
      Category2: '',
      Category3: '',
      Category4: '',
      SupID: sup.SupID,
      ROL: 10,
      ROQ: 50,
      MinQty: 5,
      MaxQty: 200,
      RawCost: cost,
      CostMarkup: margin,
      OverallCost: cost,
      SalesMargin: margin,
      StockBalance: Math.floor(Math.random() * 100) + 10,
      ExpiryItem: i % 2 === 0,
      Retailprice: retailPrice,
      SerDuration: 0,
      WSApp: true,
      WSQty: 5,
      WSPrice: retailPrice * 0.9,
      PackedItem: false,
      PackSize: 0,
      PackPrice: 0,
      SemiFinishedProd: false,
      Enable: true,
      CreateBy: '0000000001',
      UpdBy: '0000000001',
    });
  }

  await prisma.tbl_ItemMaster.createMany({ data: itemsData, skipDuplicates: true });

  console.log('✅ Successfully seeded all master data!');

  if (generatedPasswords.length > 0) {
    console.log('');
    console.log('  Sign-in details for the demo accounts created just now');
    console.log('  (only shown once — save them somewhere safe and change them):');
    console.log('');
    for (const row of generatedPasswords) console.log(`    ${row.login.padEnd(14)} ${row.password}`);
    console.log('');
    console.log('  To choose your own instead, set SEED_PASSWORD_ADMIN, SEED_PASSWORD_MANAGER,');
    console.log('  SEED_PASSWORD_TECH1, SEED_PASSWORD_RECEPTION or SEED_PASSWORD_TECH2 before');
    console.log('  `npm run db:seed`. An account that already exists keeps its old password.');
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });