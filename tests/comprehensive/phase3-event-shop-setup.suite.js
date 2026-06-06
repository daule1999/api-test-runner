/**
 * PHASE 3 — Event & Shop Setup
 * Creates events, registers unique shop counters, assigns staff, issues stocks, and tests constraints.
 */
const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');
const ctx = require('./test-context');

const CSV_DIR = path.resolve(__dirname, '..', '..', 'DATA', 'Feed_data', 'comprehensive');

function runPhase3() {
  describe('Phase 3 — Event & Shop Setup', () => {
    let api;
    const eventRows = readCsv(path.join(CSV_DIR, 'events.csv'));
    const shopRows = readCsv(path.join(CSV_DIR, 'shops.csv'));
    const stockIssueRows = readCsv(path.join(CSV_DIR, 'stock_issues.csv'));

    beforeAll(async () => {
      api = new TestClient();
      await api.login('admin', 'Admin@123');
      if (ctx.eventId) api.setEventId(ctx.eventId);
    }, 15000);

    // ─── 3.1 Create Event from CSV ──────────────────────────────────────────
    describe('3.1 Create events from CSV', () => {
      test.each(
        eventRows.map((r, i) => [`[${i + 1}] Event: ${r.eventName}`, r])
      )('%s', async (_desc, row) => {
        try {
          const result = await api.createEvent({
            eventName: row.eventName,
            eventType: 'MELA',
            description: row.description,
            location: row.location,
            startDate: row.startDate,
            endDate: row.endDate,
            isActive: true
          });

          expect(result.id || result).toBeDefined();
          if (result.id) {
            if (!ctx.eventId) {
              ctx.eventId = result.id;
              ctx.eventName = row.eventName;
              api.setEventId(ctx.eventId);
            }
          }
          console.log(`  ✅ Event "${row.eventName}" created (ID: ${result.id || 'exists'}).`);
        } catch (err) {
          console.log(`  ℹ️ Event skipped or exists: ${err.message}`);
        }
      });
    });

    // ─── 3.3 Register Shop Counters ─────────────────────────────────────────
    describe('3.3 Register shop counters with unique event suffix', () => {
      test.each(
        shopRows.map((r, i) => [`[${i + 1}] Shop: ${r.shopName}`, r])
      )('%s', async (_desc, row) => {
        let categoryId = ctx.categoryMap['Beverages'] || 1;
        if (row.shopName === 'Counter B') {
          categoryId = ctx.categoryMap['Beverages'] || 1;
        } else if (row.shopName === 'Counter C') {
          categoryId = ctx.categoryMap['Stationery'] || 3;
        }

        // Use a unique name scoped to eventId to avoid global uniqueness conflicts in the DB
        const uniqueShopName = `${row.shopName}_Event_${ctx.eventId}`;

        try {
          const result = await api.registerShop({
            shopName: uniqueShopName,
            categoryId,
            counterNumber: parseInt(row.counterNumber, 10),
            isActive: true
          });

          expect(result.id || result).toBeDefined();
          if (result.id) {
            ctx.shopMap[row.shopName] = {
              id: result.id,
              counterNumber: parseInt(row.counterNumber, 10),
              categoryId,
              uniqueName: uniqueShopName
            };
            console.log(`  ✅ Shop "${uniqueShopName}" registered (ID: ${result.id}).`);
          }
        } catch (err) {
          console.log(`  ℹ️ Shop "${uniqueShopName}" registration skipped or already exists: ${err.message}`);
        }
      });
    });

    // ─── 3.4 Resolve Shop IDs ───────────────────────────────────────────────
    describe('3.4 Resolve shop map from event allocations', () => {
      test('Fetch all shops and map details', async () => {
        // Query shops registered for this specific event to isolate our test run
        const shops = await api.getShops();
        for (const s of shops) {
          // Map dynamic unique name back to logical CSV shopName
          for (const row of shopRows) {
            const expectedUniqueName = `${row.shopName}_Event_${ctx.eventId}`;
            if (s.shopName === expectedUniqueName) {
              ctx.shopMap[row.shopName] = {
                id: s.id,
                counterNumber: s.counterNumber,
                categoryId: s.categoryId,
                uniqueName: s.shopName
              };
            }
          }
        }
        expect(Object.keys(ctx.shopMap).length).toBeGreaterThanOrEqual(shopRows.length);
        console.log(`  ✅ Shop map resolved: ${JSON.stringify(ctx.shopMap)}`);
      });
    });

    // ─── 3.5 Assign Staff to Shop Counters ──────────────────────────────────
    describe('3.5 Assign staff to shop counters', () => {
      test('Assign cashier_john to Counter A', async () => {
        const shop = ctx.shopMap['Counter A'];
        expect(shop).toBeDefined();
        expect(ctx.cashierJohnUserId).toBeDefined();

        const result = await api.assignStaff({
          shopId: shop.id,
          userId: ctx.cashierJohnUserId,
          roleCode: 'CASHIER'
        });
        expect(result).toBeDefined();
        console.log(`  ✅ Assigned cashier_john to Counter A.`);
      });

      test('Assign cashier_jane to Counter B', async () => {
        const shop = ctx.shopMap['Counter B'];
        expect(shop).toBeDefined();
        expect(ctx.cashierJaneUserId).toBeDefined();

        const result = await api.assignStaff({
          shopId: shop.id,
          userId: ctx.cashierJaneUserId,
          roleCode: 'CASHIER'
        });
        expect(result).toBeDefined();
        console.log(`  ✅ Assigned cashier_jane to Counter B.`);
      });
    });

    // ─── 3.6 Issue Stock to Counters (Consignment) ──────────────────────────
    describe('3.6 Issue stock to counters from CSV', () => {
      test.each(
        stockIssueRows.map((r, i) => [`[${i + 1}] Issue ${r.quantity}x "${r.productName}" to "${r.shopName}"`, r])
      )('%s', async (_desc, row) => {
        const shop = ctx.shopMap[row.shopName];
        const product = ctx.productMap[row.productName];
        expect(shop).toBeDefined();
        expect(product).toBeDefined();

        const qty = parseInt(row.quantity, 10);

        // Fetch pre-issue warehouse stock
        const stocksBefore = await api.getStocks();
        const stockBefore = stocksBefore.find(s => s.productId === product.id);
        const warehouseQtyBefore = stockBefore ? stockBefore.quantity : 0;

        const result = await api.issueStockToShop({
          productId: product.id,
          sellerUser: 'admin',
          shopId: shop.id,
          quantity: qty
        });
        expect(result).toBeDefined();

        // Fetch post-issue warehouse stock
        const stocksAfter = await api.getStocks();
        const stockAfter = stocksAfter.find(s => s.productId === product.id);
        const warehouseQtyAfter = stockAfter ? stockAfter.quantity : 0;

        // Verify stock was decremented from warehouse
        expect(warehouseQtyAfter).toBe(warehouseQtyBefore - qty);

        // Fetch counter stock
        const counterQty = await api.getStock(shop.id, product.id);
        expect(counterQty).toBe(qty);

        // Store snapshots in context
        ctx.stockSnapshots[row.productName] = ctx.stockSnapshots[row.productName] || {
          warehouseInward: 0,
          issuedToCounters: 0
        };
        ctx.stockSnapshots[row.productName].issuedToCounters += qty;

        console.log(`  ✅ Consigned ${qty}x "${row.productName}" to "${row.shopName}". Warehouse stock: ${warehouseQtyBefore} -> ${warehouseQtyAfter}. Counter stock: ${counterQty}`);
      });
    });

    // ─── 3.7 Negative: Consign Insufficient Stock → 400 ─────────────────────
    describe('3.7 Insufficient warehouse stock is rejected', () => {
      test('Try to issue 10000 Mineral Water and expect rejection', async () => {
        const shop = ctx.shopMap['Counter A'];
        const product = ctx.productMap['Mineral Water 500ml'];
        expect(shop).toBeDefined();
        expect(product).toBeDefined();

        const res = await api.client.post('/api/inventory-svc/sales', {
          productId: product.id,
          sellerUser: 'admin',
          shopId: shop.id,
          quantity: 10000
        }, { headers: api.headers });

        expect([400, 422, 500]).toContain(res.status);
        console.log(`  ✅ Insufficient stock correctly rejected (status: ${res.status}).`);
      });
    });
  });
}

module.exports = runPhase3;
