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
  
  const [rows] = await connection.query('SHOW CREATE TABLE sales_payment');
  console.log('sales_payment schema:\n', rows[0]['Create Table']);

  const [invoicesSchema] = await connection.query('SHOW TABLES');
  console.log('sales_db tables:\n', invoicesSchema);

  await connection.end();
}

main().catch(err => console.error(err));
