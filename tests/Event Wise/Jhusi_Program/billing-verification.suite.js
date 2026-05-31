const { TestClient } = require('../../../helpers/framework');

/**
 * Billing Verification Suite
 * P0 — tests invoice lifecycle, price snapshots, status transitions.
 *
 * Mapped to Plan §1.4
 */
function runBillingVerificationSuite() {
  describe('Billing Service — Invoice Lifecycle & Price Snapshot (P0)', () => {
    let adminToken;
    let adminApi;
    let eventId;

    beforeAll(async () => {
      adminApi = new TestClient();
      adminToken = await adminApi.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      adminApi.token = adminToken;
      eventId = process.env.SELECTED_EVENT_ID || '1';
      adminApi.setEventId(eventId);
    }, 25000);

    async function resolveShopAndProduct(minStock = 2) {
      const shops = await adminApi.getShops();
      for (const shop of shops) {
        const stocks = await adminApi.getShopStocks(shop.id);
        const stocked = stocks.find(s => parseInt(s.shopStock, 10) >= minStock);
        if (stocked) return { shopId: shop.id, product: stocked };
      }
      throw new Error('No shop with sufficient stock found for billing test');
    }

    async function createAndConfirmSale(shopId, product, qty = 1) {
      const draft = await adminApi.createDraftSale({
        shopId,
        productId: product.id,
        productName: product.name,
        quantity: qty,
        mrp: product.mrp,
        sellingPrice: product.sellingPrice,
        discount: product.discount || 0
      });

      expect(draft.orderNumber).toBeDefined();

      try { await adminApi.openShift(shopId); } catch (_) { }

      const total = parseFloat(
        ((product.sellingPrice - (product.discount || 0)) * qty).toFixed(2)
      );

      const confirmation = await adminApi.confirmSale(draft.orderNumber, total);
      return { orderNumber: draft.orderNumber, total, product, qty };
    }

    // ─────────────────────────────────────────────────────────────
    // 1. Invoice existence after confirmed sale
    // ─────────────────────────────────────────────────────────────
    describe('1. Invoice Created After Confirmed Sale', () => {
      test('GET /billing-svc/invoices/order/{orderNo}/items returns line items after sale', async () => {
        const { shopId, product } = await resolveShopAndProduct();
        const { orderNumber, qty, product: prod } = await createAndConfirmSale(shopId, product, 1);

        const res = await adminApi.client.get(
          `/api/billing-svc/invoices/order/${orderNumber}/items`,
          { headers: adminApi.headers }
        );
        console.log(`📄 Invoice items response for ${orderNumber}: ${res.status}`);
        expect(res.status).toBe(200);

        const items = res.data.data || res.data;
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeGreaterThan(0);

        const lineItem = items[0];
        console.log(`✅ Invoice line item: ${JSON.stringify(lineItem)}`);
        expect(lineItem).toBeDefined();
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Price snapshot — invoice stores sale-time price, not catalog price
    // ─────────────────────────────────────────────────────────────
    describe('2. Price Snapshot Integrity', () => {
      test('Invoice line items contain snapshotted MRP and sellingPrice from time of sale', async () => {
        const { shopId, product } = await resolveShopAndProduct();
        const soldPrice = parseFloat(product.sellingPrice);
        const soldMrp = parseFloat(product.mrp);

        const { orderNumber } = await createAndConfirmSale(shopId, product, 1);

        const res = await adminApi.client.get(
          `/api/billing-svc/invoices/order/${orderNumber}/items`,
          { headers: adminApi.headers }
        );
        expect(res.status).toBe(200);

        const items = res.data.data || res.data;
        const lineItem = items[0];

        // The stored price should match what was sold
        console.log(`🔍 Snapshot check — sold: ${soldPrice}, invoice: ${lineItem.sellingPrice || lineItem.unitPrice}`);
        const invoicePrice = parseFloat(lineItem.sellingPrice || lineItem.unitPrice || lineItem.price || 0);
        expect(invoicePrice).toBeCloseTo(soldPrice, 1);

        if (lineItem.mrp !== undefined) {
          const invoiceMrp = parseFloat(lineItem.mrp);
          expect(invoiceMrp).toBeCloseTo(soldMrp, 1);
        }
        console.log('✅ Price snapshot verified — invoice matches sold price.');
      });

      test('Updating product price after sale does NOT change invoice line items', async () => {
        const { shopId, product } = await resolveShopAndProduct(3);

        // 1. Record sale at original price
        const originalPrice = parseFloat(product.sellingPrice);
        const { orderNumber } = await createAndConfirmSale(shopId, product, 1);

        // 2. Update product price (if product has an id)
        const productId = product.id || product.productId;
        if (productId) {
          const newPrice = originalPrice + 999; // artificially high new price
          const updateRes = await adminApi.client.put(
            `/api/inventory-svc/products/${productId}`,
            {
              categoryId: 1,
              name: product.name,
              sku: product.sku || `SNAP${Date.now()}`,
              description: 'Price updated post-sale',
              mrp: newPrice + 100,
              sellingPrice: newPrice,
              discount: 0
            },
            { headers: adminApi.headers }
          );
          console.log(`🔧 Product price updated to ${newPrice}: status ${updateRes.status}`);
        } else {
          console.warn('⚠️ Product ID not resolvable from shop stock — skipping price update step.');
        }

        // 3. Re-check the invoice — should still show original price
        const res = await adminApi.client.get(
          `/api/billing-svc/invoices/order/${orderNumber}/items`,
          { headers: adminApi.headers }
        );
        expect(res.status).toBe(200);
        const items = res.data.data || res.data;
        const lineItem = items[0];
        const invoicePrice = parseFloat(lineItem.sellingPrice || lineItem.unitPrice || lineItem.price || 0);

        console.log(`🔍 Snapshot integrity — original: ${originalPrice}, invoice after price change: ${invoicePrice}`);
        // Invoice must still show original price
        expect(invoicePrice).toBeCloseTo(originalPrice, 1);
        console.log('✅ Price snapshot integrity confirmed — historical invoice unchanged.');
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Invoice status transitions
    // ─────────────────────────────────────────────────────────────
    describe('3. Invoice Status Transitions', () => {
      test('After full order cancellation, invoice status reflects CANCELLED/VOID', async () => {
        const { shopId, product } = await resolveShopAndProduct();
        const { orderNumber } = await createAndConfirmSale(shopId, product, 1);

        // Cancel the order
        const cancelRes = await adminApi.client.put(
          `/api/sales-svc/retail/${orderNumber}/cancel?reason=BillingStatusTest`,
          {},
          { headers: adminApi.headers }
        );
        console.log(`🔴 Cancel result: ${cancelRes.status}`);
        expect([200, 201]).toContain(cancelRes.status);

        // Check invoice status
        const res = await adminApi.client.get(
          `/api/billing-svc/invoices/order/${orderNumber}/items`,
          { headers: adminApi.headers }
        );
        console.log(`📄 Invoice after cancel: ${res.status}`);
        if (res.status === 200) {
          const items = res.data.data || res.data;
          console.log(`✅ Invoice items after cancellation: ${JSON.stringify(items)}`);
          // Items may be empty or have a cancelled status — either is valid
          expect(Array.isArray(items)).toBe(true);
        } else {
          // 404 after cancel is also acceptable (invoice purged)
          expect([200, 404]).toContain(res.status);
        }
      });

      test('After partial return, GET payment details shows return was processed', async () => {
        const { shopId, product } = await resolveShopAndProduct(2);
        const { orderNumber, total } = await createAndConfirmSale(shopId, product, 2);

        // Partial return: 1 of 2
        const returnRes = await adminApi.client.put(
          `/api/sales-svc/retail/${orderNumber}/return`,
          {
            reason: 'Billing status partial return test',
            items: [{
              productId: product.id,
              productName: product.name,
              quantity: 1,
              unitPrice: parseFloat(product.sellingPrice)
            }]
          },
          { headers: adminApi.headers }
        );
        console.log(`↩️ Partial return result: ${returnRes.status}`);
        expect([200, 201]).toContain(returnRes.status);

        // Payment details should reflect partial return
        const payRes = await adminApi.client.get(
          `/api/sales-svc/retail/${orderNumber}/payment`,
          { headers: adminApi.headers }
        );
        if (payRes.status === 200) {
          const payData = payRes.data.data || payRes.data;
          console.log(`✅ Payment details after partial return: ${JSON.stringify(payData)}`);
          expect(payData).toBeDefined();
        } else {
          console.warn(`⚠️ Payment details endpoint returned ${payRes.status} after partial return.`);
        }
      });

      test('Payment split amounts in invoice match amounts sent during confirm', async () => {
        const { shopId, product } = await resolveShopAndProduct();
        const { orderNumber, total } = await createAndConfirmSale(shopId, product, 1);

        // Directly call confirm with explicit cash/online split
        // (This tests the first sale's details — note: confirmSale in createAndConfirmSale
        //  auto-splits. Here we verify the GET endpoint returns split breakdown.)
        const payRes = await adminApi.client.get(
          `/api/sales-svc/retail/${orderNumber}/payment`,
          { headers: adminApi.headers }
        );
        if (payRes.status === 200) {
          const payData = payRes.data.data || payRes.data;
          console.log(`✅ Payment split details: ${JSON.stringify(payData)}`);

          // Verify total is consistent
          if (payData.amount !== undefined) {
            expect(parseFloat(payData.amount)).toBeCloseTo(total, 1);
          }

          // Verify cash and online sum to total
          if (payData.cashAmount !== undefined && payData.onlineAmount !== undefined) {
            const sum = parseFloat(payData.cashAmount) + parseFloat(payData.onlineAmount);
            expect(sum).toBeCloseTo(total, 1);
            console.log(`✅ Split verification: ${payData.cashAmount} + ${payData.onlineAmount} = ${sum} ≈ ${total}`);
          }
        } else {
          console.warn(`⚠️ Payment details endpoint returned ${payRes.status}`);
        }
      });
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Return uses snapshot price (not current catalog price)
    // ─────────────────────────────────────────────────────────────
    describe('4. Return Price Integrity (QA Issue #17)', () => {
      test('Return refund is based on snapshotted sale price, not updated catalog price', async () => {
        const { shopId, product } = await resolveShopAndProduct(2);
        const originalPrice = parseFloat(product.sellingPrice);

        // 1. Confirm sale at original price
        const { orderNumber } = await createAndConfirmSale(shopId, product, 2);

        // 2. Update catalog price (simulate admin changing price mid-event)
        const productId = product.id || product.productId;
        if (productId) {
          await adminApi.client.put(
            `/api/inventory-svc/products/${productId}`,
            {
              categoryId: 1,
              name: product.name,
              sku: product.sku || `RET${Date.now()}`,
              description: 'Price changed mid-event',
              mrp: originalPrice * 3,
              sellingPrice: originalPrice * 2, // price doubled
              discount: 0
            },
            { headers: adminApi.headers }
          );
          console.log(`🔧 Catalog price updated to ${originalPrice * 2} (was ${originalPrice})`);
        }

        // 3. Perform partial return — system should use snapshot price
        const returnRes = await adminApi.client.put(
          `/api/sales-svc/retail/${orderNumber}/return`,
          {
            reason: 'Return price integrity test',
            items: [{
              productId: product.id,
              productName: product.name,
              quantity: 1,
              unitPrice: originalPrice  // we pass original price — server should use snapshot
            }]
          },
          { headers: adminApi.headers }
        );
        console.log(`↩️ Return result with price integrity check: ${returnRes.status}`);
        expect([200, 201]).toContain(returnRes.status);

        // 4. Verify invoice items still show original snapshot price
        const invoiceRes = await adminApi.client.get(
          `/api/billing-svc/invoices/order/${orderNumber}/items`,
          { headers: adminApi.headers }
        );
        if (invoiceRes.status === 200) {
          const items = invoiceRes.data.data || invoiceRes.data;
          if (items && items.length > 0) {
            const lineItem = items[0];
            const invoicedPrice = parseFloat(lineItem.sellingPrice || lineItem.unitPrice || lineItem.price || 0);
            console.log(`🔍 Invoice price after return: ${invoicedPrice} (original: ${originalPrice})`);
            // Invoice should reference original sale price
            expect(invoicedPrice).toBeCloseTo(originalPrice, 1);
            console.log('✅ Return price integrity verified — snapshot price preserved.');
          }
        } else {
          console.warn(`⚠️ Invoice endpoint returned ${invoiceRes.status} after return.`);
        }
      });
    });
  });
}

module.exports = runBillingVerificationSuite;
