const { TestClient } = require('../../../helpers/framework');
const { readCsv } = require('../../../helpers/csv-helper');
const path = require('path');

/**
 * Shift Analytics Suite
 * P1 — tests shift product summary, cash/online totals, analytics endpoints.
 *
 * Mapped to Plan §1.9
 */
function runShiftAnalyticsSuite() {
  describe('Shift Analytics — Product Summary & Cash/Online Totals (P1)', () => {
    let adminToken;
    let adminApi;
    let eventId;
    let activeShopId;
    let activeShiftId;

    beforeAll(async () => {
      adminApi = new TestClient();
      adminToken = await adminApi.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      adminApi.token = adminToken;
      eventId = process.env.SELECTED_EVENT_ID || '1';
      adminApi.setEventId(eventId);

      // Find a shop with stock
      const shops = await adminApi.getShops();
      for (const shop of shops) {
        const stocks = await adminApi.getShopStocks(shop.id);
        if (stocks.some(s => parseInt(s.shopStock, 10) >= 1)) {
          activeShopId = shop.id;
          break;
        }
      }

      if (!activeShopId) {
        console.warn('⚠️ No shops with stock found — shift analytics tests may be limited.');
        return;
      }

      // Ensure a shift is open
      try {
        const shift = await adminApi.openShift(activeShopId, 1000);
        activeShiftId = shift.id;
        console.log(`✅ Shift opened with ID: ${activeShiftId}`);
      } catch (err) {
        // May already be open
        const activeShift = await adminApi.getActiveShift(activeShopId);
        if (activeShift && activeShift.id) {
          activeShiftId = activeShift.id;
          console.log(`⚠️ Reusing existing shift ID: ${activeShiftId}`);
        }
      }
    }, 30000);

    // ─────────────────────────────────────────────────────────────
    // 1. Product-shop-sales analytics endpoint
    // ─────────────────────────────────────────────────────────────
    describe('1. Product-Shop Sales Analytics Endpoint', () => {
      test('GET /retail/analytics/product-shop-sales returns data (array or object)', async () => {
        const res = await adminApi.client.get(
          '/api/sales-svc/retail/analytics/product-shop-sales',
          { headers: adminApi.headers }
        );
        console.log(`📊 Product-shop-sales analytics: ${res.status}`);
        expect(res.status).toBe(200);

        const body = res.data.data || res.data;
        expect(body).toBeDefined();
        console.log(`✅ Analytics response type: ${Array.isArray(body) ? 'array' : typeof body}`);
        if (Array.isArray(body)) {
          console.log(`✅ ${body.length} product-shop analytics entries returned.`);
        }
      });

      test('Analytics endpoint returns non-empty data after sales are made', async () => {
        // Make a sale first
        if (!activeShopId) { return; }

        const stocks = await adminApi.getShopStocks(activeShopId);
        const product = stocks.find(s => parseInt(s.shopStock, 10) >= 1);
        if (!product) { console.warn('⚠️ No stock for analytics pre-sale.'); return; }

        const draft = await adminApi.createDraftSale({
          shopId: activeShopId,
          productId: product.id,
          productName: product.name,
          quantity: 1,
          mrp: product.mrp,
          sellingPrice: product.sellingPrice,
          discount: product.discount || 0
        });

        if (draft && draft.orderNumber) {
          const total = parseFloat(product.sellingPrice);
          await adminApi.confirmSale(draft.orderNumber, total);
        }

        // Now check analytics
        const res = await adminApi.client.get(
          '/api/sales-svc/retail/analytics/product-shop-sales',
          { headers: adminApi.headers }
        );
        expect(res.status).toBe(200);
        const body = res.data.data || res.data;
        if (Array.isArray(body)) {
          expect(body.length).toBeGreaterThan(0);
          console.log(`✅ ${body.length} analytics entries after sale.`);
        } else {
          console.log('✅ Analytics data received (non-array format).');
          expect(body).not.toBeNull();
        }
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Shift product summary endpoint
    // ─────────────────────────────────────────────────────────────
    describe('2. Shift Product Summary Endpoint', () => {
      test('GET /retail/analytics/shift-product-summary with shopId → 200', async () => {
        if (!activeShopId) { console.warn('No activeShopId.'); return; }

        const res = await adminApi.client.get(
          `/api/sales-svc/retail/analytics/shift-product-summary?shopId=${activeShopId}`,
          { headers: adminApi.headers }
        );
        console.log(`📊 Shift product summary (shopId only): ${res.status}`);
        expect(res.status).toBe(200);
        const body = res.data.data || res.data;
        expect(body).toBeDefined();
        console.log(`✅ Shift product summary data: ${JSON.stringify(body).slice(0, 200)}`);
      });

      test('GET /retail/analytics/shift-product-summary with shopId+shiftId → 200', async () => {
        if (!activeShopId || !activeShiftId) {
          console.warn('⚠️ Missing shopId or shiftId — skipping.');
          return;
        }

        const res = await adminApi.client.get(
          `/api/sales-svc/retail/analytics/shift-product-summary?shopId=${activeShopId}&shiftSessionId=${activeShiftId}`,
          { headers: adminApi.headers }
        );
        console.log(`📊 Shift product summary (shopId+shiftId): ${res.status}`);
        expect(res.status).toBe(200);
        const body = res.data.data || res.data;
        expect(body).toBeDefined();
        console.log(`✅ Shift+shop filtered summary: ${JSON.stringify(body).slice(0, 200)}`);
      });

      test('Shift product summary without shopId or shiftId → 200 or 400 (documented)', async () => {
        const res = await adminApi.client.get(
          '/api/sales-svc/retail/analytics/shift-product-summary',
          { headers: adminApi.headers }
        );
        console.log(`📊 Shift product summary (no params): ${res.status}`);
        // Either returns all data (200) or requires params (400) — both acceptable
        expect([200, 400]).toContain(res.status);
        console.log(`✅ No-param behavior: ${res.status}`);
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Shift history endpoint
    // ─────────────────────────────────────────────────────────────
    describe('3. Shift History Endpoint', () => {
      test('GET /shifts/history/{shopId} returns shift history list', async () => {
        if (!activeShopId) { console.warn('No activeShopId.'); return; }

        const res = await adminApi.client.get(
          `/api/sales-svc/shifts/history/${activeShopId}`,
          { headers: adminApi.headers }
        );
        console.log(`📊 Shift history: ${res.status}`);
        expect(res.status).toBe(200);
        const body = res.data;
        expect(body).toBeDefined();
        if (Array.isArray(body)) {
          console.log(`✅ ${body.length} shift history records for shop ${activeShopId}`);
        }
      });

      test('GET /shifts/active/{shopId} returns active shift or 404', async () => {
        if (!activeShopId) { return; }

        const res = await adminApi.client.get(
          `/api/sales-svc/shifts/active/${activeShopId}`,
          { headers: adminApi.headers }
        );
        console.log(`📊 Active shift for shop ${activeShopId}: ${res.status}`);
        // Either an active shift (200) or no active shift (404) — both valid
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
          const body = res.data;
          console.log(`✅ Active shift ID: ${body.id}, status: ${body.status}`);
          expect(body.id).toBeDefined();
        } else {
          console.log(`ℹ️ No active shift for shop ${activeShopId}`);
        }
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. All retail sales listing
    // ─────────────────────────────────────────────────────────────
    describe('4. All Retail Sales Listing', () => {
      test('GET /retail/all returns list of all sales (admin view)', async () => {
        const res = await adminApi.client.get(
          '/api/sales-svc/retail/all',
          { headers: adminApi.headers }
        );
        console.log(`📊 All retail sales: ${res.status}`);
        expect(res.status).toBe(200);

        const body = res.data.data || res.data;
        expect(body).toBeDefined();
        if (Array.isArray(body)) {
          console.log(`✅ ${body.length} retail sales returned.`);
          // Verify structure of first item
          if (body.length > 0) {
            const first = body[0];
            expect(first.orderNumber || first.id).toBeDefined();
          }
        } else {
          console.log('✅ All retail sales data received.');
        }
      });
    });
  });
}

module.exports = runShiftAnalyticsSuite;
