const fs = require('fs');
const { parse } = require('csv-parse/sync');

/**
 * Loads a CSV file synchronously and returns parsed rows as an array of objects.
 * Uses the first row as headers.
 * 
 * @param {string} filePath - Absolute path to the CSV file.
 * @returns {Array<Object>} Array of parsed rows.
 */
function readCsv(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist at path: ${filePath}`);
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      cast: true
    });
    return records;
  } catch (error) {
    console.error(`❌ Error parsing CSV file at ${filePath}:`, error.message);
    throw error;
  }
}

module.exports = { readCsv };
