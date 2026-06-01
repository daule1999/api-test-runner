/**
 * PHASE 4 — Shift Operations & Sales Lifecycle
 * Opens shift, processes sales orders, verifies stock decrement, handles returns and cancellations,
 * and verifies stock restoration.
 */
const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');
const ctx = require('./test-context');

const CSV_DIR = path.resolve(__dirname, '..', '..', 'DATA', 'Feed_data', 'comprehensive');

function runPhase4() {
  describe('Phase 4 — Shift Operations & Sales Lifecycle', () => {
    let adminApi;
    const salesRows = readCsv(path.join(CSV_DIR, 'sales_orders.csv'));
    const returnRows = readCsv(path.join(CSV_DIR, 'return_items.csv'));

    beforeAll(async () => {
      adminApi = new TestClient();
      await adminApi.login('admin', 'Admin@123');
      if (ctx.eventId) adminApi.setEventId(ctx.eventId);
    }, 15000);

    // ─── 4.1 Open Shift Sessions ───────────────────────────────────────────
    describe('4.1 Open shift sessions', () => {
      test('Open shift for cashier_john at Counter A', async () => {
        const johnClient = new TestClient();
        await johnClient.login('cashier_john', 'Cashier@1234');
        if (ctx.eventId) johnClient.setEventId(ctx.eventId);

        const shop = ctx.shopMap['Counter A'];
        expect(shop).toBeDefined();

        const result = await johnClient.openShift(shop.id, ctx.openingCash);
        expect(result.id).toBeDefined();
        
        ctx.shiftId = result.id; // Store Counter A shift ID
        console.log(`  ✅ Shift opened for cashier_john at Counter A (Shift ID: ${ctx.shiftId}).`);
      });

      test('Open shift for cashier_jane at Counter B', async () => {
        const janeClient = new TestClient();
        await janeClient.login('cashier_jane', 'Cashier@1234');
        if (ctx.eventId) janeClient.setEventId(ctx.eventId);

        const shop = ctx.shopMap['Counter B'];
        expect(shop).toBeDefined();

        const result = await janeClient.openShift(shop.id, ctx.openingCash);
        expect(result.id).toBeDefined();
        console.log(`  ✅ Shift opened for cashier_jane at Counter B.`);
      });

      test('Negative: Duplicate open shift returns 409', async () => {
        const johnClient = new TestClient();
        await johnClient.login('cashier_john', 'Cashier@1234');
        if (ctx.eventId) johnClient.setEventId(ctx.eventId);

        const shop = ctx.shopMap['Counter A'];
        const res = await johnClient.client.post('/api/sales-svc/shifts/open', {
          shopId: shop.id,
          openingCash: ctx.openingCash,
          denominations: [{ currencyValue: 500, noteCount: 2 }]
        }, { headers: johnClient.headers });

        expect([409, 400]).toContain(res.status);
        console.log(`  ✅ Duplicate shift open rejected (status: ${res.status}).`);
      });
    });

    // ─── 4.2 Create and Confirm Sales Orders from CSV ────────────────────────
    describe('4.2 Create and confirm sales orders', () => {
      test.each(
        salesRows.map((r, i) => [`[${i + 1}] Order: ${r.quantity}x "${r.productName}" by "${r.cashierUsername}"`, r])
      )('%s', async (_desc, row) => {
        const client = new TestClient();
        await client.login(row.cashierUsername, 'Cashier@1234');
        if (ctx.eventId) client.setEventId(ctx.eventId);

        const shop = ctx.shopMap[row.shopName];
        const product = ctx.productMap[row.productName];
        expect(shop).toBeDefined();
        expect(product).toBeDefined();

        const qty = parseInt(row.quantity, 10);
        const cashAmt = parseFloat(row.cashAmount);
        const onlineAmt = parseFloat(row.onlineAmount);
        const total = parseFloat(row.sellingPrice) * qty;

        // Fetch pre-sale stock level on counter
        const initialCounterStock = await client.getStock(shop.id, product.id);

        // 1. Create draft sales order
        const draft = await client.createDraftSale({
          shopId: shop.id,
          productId: product.id,
          productName: row.productName,
          quantity: qty,
          mrp: parseFloat(row.mrp),
          sellingPrice: parseFloat(row.sellingPrice),
          discount: parseFloat(row.discount)
        });

        expect(draft.orderNumber).toBeDefined();
        expect(['CREATED', 'DRAFT']).toContain(draft.status);

        // 2. Confirm order
        const confirmation = await client.confirmSale(draft.orderNumber, total, cashAmt, onlineAmt);
        expect(confirmation).toBeDefined();
        expect(['CONFIRMED', 'SUCCESS', 'COMPLETED', 'PAID']).toContain(confirmation.status || confirmation.orderStatus);

        // 3. Verify counter stock decremented
        const finalCounterStock = await client.getStock(shop.id, product.id);
        expect(finalCounterStock).toBe(initialCounterStock - qty);

        // Save order for returns & cancellations
        ctx.orders.push({
          orderNumber: draft.orderNumber,
          shopId: shop.id,
          shopName: row.shopName,
          productId: product.id,
          productName: row.productName,
          qty,
          originalQty: qty,
          total,
          originalTotal: total,
          cashAmt,
          onlineAmt,
          status: 'COMPLETED'
        });

        // Accumulate revenues
        ctx.totalCashRevenue += cashAmt;
        ctx.totalOnlineRevenue += onlineAmt;

        console.log(`  ✅ Confirmed Order ${draft.orderNumber}: Sold ${qty}x "${row.productName}". Counter stock: ${initialCounterStock} -> ${finalCounterStock}`);
      });
    });

    // ─── 4.3 Process Sales Returns from CSV ──────────────────────────────────
    describe('4.3 Process sales returns', () => {
      test.each(
        returnRows.map((r, i) => [`[${i + 1}] Return ${r.returnQty}x "${r.productName}"`, r])
      )('%s', async (_desc, row) => {
        // Find matching confirmed order in context
        const order = ctx.orders.find(o => o.productName === row.productName && o.status === 'COMPLETED');
        expect(order).toBeDefined();

        const returnQty = parseInt(row.returnQty, 10);
        const unitPrice = parseFloat(row.unitPrice);
        const refundAmount = returnQty * unitPrice;

        const client = new TestClient();
        await client.login('admin', 'Admin@123'); // Admin conducts refund
        if (ctx.eventId) client.setEventId(ctx.eventId);

        const initialCounterStock = await client.getStock(order.shopId, order.productId);

        // Process Return
        const result = await client.returnSale(order.orderNumber, {
          reason: row.reason,
          items: [{
            productId: order.productId,
            productName: order.productName,
            quantity: returnQty,
            unitPrice
          }]
        });

        expect(result).toBeDefined();

        // Verify stock re-incremented on counter
        const finalCounterStock = await client.getStock(order.shopId, order.productId);
        expect(finalCounterStock).toBe(initialCounterStock + returnQty);

        // Track refund
        ctx.totalRefunds += refundAmount;
        order.qty -= returnQty; // Adjust quantity for conservation matching
        order.total -= refundAmount;

        console.log(`  ✅ Returned ${returnQty}x "${order.productName}" for Order ${order.orderNumber}. Counter stock: ${initialCounterStock} -> ${finalCounterStock}`);
      });
    });

    // ─── 4.4 Full Order Cancellation & Reversal ──────────────────────────────
    describe('4.4 Full order cancellation and stock restoration', () => {
      test('Create, confirm and cancel order to verify full reversal', async () => {
        const client = new TestClient();
        await client.login('cashier_john', 'Cashier@1234');
        if (ctx.eventId) client.setEventId(ctx.eventId);

        const shop = ctx.shopMap['Counter A'];
        const product = ctx.productMap['Potato Chips 50g'];
        expect(shop).toBeDefined();
        expect(product).toBeDefined();
        client.shopId = shop.id;

        const qty = 5;
        const initialCounterStock = await client.getStock(shop.id, product.id);

        // 1. Create draft
        const draft = await client.createDraftSale({
          shopId: shop.id,
          productId: product.id,
          productName: 'Potato Chips 50g',
          quantity: qty,
          mrp: product.mrp,
          sellingPrice: product.sellingPrice,
          discount: 0
        });

        // 2. Confirm
        await client.confirmSale(draft.orderNumber, product.sellingPrice * qty, product.sellingPrice * qty, 0);
        ctx.totalCashRevenue += product.sellingPrice * qty;
        const postSaleStock = await client.getStock(shop.id, product.id);
        expect(postSaleStock).toBe(initialCounterStock - qty);

        // 3. Cancel
        const cancelResult = await client.cancelSale(draft.orderNumber, 'Customer cancellation');
        expect(cancelResult).toBeDefined();

        // 4. Verify stock fully restored
        const postCancelStock = await client.getStock(shop.id, product.id);
        expect(postCancelStock).toBe(initialCounterStock);

        console.log(`  ✅ Created, confirmed and CANCELLED order ${draft.orderNumber}. Stock fully restored to ${postCancelStock}.`);
      });
    });

    // ─── 4.5 Negative: Invalid Returns Rejected ─────────────────────────────
    describe('4.5 Invalid returns rejected', () => {
      test('Return quantity exceeding original quantity returns 400', async () => {
        const order = ctx.orders[0];
        expect(order).toBeDefined();

        const client = new TestClient();
        await client.login('admin', 'Admin@123');
        if (ctx.eventId) client.setEventId(ctx.eventId);

        const res = await client.client.put(`/api/sales-svc/retail/${order.orderNumber}/return`, {
          reason: 'Excess return',
          items: [{
            productId: order.productId,
            productName: order.productName,
            quantity: 1000,
            unitPrice: order.total / order.qty
          }]
        }, { headers: client.headers });

        expect([400, 422, 500]).toContain(res.status);
        console.log(`  ✅ Excess return correctly rejected (status: ${res.status}).`);
      });
    });
  });
}

module.exports = runPhase4;
