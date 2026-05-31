const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

function runInventoryAdvancedSuite() {
  describe('Postman Collection: Advanced Inventory Management (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      const api = new TestClient();
      api.setEventId(process.env.SELECTED_EVENT_ID);
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
    });

    describe('Dynamic Product CRUD Modifications', () => {
      const csvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'inventory_modifications.csv');
      const syncRows = readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Product modification #${index + 1}: ${row.productName} (${row.action})`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.setEventId(process.env.SELECTED_EVENT_ID);
        api.token = adminToken;

        console.log(`\n🧪 Process Product Action [${row.action}] for: ${row.productName}`);

        const catalog = await api.getProducts();
        const existing = catalog.find(
          p => p.name && p.name.trim().toLowerCase() === row.productName.trim().toLowerCase()
        );

        if (row.action === 'UPDATE') {
          let targetProduct = existing;
          if (!targetProduct) {
            console.log(`🚀 Pre-creating product for UPDATE check...`);
            targetProduct = await api.createProduct({
              categoryId: 1,
              name: row.productName,
              sku: row.sku,
              description: 'Initial product config',
              mrp: row.mrp,
              sellingPrice: row.sellingPrice,
              discount: row.discount
            });
          }

          const updated = await api.updateProduct(targetProduct.id, {
            categoryId: 1,
            name: row.productName + ' (Updated)',
            sku: targetProduct.sku,
            description: 'Revised inventory record',
            mrp: parseFloat(row.mrp),
            sellingPrice: parseFloat(row.sellingPrice),
            discount: parseFloat(row.discount || 0)
          });
          expect(updated).toBeDefined();
          expect(updated.name).toContain('(Updated)');
          console.log(`✅ Updated Product ID ${targetProduct.id}`);
        }

        else if (row.action === 'DELETE') {
          let targetProduct = existing;
          if (!targetProduct) {
            console.log(`🚀 Pre-creating product for DELETE check...`);
            targetProduct = await api.createProduct({
              categoryId: 1,
              name: row.productName,
              sku: row.sku,
              description: 'Temporary delete checker',
              mrp: row.mrp,
              sellingPrice: row.sellingPrice,
              discount: row.discount
            });
          }
          await api.deleteProduct(targetProduct.id);
          console.log(`✅ Deleted Product ID ${targetProduct.id}`);
        }
      });
    });

    describe('Bulk Product Upload Operations', () => {
      test('Bulk Create Product Listing', async () => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.setEventId(process.env.SELECTED_EVENT_ID);
        api.token = adminToken;

        const runId = Date.now().toString().slice(-6);
        const bulkList = [
          {
            categoryId: 1,
            name: `Bulk Ayurveda Syrup A ${runId}`,
            sku: `BLK${runId}A`,
            description: 'Bulk upload item 1',
            mrp: 100.00,
            sellingPrice: 90.00,
            discount: 10.00
          },
          {
            categoryId: 1,
            name: `Bulk Ayurveda Syrup B ${runId}`,
            sku: `BLK${runId}B`,
            description: 'Bulk upload item 2',
            mrp: 200.00,
            sellingPrice: 180.00,
            discount: 20.00
          }
        ];

        console.log(`🚀 Simulating Bulk CSV Upload with ${bulkList.length} products...`);
        const result = await api.bulkCreateProducts(bulkList);
        expect(result).toBeDefined();
        console.log(`✅ Bulk products created successfully.`);
      });
    });
  });
}

module.exports = runInventoryAdvancedSuite;
