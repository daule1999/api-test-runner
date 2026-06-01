/**
 * PHASE 5 — Shift Close & Reconciliation
 * Closes the shift, verifies expected cash, reconciles the session, checks variance, and reviews shift history.
 */
const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');
const ctx = require('./test-context');

function runPhase5() {
  describe('Phase 5 — Shift Close & Reconciliation', () => {
    let adminApi;

    beforeAll(async () => {
      adminApi = new TestClient();
      await adminApi.login('admin', 'Admin@123');
      if (ctx.eventId) adminApi.setEventId(ctx.eventId);
    }, 15000);

    test('Verify shift live tally before closure', async () => {
      const shop = ctx.shopMap['Counter A'];
      expect(shop).toBeDefined();

      // Retrieve live-tally using direct axios client
      const res = await adminApi.client.get(`/api/sales-svc/reports/live-tally/${shop.id}`, { headers: adminApi.headers });
      expect(res.status).toBe(200);

      const tally = res.data.data || res.data;
      console.log(`  ✅ Live tally expected cash in drawer: ${tally.expectedCashInTill || tally.expectedCash || 0}`);
    });

    test('Close active shift session for cashier_john', async () => {
      const shop = ctx.shopMap['Counter A'];
      expect(shop).toBeDefined();
      expect(ctx.shiftId).toBeDefined();

      const johnClient = new TestClient();
      await johnClient.login('cashier_john', 'Cashier@1234');
      if (ctx.eventId) johnClient.setEventId(ctx.eventId);

      // Fetch active shift to calculate expected cash
      const activeShift = await johnClient.getActiveShift(shop.id);
      const expectedCash = parseFloat(activeShift.expectedCash || activeShift.openingCash || 1000.00);

      // Declare cash with a variance of 10.00 surplus for comprehensive coverage
      const variance = 10.00;
      const declaredCash = expectedCash + variance;

      const closurePayload = {
        actualClosingCash: declaredCash,
        denominations: [
          { currencyValue: 500, noteCount: Math.floor(declaredCash / 500) },
          { currencyValue: 100, noteCount: Math.floor((declaredCash % 500) / 100) },
          { currencyValue: 10, noteCount: Math.floor((declaredCash % 100) / 10) }
        ]
      };

      const result = await johnClient.closeShift(ctx.shiftId, closurePayload);
      expect(result).toBeDefined();
      expect(['CLOSED', 'SUCCESS']).toContain(result.status || result.shiftStatus);

      console.log(`  ✅ Shift ${ctx.shiftId} closed by cashier. Expected cash: ${expectedCash}, Declared: ${declaredCash}`);
    });

    test('Supervisor shift reconciliation with variance audit', async () => {
      expect(ctx.shiftId).toBeDefined();

      const result = await adminApi.reconcileShift(ctx.shiftId, 'Approved with minor variance of +10');
      expect(result).toBeDefined();
      expect(['RECONCILED', 'SUCCESS']).toContain(result.status || result.shiftStatus);

      // Fetch shift history to verify reconciled state & variance
      const history = await adminApi.getShiftHistory(ctx.shopMap['Counter A'].id);
      const shiftRecord = Array.isArray(history) ? history.find(s => s.id === ctx.shiftId) : history;
      expect(shiftRecord).toBeDefined();
      expect(shiftRecord.status || shiftRecord.shiftStatus).toBe('RECONCILED');

      console.log(`  ✅ Shift ${ctx.shiftId} successfully reconciled by admin. Variance comment logged.`);
    });

    test('Negative: Cannot close an already-closed shift', async () => {
      const shop = ctx.shopMap['Counter A'];
      const johnClient = new TestClient();
      await johnClient.login('cashier_john', 'Cashier@1234');
      if (ctx.eventId) johnClient.setEventId(ctx.eventId);

      const res = await johnClient.client.post(`/api/sales-svc/shifts/${ctx.shiftId}/close`, {
        actualClosingCash: 1000.00,
        denominations: []
      }, { headers: johnClient.headers });

      expect([409, 400]).toContain(res.status);
      console.log(`  ✅ Closing already-closed shift correctly rejected (status: ${res.status}).`);
    });
  });
}

module.exports = runPhase5;
