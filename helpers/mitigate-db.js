const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    database: 'sales_db'
  });

  console.log('Connected to sales_db!');
  
  // Apply the default value mitigation to sales_payment.event_id
  console.log('Mitigating pre-existing backend bug: Adding DEFAULT 1 to sales_payment.event_id...');
  await connection.query('ALTER TABLE sales_payment MODIFY COLUMN event_id BIGINT NOT NULL DEFAULT 1');
  console.log('✅ Alter table successful!');

  await connection.end();
}

main().catch(err => console.error(err));
