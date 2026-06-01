/**
 * PHASE 8 — Conservation & Audit Equations
 * Mathematically audits the system state to verify inventory conservation, financial tally, and cash drawer balance.
 */
const { TestClient } = require('../../helpers/framework');
const ctx = require('./test-context');

function runPhase8() {
  describe('Phase 8 — Conservation & Audit Equations', () => {
    let adminApi;

    beforeAll(async () => {
      adminApi = new TestClient();
      await adminApi.login('admin', 'Admin@123');
      if (ctx.eventId) adminApi.setEventId(ctx.eventId);
    }, 15000);

    test('8.1 Inventory Conservation Equation holds (Drift == 0)', async () => {
      // Fetch all warehouse stocks
      const warehouseStocks = await adminApi.getStocks();

      for (const productName of Object.keys(ctx.stockSnapshots)) {
        const product = ctx.productMap[productName];
        expect(product).toBeDefined();

        const snapshot = ctx.stockSnapshots[productName];
        const Q_inward = snapshot.warehouseInward;

        // 1. Warehouse remaining stock
        const whStock = warehouseStocks.find(s => s.productId === product.id);
        const Q_warehouse_remaining = whStock ? parseInt(whStock.quantity, 10) : 0;

        // 2. Net sold across all counters
        const productOrders = ctx.orders.filter(o => o.productName === productName);
        const Q_net_sold = productOrders.reduce((sum, o) => sum + o.qty, 0);

        // 3. Counter leftovers
        let Q_leftover_on_counter = 0;
        for (const shopName of Object.keys(ctx.shopMap)) {
          const shop = ctx.shopMap[shopName];
          const counterStock = await adminApi.getStock(shop.id, product.id);
          Q_leftover_on_counter += counterStock;
        }

        // 4. Drift calculation
        const drift = Q_inward - (Q_warehouse_remaining + Q_net_sold + Q_leftover_on_counter);
        
        console.log(`  📊 Inventory Audit for "${productName}":`);
        console.log(`     - Inwarded (Purchased): ${Q_inward}`);
        console.log(`     - Remaining in Central Warehouse: ${Q_warehouse_remaining}`);
        console.log(`     - Net Sold on Counters: ${Q_net_sold}`);
        console.log(`     - Remaining Leftover on Counters: ${Q_leftover_on_counter}`);
        console.log(`     - Drift Calculation: ${drift}`);

        expect(drift).toBe(0);
      }
    });

    test('8.2 Financial Conservation Equation holds (Variance == 0)', async () => {
      let cumulativeCashConfirmed = 0;
      let cumulativeOnlineConfirmed = 0;
      let cumulativeInvoiceNet = 0;

      for (const order of ctx.orders) {
        cumulativeCashConfirmed += order.cashAmt;
        cumulativeOnlineConfirmed += order.onlineAmt;

        // Retrieve the corresponding invoice items and sum prices
        const invoiceItems = await adminApi.getInvoiceItemsByOrderNo(order.orderNumber);
        const invoiceTotal = invoiceItems.reduce((sum, item) => sum + (parseFloat(item.unitPrice || item.price) * parseInt(item.quantity || item.qty, 10)), 0);
        cumulativeInvoiceNet += invoiceTotal;
      }

      // Account for returns in cash/revenue splits
      const netConfirmedRevenue = cumulativeCashConfirmed + cumulativeOnlineConfirmed - ctx.totalRefunds;

      console.log(`  💸 Financial Audit:`);
      console.log(`     - Cash Collected: ${cumulativeCashConfirmed}`);
      console.log(`     - Online Collected: ${cumulativeOnlineConfirmed}`);
      console.log(`     - Cumulative Refunds Issued: ${ctx.totalRefunds}`);
      console.log(`     - Net Sales Revenue: ${netConfirmedRevenue}`);
      console.log(`     - Cumulative Invoice Net Total: ${cumulativeInvoiceNet - ctx.totalRefunds}`);

      const financialVariance = netConfirmedRevenue - (cumulativeInvoiceNet - ctx.totalRefunds);
      expect(financialVariance).toBe(0);
    });

    test('8.3 Cash Drawer Drawer Tally holds expected balance', async () => {
      // Shift A (Counter A) expected closing balance verification
      const shop = ctx.shopMap['Counter A'];
      expect(shop).toBeDefined();

      const history = await adminApi.getShiftHistory(shop.id);
      const shiftRecord = Array.isArray(history) ? history.find(s => s.id === ctx.shiftId) : history;
      expect(shiftRecord).toBeDefined();

      // Formula: Expected = Opening + CashRevenue - Refunds
      const opening = parseFloat(shiftRecord.openingCash || 1000.00);
      const expected = opening + ctx.totalCashRevenue - ctx.totalRefunds;
      
      const expectedRecord = parseFloat(shiftRecord.expectedCash || shiftRecord.expectedClosingCash);
      expect(expectedRecord).toBeCloseTo(expected, 2);

      console.log(`  💰 Cash Drawer Audit for Counter A:`);
      console.log(`     - Opening Float: ${opening}`);
      console.log(`     - Cash Revenue Added: ${ctx.totalCashRevenue}`);
      console.log(`     - Cash Refunds Subtracted: ${ctx.totalRefunds}`);
      console.log(`     - Expected closing in Drawer: ${expected}`);
      console.log(`     - Recorded expected closing in database: ${expectedRecord}`);
    });
  });
}

module.exports = runPhase8;
