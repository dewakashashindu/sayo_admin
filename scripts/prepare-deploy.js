const fs = require('fs');
const path = require('path');

const copies = [
  // Static files
  ['.next/static', '.next/standalone/.next/static'],
  // Public folder
  ['public', '.next/standalone/public'],
  // Prisma generated client
  ['node_modules/.prisma', '.next/standalone/node_modules/.prisma'],
  // Prisma client
  ['node_modules/@prisma', '.next/standalone/node_modules/@prisma'],
];

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`⚠️  Skipping (not found): ${src}`);
    return;
  }
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log(`✅ Copied: ${src} → ${dest}`);
}

copies.forEach(([src, dest]) => copyRecursive(src, dest));
console.log('\n🚀 Deploy prep complete! Upload .next/standalone/ to server.');