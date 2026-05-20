const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { readCsv } = require('./csv-helper');

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
};

async function getAdminConnection() {
  return await mysql.createConnection({
    ...dbConfig,
    multipleStatements: true
  });
}

module.exports = {
  getAdminConnection
};
