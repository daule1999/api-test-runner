const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

function runShiftsReconciliationSuite() {
  describe('Postman Collection: Shift Session Lifecycle & Reconciliations (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      const api = new TestClient();
      api.setEventId(process.env.SELECTED_EVENT_ID);
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
    });

    describe('Dynamic Shift Float Variances and Supervisor Reconciliation Audits', () => {
      const csvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'shifts_ledger_variance.csv');
      const syncRows = readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Shift Case #${index + 1}: Close Counter ${row.shopId} with float target ₹${row.actualClosingCash}`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.setEventId(process.env.SELECTED_EVENT_ID);
        // 1. Perform Cashier Login to map active assignment
        const cashierToken = await api.login(row.username, row.password);
        expect(cashierToken).toBeDefined();
        api.token = cashierToken;

        const userId = await api.getUserId(row.username);
        const shopId = parseInt(row.shopId, 10);

        console.log(`\n🧪 Simulating Shift lifecycle for Shop Counter ID: ${shopId}...`);

        // 2. Open Shift Float
        let activeShift;
        try {
          activeShift = await api.openShift(shopId, parseFloat(row.openingCash));
          console.log(`🚀 Shift opened. Float balance initialized at ₹${row.openingCash}`);
        } catch (err) {
          // If already open, fetch the active session
          activeShift = await api.getActiveShift(shopId);
          console.log(`⚠️ Shop shift already active.`);
        }

        expect(activeShift).toBeDefined();
        const shiftId = activeShift.id;
        expect(shiftId).toBeDefined();

        // 3. Close Shift with Float Mismatch Variance
        console.log(`🚀 Closing shift ID ${shiftId} with actual cash float calculated at ₹${row.actualClosingCash}...`);

        const closePayload = {
          actualClosingCash: parseFloat(row.actualClosingCash),
          denominations: [
            { currencyValue: 500, noteCount: Math.floor(parseFloat(row.actualClosingCash) / 500) }
          ]
        };

        const closeResult = await api.closeShift(shiftId, closePayload);
        expect(closeResult).toBeDefined();
        expect(closeResult.status).toBe('CLOSED');
        console.log(`✅ Counter closed. Shift status set to: ${closeResult.status}`);

        // 4. Authenticate Supervisor to execute Reconciliation Audits
        console.log(`🚀 Authenticating Admin/Supervisor to execute reconciliation audit...`);
        const supervisorApi = new TestClient();
        supervisorApi.token = adminToken;

        // Perform reconcile comment
        const reconciliation = await supervisorApi.reconcileShift(shiftId, row.varianceComment);
        expect(reconciliation).toBeDefined();
        expect(reconciliation.status).toBe('RECONCILED');
        console.log(`🎉 Shift ID ${shiftId} successfully Audited and RECONCILED by Supervisor with comments: "${row.varianceComment}".`);
      });
    });
  });
}

module.exports = runShiftsReconciliationSuite;
