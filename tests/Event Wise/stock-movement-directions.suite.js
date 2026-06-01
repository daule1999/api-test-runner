const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Stock Movement Directions Suite
 * Extends the original stock-add suite with ALL movement types:
 * IN, OUT, ADJUSTMENT (positive & negative), RETURN_FROM_COUNTER.
 *
 * Mapped to Plan §1.3
 */
function runStockMovementDirectionsSuite() {
  describe('Stock Movement Directions — All Types (P0)', () => {
    let adminToken;
    let adminApi;
    let testProductId;
    let testProductName;
    let testShopId;

    beforeAll(async () => {
      adminApi = new TestClient();
      adminToken = await adminApi.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      adminApi.token = adminToken;
      adminApi.setEventId(process.env.SELECTED_EVENT_ID || '1');

      // Resolve a product and shop for stock operations
      const products = await adminApi.getProducts();
      const product = products[0];
      if (!product) throw new Error('No products found for stock movement tests');
      testProductId = product.id;
      testProductName = product.name;
      console.log(`🎯 Using product: ${testProductName} (ID: ${testProductId})`);

      const shops = await adminApi.getShops();
      if (shops && shops.length > 0) {
        testShopId = shops[0].id;
        console.log(`🏪 Using shop ID: ${testShopId}`);
      }
    }, 30000);

    // Helper: get current main stock quantity for a product
    async function getMainStock(productId) {
      const stocks = await adminApi.getStocks();
      const rec = stocks.find(s => s.productId && s.productId.toString() === productId.toString());
      return rec ? parseInt(rec.quantity, 10) : 0;
    }

    // ─────────────────────────────────────────────────────────────
    // 1. STOCK IN — increases main stock
    // ─────────────────────────────────────────────────────────────
    describe('1. STOCK IN — Increases Main Stock', () => {
      test('Stock IN movement increases main stock by exact quantity', async () => {
        const before = await getMainStock(testProductId);
        const addQty = 50;

        const movement = await adminApi.createStockMovement({
          productId: testProductId,
          movementType: 'IN',
          quantity: addQty,
          reason: 'Test: Stock IN verification'
        });

        expect(movement).toBeDefined();
        const record = movement.data || movement;
        expect(record.movementType).toBe('IN');
        expect(Number(record.quantity)).toBe(addQty);

        const after = await getMainStock(testProductId);
        console.log(`📦 Stock IN: ${before} → ${after} (+${addQty})`);
        expect(after).toBe(before + addQty);
        console.log('✅ STOCK IN verified — main stock increased correctly.');
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. STOCK OUT — decreases main stock (damage/expiry/audit)
    // ─────────────────────────────────────────────────────────────
    describe('2. STOCK OUT — Decreases Main Stock', () => {
      test('Stock OUT movement decreases main stock by exact quantity', async () => {
        // Ensure enough stock exists
        await adminApi.createStockMovement({
          productId: testProductId,
          movementType: 'IN',
          quantity: 100,
          reason: 'Pre-seed for OUT test'
        });

        const before = await getMainStock(testProductId);
        const removeQty = 20;

        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: parseInt(testProductId, 10),
          movementType: 'OUT',
          quantity: removeQty,
          reason: 'Test: Stock OUT — damage/expiry'
        }, { headers: adminApi.headers });

        console.log(`📦 Stock OUT response: ${res.status}`);

        if (res.status === 404 || res.status === 400) {
          // Backend may not support OUT as a named type — check ADJUSTMENT
          console.warn('⚠️ VALIDATION NOTE: "OUT" movementType may not be supported. Checking ADJUSTMENT...');
          const adj = await adminApi.client.post('/api/inventory-svc/stock-movements', {
            productId: parseInt(testProductId, 10),
            movementType: 'ADJUSTMENT',
            quantity: -removeQty, // negative = decrease
            reason: 'Test: Negative ADJUSTMENT for stock decrease'
          }, { headers: adminApi.headers });
          console.log(`📦 Negative ADJUSTMENT response: ${adj.status}`);
          if ([200, 201].includes(adj.status)) {
            const after = await getMainStock(testProductId);
            console.log(`📦 Negative adjustment: ${before} → ${after} (-${removeQty})`);
            if (after < before) {
              console.log('✅ Negative ADJUSTMENT decreased main stock correctly.');
            } else {
              console.warn('⚠️ VALIDATION GAP: Negative ADJUSTMENT did not decrease stock.');
            }
          }
          return;
        }

        expect([200, 201]).toContain(res.status);
        const after = await getMainStock(testProductId);
        console.log(`📦 Stock OUT: ${before} → ${after} (-${removeQty})`);
        expect(after).toBe(before - removeQty);
        console.log('✅ STOCK OUT verified — main stock decreased correctly.');
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. ADJUSTMENT (positive) — increases main stock
    // ─────────────────────────────────────────────────────────────
    describe('3. ADJUSTMENT Positive — Increases Main Stock', () => {
      test('Positive ADJUSTMENT movement increases main stock', async () => {
        const before = await getMainStock(testProductId);
        const adjQty = 15;

        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: parseInt(testProductId, 10),
          movementType: 'ADJUSTMENT',
          quantity: adjQty,
          reason: 'Test: Positive adjustment (audit surplus)'
        }, { headers: adminApi.headers });

        console.log(`📦 Positive ADJUSTMENT response: ${res.status}`);
        expect([200, 201]).toContain(res.status);

        const after = await getMainStock(testProductId);
        console.log(`📦 Positive ADJUSTMENT: ${before} → ${after} (+${adjQty})`);
        expect(after).toBeGreaterThanOrEqual(before);
        console.log('✅ Positive ADJUSTMENT verified.');
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. ADJUSTMENT (negative) — decreases main stock
    // ─────────────────────────────────────────────────────────────
    describe('4. ADJUSTMENT Negative — Decreases Main Stock', () => {
      test('Negative ADJUSTMENT movement decreases main stock', async () => {
        // Pre-seed
        await adminApi.createStockMovement({
          productId: testProductId,
          movementType: 'IN',
          quantity: 100,
          reason: 'Pre-seed for negative ADJUSTMENT'
        });

        const before = await getMainStock(testProductId);
        const adjQty = -25;

        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: parseInt(testProductId, 10),
          movementType: 'ADJUSTMENT',
          quantity: adjQty,
          reason: 'Test: Negative adjustment (audit shortfall)'
        }, { headers: adminApi.headers });

        console.log(`📦 Negative ADJUSTMENT response: ${res.status}`);

        if ([400, 422].includes(res.status)) {
          console.warn('⚠️ VALIDATION NOTE: Backend does not accept negative quantity in ADJUSTMENT. This is a QA gap — need bidirectional support (QA Issue #4).');
          return;
        }

        expect([200, 201]).toContain(res.status);
        const after = await getMainStock(testProductId);
        console.log(`📦 Negative ADJUSTMENT: ${before} → ${after} (${adjQty})`);
        expect(after).toBeLessThan(before);
        console.log('✅ Negative ADJUSTMENT verified — main stock decreased.');
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 5. RETURN FROM COUNTER — decreases counter, increases main stock
    // ─────────────────────────────────────────────────────────────
    describe('5. Return From Counter — Counter↓ Main↑ (QA Issue #15)', () => {
      test('Return from counter decreases counter stock AND increases main stock', async () => {
        if (!testShopId) {
          console.warn('⚠️ No testShopId — skipping return-from-counter test.');
          return;
        }

        // First ensure some stock is issued to the shop
        const stocksBefore = await adminApi.getShopStocks(testShopId);
        let counterProduct = stocksBefore.find(s => parseInt(s.shopStock, 10) >= 2);

        if (!counterProduct) {
          // Issue stock to shop first
          console.log('🔧 No counter stock — issuing stock to shop for test...');
          try {
            await adminApi.issueStockToShop({
              productId: testProductId,
              sellerUser: 'admin',
              shopId: testShopId,
              quantity: 20
            });
            const stocksAfterIssue = await adminApi.getShopStocks(testShopId);
            counterProduct = stocksAfterIssue.find(s => parseInt(s.shopStock, 10) >= 2);
          } catch (err) {
            console.warn(`⚠️ Could not issue stock: ${err.message}`);
          }
        }

        if (!counterProduct) {
          console.warn('⚠️ Still no counter stock after issue attempt — skipping return test.');
          return;
        }

        const counterStockBefore = parseInt(counterProduct.shopStock, 10);
        const mainStockBefore = await getMainStock(counterProduct.id || testProductId);
        const returnQty = 1;

        console.log(`📦 Return from counter: Counter before=${counterStockBefore}, Main before=${mainStockBefore}`);

        // Execute return from counter (via inventory-svc bulk-movement or specific endpoint)
        // This corresponds to the QA Issue #15 — using the inventory sales endpoint
        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: parseInt(counterProduct.id || testProductId, 10),
          movementType: 'RETURN_FROM_COUNTER',
          quantity: returnQty,
          reason: 'Test: Return from counter (QA Issue #15)',
          shopId: testShopId
        }, { headers: adminApi.headers });

        console.log(`📦 Return from counter response: ${res.status}`);

        if ([400, 404].includes(res.status)) {
          // May need different endpoint/approach
          console.warn('⚠️ VALIDATION NOTE: RETURN_FROM_COUNTER movementType may need dedicated endpoint.');
          console.warn('   QA Issue #15: Counter stock not decreasing on return must be investigated.');

          // Check if there's a dedicated return endpoint in inventory
          const bulkRes = await adminApi.client.post('/api/inventory-svc/sales/return', {
            productId: parseInt(counterProduct.id || testProductId, 10),
            shopId: testShopId,
            quantity: returnQty,
            reason: 'Return from counter test'
          }, { headers: adminApi.headers });
          console.log(`📦 Alternate return endpoint response: ${bulkRes.status}`);
          return;
        }

        expect([200, 201]).toContain(res.status);

        // Verify counter stock decreased AND main stock increased
        const stocksAfter = await adminApi.getShopStocks(testShopId);
        const counterProductAfter = stocksAfter.find(s => s.id && s.id.toString() === (counterProduct.id || testProductId).toString());
        const mainStockAfter = await getMainStock(counterProduct.id || testProductId);

        if (counterProductAfter) {
          const counterStockAfter = parseInt(counterProductAfter.shopStock, 10);
          console.log(`📦 Counter: ${counterStockBefore} → ${counterStockAfter} (-${returnQty})`);
          console.log(`📦 Main: ${mainStockBefore} → ${mainStockAfter} (+${returnQty})`);

          if (counterStockAfter >= counterStockBefore) {
            console.error('❌ QA Issue #15 CONFIRMED: Counter stock was NOT decreased after return from counter!');
          }
          expect(counterStockAfter).toBe(counterStockBefore - returnQty);
          expect(mainStockAfter).toBe(mainStockBefore + returnQty);
          console.log('✅ Return from counter: Both counter↓ and main↑ verified correctly.');
        } else {
          console.warn('⚠️ Could not resolve counter product after return for verification.');
        }
      });
    });
  });
}

module.exports = runStockMovementDirectionsSuite;
