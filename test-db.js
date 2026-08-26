// E:\sayo_admin\sayo-admin\test-db.js
const mysql = require('mysql2/promise');

async function testDB() {
  console.log('Testing connection to mysql8001.site4now.net...\n');
  
  try {
    const conn = await mysql.createConnection({
      host:      'mysql8001.site4now.net',
      port:      3306,
      user:      'acd689_sayo',
      password:  'Sayo@2026',
      database:  'db_acd689_sayo',
      connectTimeout: 8000,
    });

    console.log('✅ DATABASE CONNECTED SUCCESSFULLY!');
    const [rows] = await conn.execute('SELECT 1 + 1 AS result');
    console.log('Query result:', rows[0].result);
    await conn.end();
    console.log('\n🎉 Everything works! Restart server with: npm run dev');

  } catch (e) {
    console.error('❌ CONNECTION FAILED:', e.message);
    console.log('');
    
    if (e.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('→ ISSUE: Password or username wrong');
      console.log('  Fix: Update .env DATABASE_URL with correct password');
    } else if (e.code === 'ER_BAD_DB_ERROR') {
      console.log('→ ISSUE: Database name wrong');
      console.log('  Check cPanel: Is DB exactly "db_acd689_sayo"? Or just "acd689_sayo"?');
    } else if (e.code === 'ECONNREFUSED') {
      console.log('→ ISSUE: Remote MySQL access blocked / server down');
      console.log('  Fix: cPanel → Remote MySQL → Add your IP');
    } else if (e.code === 'ETIMEDOUT') {
      console.log('→ ISSUE: Firewall / IP not whitelisted');
      console.log('  Fix: cPanel → Remote MySQL → Add your IP');
    } else {
      console.log('→ Unknown error:', e.code || 'N/A');
    }
  }
}

testDB();