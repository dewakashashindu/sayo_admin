const { execSync } = require('child_process');

const localUrl = "mysql://root:Dew12aka%40@localhost:3306/sayo";
const cloudUrl = "mysql://3Euf7TMsHoKgf9r.root:CWrT9Sok6X1F19rz@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/sayo?sslaccept=strict";

console.log('🚀 Pushing schema to LOCAL Database...');
try {
  execSync(`npx prisma db push`, {
    env: { ...process.env, DATABASE_URL: localUrl },
    stdio: 'inherit'
  });
  console.log('✅ Local DB sync complete!\n');
} catch (err) {
  console.error('❌ Failed to push to Local DB\n');
}

console.log('☁️ Pushing schema to CLOUD TiDB Database...');
try {
  execSync(`npx prisma db push`, {
    env: { ...process.env, DATABASE_URL: cloudUrl },
    stdio: 'inherit'
  });
  console.log('✅ Cloud DB sync complete!\n');
} catch (err) {
  console.error('❌ Failed to push to Cloud DB\n');
}