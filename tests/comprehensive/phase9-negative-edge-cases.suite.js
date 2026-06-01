/**
 * PHASE 9 — Negative Edge Cases
 * Rigorously exercises boundary conditions, negative parameters, zero/negative quantities, and soft-delete behaviors.
 */
const { TestClient } = require('../../helpers/framework');
const ctx = require('./test-context');

function runPhase9() {
  describe('Phase 9 — Negative Edge Cases', () => {
    let adminApi;

    beforeAll(async () => {
      adminApi = new TestClient();
      await adminApi.login('admin', 'Admin@123');
      if (ctx.eventId) adminApi.setEventId(ctx.eventId);
    }, 15000);

    test('9.1 Zero quantity draft sale is rejected', async () => {
      const shop = ctx.shopMap['Counter A'];
      const product = ctx.productMap['Mineral Water 500ml'];
      expect(shop).toBeDefined();
      expect(product).toBeDefined();

      const res = await adminApi.client.post('/api/sales-svc/retail', {
        shopId: shop.id,
        customerName: 'Zero Quantity Buyer',
        customerMobile: '9999988888',
        items: [{
          productId: product.id,
          productName: 'Mineral Water 500ml',
          quantity: 0,
          mrp: product.mrp,
          sellingPrice: product.sellingPrice,
          discount: 0
        }]
      }, { headers: adminApi.headers });

      if (res.status === 200 || res.status === 201) {
        const draft = res.data.data || res.data;
        const confirmRes = await adminApi.client.put(`/api/sales-svc/retail/${draft.orderNumber}/confirm`, {
          paymentMode: 'CASH',
          amount: 0.00,
          cashAmount: 0.00,
          onlineAmount: 0.00,
          paymentReference: 'FAKE-ZERO-QTY-CONFIRM'
        }, { headers: adminApi.headers });
        expect([400, 422, 500]).toContain(confirmRes.status);
        console.log(`  ✅ Zero quantity confirmation correctly rejected (status: ${confirmRes.status}).`);
      } else {
        expect([400, 422, 500]).toContain(res.status);
        console.log(`  ✅ Zero quantity order correctly rejected on creation (status: ${res.status}).`);
      }
    });

    test('9.2 Negative payment splits are rejected', async () => {
      const shop = ctx.shopMap['Counter A'];
      const product = ctx.productMap['Mineral Water 500ml'];
      expect(shop).toBeDefined();
      expect(product).toBeDefined();

      // Create draft order first
      const draft = await adminApi.createDraftSale({
        shopId: shop.id,
        productId: product.id,
        productName: 'Mineral Water 500ml',
        quantity: 1,
        mrp: product.mrp,
        sellingPrice: product.sellingPrice,
        discount: 0
      });
      expect(draft.orderNumber).toBeDefined();

      // Confirm with a negative cashAmount
      const res = await adminApi.client.put(`/api/sales-svc/retail/${draft.orderNumber}/confirm`, {
        paymentMode: 'BOTH',
        amount: product.sellingPrice,
        cashAmount: -10.00,
        onlineAmount: product.sellingPrice + 10.00,
        paymentReference: 'FAKE-NEG-PAY'
      }, { headers: adminApi.headers });

      expect([400, 422, 500]).toContain(res.status);
      console.log(`  ✅ Negative payment split correctly rejected (status: ${res.status}).`);
    });

    test('9.3 Accessing or ordering soft-deleted products is blocked', async () => {
      // 1. Create a temporary product
      const ts = Date.now();
      const tempProduct = await adminApi.createProduct({
        categoryId: ctx.categoryMap['Beverages'] || 1,
        name: `TempForDelete_${ts}`,
        sku: `SKU-DEL-${ts}`,
        description: 'Temp delete test product',
        mrp: 10.00,
        sellingPrice: 9.00,
        discount: 0
      });
      expect(tempProduct.id).toBeDefined();

      // 2. Soft-delete the product
      const delRes = await adminApi.client.delete(`/api/inventory-svc/products/${tempProduct.id}`, { headers: adminApi.headers });
      expect([200, 204]).toContain(delRes.status);

      // 3. Attempting to draft a sale with the deleted product should fail or confirmation should fail
      const shop = ctx.shopMap['Counter A'];
      const orderRes = await adminApi.client.post('/api/sales-svc/retail', {
        shopId: shop.id,
        customerName: 'Deleted Product Buyer',
        customerMobile: '9999988888',
        items: [{
          productId: tempProduct.id,
          productName: `TempForDelete_${ts}`,
          quantity: 1,
          mrp: 10.00,
          sellingPrice: 9.00,
          discount: 0
        }]
      }, { headers: adminApi.headers });

      if (orderRes.status === 200 || orderRes.status === 201) {
        // If draft succeeded, trying to confirm must fail
        const draft = orderRes.data.data || orderRes.data;
        const confirmRes = await adminApi.client.put(`/api/sales-svc/retail/${draft.orderNumber}/confirm`, {
          paymentMode: 'CASH',
          amount: 9.00,
          cashAmount: 9.00,
          onlineAmount: 0.00,
          paymentReference: 'FAKE-DEL-CONFIRM'
        }, { headers: adminApi.headers });
        expect([400, 404, 409, 500]).toContain(confirmRes.status);
        console.log(`  ✅ Deleted product order confirmation correctly rejected (status: ${confirmRes.status}).`);
      } else {
        expect([400, 404, 500]).toContain(orderRes.status);
        console.log(`  ✅ Deleted product draft order correctly rejected (status: ${orderRes.status}).`);
      }
    });
  });
}

module.exports = runPhase9;
