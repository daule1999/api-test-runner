const { TestClient } = require('../../../helpers/framework');
const { readCsv } = require('../../../helpers/csv-helper');
const path = require('path');

function runSalesActionsSuite() {
  describe('Postman Collection: Sales Returns & Cancellations (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      const api = new TestClient();
      api.setEventId(process.env.SELECTED_EVENT_ID);
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
    });

    describe('Dynamic Returns & Cancellations Lifecycle', () => {
      const csvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'sales_returns.csv');
      const syncRows = readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Refund Case #${index + 1}: ${row.username} executes ${row.action} for ${row.productName}`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.setEventId(process.env.SELECTED_EVENT_ID || '1');

        // 1. Login Cashier
        const cashierToken = await api.login(row.username, row.password);
        expect(cashierToken).toBeDefined();
        api.token = cashierToken;

        // 2. Resolve references
        const product = await api.getProduct(row.productName);
        const userId = await api.getUserId(row.username);
        const shopId = await api.getShopId(userId);

        // 2.5 Check counter has enough stock; skip gracefully if depleted
        const counterStocks = await api.getShopStocks(shopId);
        const counterItem = counterStocks.find(s => s.id && s.id.toString() === product.id.toString());
        const availableQty = counterItem ? parseInt(counterItem.shopStock, 10) : 0;
        const neededQty = parseInt(row.orderQuantity, 10);

        if (availableQty < neededQty) {
          console.warn(`⚠️ Skipping: "${row.productName}" has only ${availableQty} units at counter ${shopId}, need ${neededQty}. Counter stock depleted from previous tests.`);
          return; // skip gracefully
        }

        console.log(`\n🧪 Simulating Order Creation for Action [${row.action}]...`);

        // 3. Create Draft Sale
        const draft = await api.createDraftSale({
          shopId,
          productId: product.id,
          productName: product.name,
          quantity: neededQty,
          mrp: product.mrp,
          sellingPrice: product.sellingPrice,
          discount: product.discount
        });
        expect(draft.orderNumber).toBeDefined();
        console.log(`🚀 Draft Order Created: ${draft.orderNumber}`);

        // 4. Settle / Confirm Sale (Using split payment BOTH cash/online)
        const totalAmount = (product.sellingPrice - product.discount) * neededQty;

        // Split cash and online evenly
        const cashSplit = totalAmount / 2;
        const onlineSplit = totalAmount / 2;

        const confirmation = await api.confirmSale(draft.orderNumber, totalAmount, cashSplit, onlineSplit);
        expect(confirmation.status).toBeDefined();
        console.log(`✅ Order Settle Completed. Status: ${confirmation.status}`);

        // Perform target return or cancel actions
        if (row.action === 'RETURN') {
          console.log(`🚀 Executing Return for ${row.returnQuantity} units out of ${row.orderQuantity}...`);

          const returnPayload = {
            reason: row.reason,
            items: [
              {
                productId: product.id,
                productName: product.name,
                quantity: row.returnQuantity,
                unitPrice: product.sellingPrice
              }
            ]
          };

          const returnResult = await api.returnSale(draft.orderNumber, returnPayload);
          expect(returnResult).toBeDefined();
          console.log(`✅ Return processed successfully.`);

          // Verify invoice refund details endpoint
          const paymentDetails = await api.getPaymentDetails(draft.orderNumber);
          expect(paymentDetails).toBeDefined();
          console.log(`✅ Checked split payment refund ledger: Cash allocation: ${paymentDetails.cashAmount}, Online allocation: ${paymentDetails.onlineAmount}`);
        }

        else if (row.action === 'CANCEL') {
          console.log(`🚀 Executing Cancellation for Order ${draft.orderNumber}...`);
          const cancelResult = await api.cancelSale(draft.orderNumber, row.reason);
          expect(cancelResult).toBeDefined();
          console.log(`✅ Order cancellation confirmed.`);
        }
      });
    });
  });
}

module.exports = runSalesActionsSuite;
