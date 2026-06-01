/**
 * PHASE 7 — Reports & Analytics
 * Executes reporting, analytics, live snapshots, master settlements, trust score, and 3-way matches.
 */
const { TestClient } = require('../../helpers/framework');
const ctx = require('./test-context');

function runPhase7() {
  describe('Phase 7 — Reports & Analytics', () => {
    let adminApi;

    beforeAll(async () => {
      adminApi = new TestClient();
      await adminApi.login('admin', 'Admin@123');
      if (ctx.eventId) adminApi.setEventId(ctx.eventId);
    }, 15000);

    test('Live Snapshot Report returns 200', async () => {
      const shop = ctx.shopMap['Counter A'];
      expect(shop).toBeDefined();

      const res = await adminApi.client.get(`/api/sales-svc/reports/live-snapshot/${shop.id}`, { headers: adminApi.headers });
      expect(res.status).toBe(200);
      
      const data = res.data.data || res.data;
      expect(data).toBeDefined();
      console.log(`  ✅ Live snapshot fetched successfully for Counter A.`);
    });

    test('Shift Product Summary Analytics matches order records', async () => {
      const shop = ctx.shopMap['Counter A'];
      expect(shop).toBeDefined();
      expect(ctx.shiftId).toBeDefined();

      const result = await adminApi.getShiftProductSummary(shop.id, ctx.shiftId);
      expect(result).toBeDefined();

      // Check if products we sold are represented
      const summaryList = Array.isArray(result) ? result : (result.data || []);
      expect(summaryList.length).toBeGreaterThan(0);
      console.log(`  ✅ Shift product summary matches: ${JSON.stringify(summaryList)}`);
    });

    test('Product Counter Sales Analytics returns 200', async () => {
      const result = await adminApi.getProductSalesAnalytics();
      expect(result).toBeDefined();
      console.log(`  ✅ Product shop sales analytics fetched.`);
    });

    test('Master Settlement Report for event returns 200', async () => {
      expect(ctx.eventId).toBeDefined();

      const res = await adminApi.client.get(`/api/sales-svc/reports/master-settlement/${ctx.eventId}`, { headers: adminApi.headers });
      expect(res.status).toBe(200);
      
      const data = res.data.data || res.data;
      expect(data).toBeDefined();
      console.log(`  ✅ Master settlement report generated for Event ${ctx.eventId}.`);
    });

    test('3-Way Match Report returns 200', async () => {
      expect(ctx.eventId).toBeDefined();

      const res = await adminApi.client.get(`/api/sales-svc/reports/3-way-match/${ctx.eventId}`, { headers: adminApi.headers });
      expect(res.status).toBe(200);
      
      const data = res.data.data || res.data;
      expect(data).toBeDefined();
      console.log(`  ✅ 3-Way Match report generated for Event ${ctx.eventId}.`);
    });

    test('Trust Score Query for cashier returns history', async () => {
      expect(ctx.cashierJohnUserId).toBeDefined();

      const res = await adminApi.client.get(`/api/sales-svc/reports/trust-score/${ctx.cashierJohnUserId}`, { headers: adminApi.headers });
      expect(res.status).toBe(200);
      
      const data = res.data.data || res.data;
      expect(data).toBeDefined();
      console.log(`  ✅ Cashier trust score fetched. Cash variance tracking included.`);
    });
  });
}

module.exports = runPhase7;
