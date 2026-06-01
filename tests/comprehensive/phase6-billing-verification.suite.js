/**
 * PHASE 6 — Billing Verification
 * Verifies invoice generation in billing-service, checks line items, and tests snapshot price immutability.
 */
const { TestClient } = require('../../helpers/framework');
const ctx = require('./test-context');

function runPhase6() {
  describe('Phase 6 — Billing Verification', () => {
    let adminApi;

    beforeAll(async () => {
      adminApi = new TestClient();
      await adminApi.login('admin', 'Admin@123');
      if (ctx.eventId) adminApi.setEventId(ctx.eventId);
    }, 15000);

    test('Verify invoice items match order details in billing-service', async () => {
      expect(ctx.orders.length).toBeGreaterThan(0);

      for (const order of ctx.orders) {
        console.log(`  🔍 Verifying billing invoice for Order ${order.orderNumber}...`);
        
        // Fetch invoice items from billing service
        const items = await adminApi.getInvoiceItemsByOrderNo(order.orderNumber);
        expect(items).toBeDefined();
        expect(items.length).toBeGreaterThan(0);

        const match = items.find(item => item.productName === order.productName);
        expect(match).toBeDefined();
        
        // Verify quantity and unit price match confirmed order snapshot
        const expectedQty = order.originalQty || order.qty;
        const expectedTotal = order.originalTotal || order.total;
        expect(parseInt(match.quantity || match.qty, 10)).toBe(expectedQty);
        expect(parseFloat(match.unitPrice || match.price)).toBe(expectedTotal / expectedQty);
        
        console.log(`  ✅ Invoice verified: ${match.quantity}x "${match.productName}" @ ${match.unitPrice}`);
      }
    });

    test('High-Rigor Audit: Price immutability on catalog price update', async () => {
      // Pick the first order and product
      const order = ctx.orders[0];
      expect(order).toBeDefined();

      const product = ctx.productMap[order.productName];
      expect(product).toBeDefined();

      // 1. Update product price in inventory catalog to simulate future price hike
      const updatedSellingPrice = product.sellingPrice + 50.00;
      await adminApi.updateProduct(product.id, {
        categoryId: product.categoryId || ctx.categoryMap['Beverages'] || 1,
        name: order.productName,
        sku: product.sku,
        description: 'Price update test',
        mrp: product.mrp + 50.00,
        sellingPrice: updatedSellingPrice,
        discount: 0
      });

      console.log(`  📈 Catalog price bumped for "${order.productName}" to ${updatedSellingPrice}`);

      // 2. Fetch invoice and assert invoice price remains the historical sellingPrice
      const items = await adminApi.getInvoiceItemsByOrderNo(order.orderNumber);
      const match = items.find(item => item.productName === order.productName);
      expect(match).toBeDefined();
      
      const invoicePrice = parseFloat(match.unitPrice || match.price);
      expect(invoicePrice).toBe(product.sellingPrice); // Historical price preserved!
      
      console.log(`  🛡️ Historical price preserved on invoice: ${invoicePrice} (Catalog is now ${updatedSellingPrice})`);

      // 3. Restore product price to prevent impacting other tests
      await adminApi.updateProduct(product.id, {
        categoryId: product.categoryId || ctx.categoryMap['Beverages'] || 1,
        name: order.productName,
        sku: product.sku,
        description: 'Restore price',
        mrp: product.mrp,
        sellingPrice: product.sellingPrice,
        discount: 0
      });
      console.log(`  📉 Catalog price restored to ${product.sellingPrice}`);
    });
  });
}

module.exports = runPhase6;
