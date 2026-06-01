const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

function runShopsSuite(customCsvPath) {
  describe('Postman Collection: Shops CRUD (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      const api = new TestClient();
      api.setEventId(process.env.SELECTED_EVENT_ID);
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
    });

    describe('Dynamic Shop CRUD Lifecycle', () => {
      const csvPath = typeof customCsvPath === 'string' ? customCsvPath : path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'shops_feed.csv');
      const syncRows = Array.isArray(customCsvPath) ? customCsvPath : readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Shop Case #${index + 1}: ${row.shopName} (${row.action})`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.setEventId(process.env.SELECTED_EVENT_ID);
        api.token = adminToken;

        console.log(`\n🧪 Process Shop Action [${row.action}] for: ${row.shopName}`);

        // Dynamically resolve categoryName to ID from active database categories
        const categories = await api.getCategories();
        const targetCategory = categories.find(
          c => c.name && c.name.trim().toLowerCase() === row.categoryName.trim().toLowerCase()
        );
        const categoryId = targetCategory ? targetCategory.id : null;
        expect(categoryId).not.toBeNull();

        const allShops = await api.getShops();
        const existing = allShops.find(
          s => s.shopName && s.shopName.trim().toLowerCase() === row.shopName.trim().toLowerCase()
        );

        if (row.action === 'CREATE') {
          if (existing) {
            console.log(`⚠️ Shop "${row.shopName}" already exists.`);
            return;
          }
          const created = await api.registerShop({
            shopName: row.shopName,
            categoryId: categoryId,
            counterNumber: row.counterNumber,
            isActive: row.isActive === 'true'
          });
          expect(created).toBeDefined();
          expect(created.shopName).toBe(row.shopName);
          console.log(`✅ Created Shop: ${created.shopName} with ID ${created.id}`);
        }

        else if (row.action === 'UPDATE') {
          let targetShop = existing;
          if (!targetShop) {
            console.log(`🚀 Pre-creating shop for UPDATE check...`);
            targetShop = await api.registerShop({
              shopName: row.shopName,
              categoryId: categoryId,
              counterNumber: parseInt(row.counterNumber, 10),
              isActive: row.isActive === 'true'
            });
          }
          const runId = Date.now().toString().slice(-4);
          const updated = await api.updateShop(targetShop.id, {
            shopName: row.shopName + ' (Updated ' + runId + ')',
            categoryId: categoryId,
            counterNumber: parseInt(row.counterNumber, 10),
            isActive: row.isActive === 'true'
          });
          expect(updated).toBeDefined();
          expect(updated.shopName).toContain('(Updated');
          console.log(`✅ Updated Shop ID ${targetShop.id}`);
        }

        else if (row.action === 'DELETE') {
          let targetShop = existing;
          if (!targetShop) {
            console.log(`🚀 Pre-creating shop for DELETE check...`);
            targetShop = await api.registerShop({
              shopName: row.shopName,
              categoryId: categoryId,
              counterNumber: row.counterNumber,
              isActive: row.isActive === 'true'
            });
          }
          await api.deleteShop(targetShop.id);
          console.log(`✅ Deleted Shop ID ${targetShop.id}`);

          // Verify history fetch endpoint returns cleanly (can be empty but must compile)
          const history = await api.getShopSalesHistory(targetShop.id);
          expect(history).toBeDefined();
          console.log(`✅ Verified sales history mapping for Shop counter ID ${targetShop.id}.`);
        }
      });
    });
  });
}

module.exports = runShopsSuite;
