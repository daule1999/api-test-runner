const mysql = require('mysql2/promise');

async function main() {
  console.log('Connecting to MySQL on port 3306...');
  try {
    const connection = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
    });

    console.log('✅ Connected successfully!');

    // Show databases
    const [databases] = await connection.query('SHOW DATABASES');
    console.log('Databases:', databases.map(db => db.Database));

    // Inspect user_db
    await connection.query('USE user_db');
    const [users] = await connection.query('SELECT id, username, email FROM users LIMIT 10');
    console.log('--- USERS ---');
    console.table(users);

    // Inspect inventory_db
    await connection.query('USE inventory_db');
    const [products] = await connection.query('SELECT id, name, sku, mrp, selling_price FROM product LIMIT 50');
    console.log('--- PRODUCTS ---');
    console.table(products);

    // Inspect inventory_db
    await connection.query('USE inventory_db');
    const [stocks] = await connection.query('SELECT * FROM counter_stocks WHERE product_id IN (1, 2, 13, 19, 20)');
    console.log('--- COUNTER STOCKS ---');
    console.table(stocks);

    await connection.end();
  } catch (error) {
    console.error('❌ Error inspecting database:', error.message);
  }
}

main();
