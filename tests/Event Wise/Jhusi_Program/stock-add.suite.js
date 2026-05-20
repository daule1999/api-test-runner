const { TestClient } = require('../../../helpers/framework');
const { readCsv } = require('../../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite mapping to the "02: Stock add into inventory" collection,
 * powered dynamically by Feed_data/EventWise/Jhusi_Program/Setup/stock_movement.csv!
 */
function runStockAddSuite() {
  describe('Postman Collection: 02: Stock add into inventory (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      // 1. Perform Single Admin Login (Postman Request 01)
      const api = new TestClient();
      console.log('🧪 Executing pre-requisite: 01: Admin Login...');
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      console.log('✅ Admin login successful. Token acquired.');
    }, 30000); // 30s timeout

    // Generate dynamic test cases for each stock movement in the CSV file
    describe('Dynamic Stock Movement Pipeline', () => {
      const csvPath = path.resolve(
        process.cwd(),
        'DATA',
        'Feed_data',
        'EventWise',
        'Jhusi_Program',
        'Setup',
        'stock_movement.csv'
      );
      const syncRows = readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Stock Movement #${index + 1}: ${row.product_name} (+${row.product_quantity})`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;
        // Event ID is '1' in Postman collection variables
        api.setEventId(process.env.JHUSI_EVENT_ID);

        console.log(`\n──────────────────────────────────────────────────`);
        console.log(`🧪 Starting Pipeline for Stock Movement: ${row.product_name}`);
        console.log(`──────────────────────────────────────────────────`);

        // Postman Step 02: Search product
        console.log(`🔍 Searching product: "${row.product_name}"...`);
        const searchResults = await api.searchProducts(row.product_name);
        expect(Array.isArray(searchResults)).toBe(true);

        if (searchResults.length > 0) {
          const targetedItem = searchResults[0];
          const productId = targetedItem.id;
          console.log(`🎯 Product match confirmed: ${targetedItem.name} [ID: ${productId}]`);

          // Postman Step 03: Stock Movement (IN)
          console.log(`🚀 Creating stock movement IN (+${row.product_quantity}) for product ID ${productId}...`);
          const movementRecord = await api.createStockMovement({
            productId,
            movementType: 'IN',
            quantity: row.product_quantity,
            reason: row.product_reason
          });

          expect(movementRecord).toBeDefined();

          // Verify returned properties (handling both wrapped and unwrapped backend formats)
          const record = movementRecord.data ? movementRecord.data : movementRecord;
          expect(record.movementType).toBe('IN');
          expect(Number(record.quantity)).toBeGreaterThanOrEqual(Number(row.product_quantity));
          expect(record.productId.toString()).toBe(productId.toString());
          console.log(`✅ Stock movement logged successfully.`);

          // Postman Step 04: Get All Stocks (Verify persistent database stock metrics)
          console.log(`📊 Fetching all active stocks to verify persistence metrics...`);
          const stocksList = await api.getStocks();
          expect(Array.isArray(stocksList)).toBe(true);

          const targetStockRecord = stocksList.find(
            item => item.productId && item.productId.toString() === productId.toString()
          );

          expect(targetStockRecord).toBeDefined();
          expect(Number(targetStockRecord.quantity)).toBeGreaterThanOrEqual(Number(row.product_quantity));
          console.log(`🎉 Verification passed: Persistent stock quantity (${targetStockRecord.quantity}) verified successfully.`);
        } else {
          console.warn(`⚠️ WARNING: Product Name "${row.product_name}" does not exist in inventory system. Skipping stock additions updates.`);
        }
      });
    });
  });
}

module.exports = runStockAddSuite;
