const { runCsvSuite } = require('../helpers/framework');

// Exportable dynamic test suite using custom step callbacks for detailed validations
function runCustomValidationSuite() {
  runCsvSuite(
    'E2E Retail Checkouts (Granular Assertions Override)',
    'sales_test_feed.csv',
    async (row, api) => {
      console.log(`🧪 Custom Flow: Authenticating cashier "${row.username}"...`);
      
      // Step 1: Login
      const token = await api.login(row.username, row.password);
      expect(token).toBeDefined();

      // Step 2: Product mapping
      const product = await api.getProduct(row.product_name);
      expect(product.id).toBeDefined();
      expect(product.sellingPrice).toBeGreaterThan(0);

      // Step 3: Profile mapping
      const userId = await api.getUserId(row.username);
      expect(userId).toBeDefined();

      // Step 4: Shop staff allocation mapping
      const shopId = await api.getShopId(userId);
      expect(shopId).toBeDefined();

      // Step 5: Check starting stock level
      const initialStock = await api.getStock(shopId, product.id);
      expect(initialStock).toBeGreaterThanOrEqual(0);

      // Step 6: Create draft sale
      const draft = await api.createDraftSale({
        shopId,
        productId: product.id,
        productName: product.name,
        quantity: row.quantity,
        mrp: product.mrp,
        sellingPrice: product.sellingPrice,
        discount: product.discount
      });
      expect(draft.orderNumber).toBeDefined();
      expect(draft.status).toBe('CREATED');

      // Step 7: Confirm order with card/UPI split
      const grandTotal = (product.sellingPrice - product.discount) * parseInt(row.quantity, 10);
      const confirmation = await api.confirmSale(draft.orderNumber, grandTotal);
      expect(confirmation.orderNumber).toBe(draft.orderNumber);
      expect(['CONFIRMED', 'SUCCESS', 'PAID']).toContain(confirmation.status);

      // Step 8: Assert final stock decrements
      const finalStock = await api.getStock(shopId, product.id);
      const expectedStock = initialStock - parseInt(row.quantity, 10);
      expect(finalStock).toBe(expectedStock);
    }
  );
}

module.exports = runCustomValidationSuite;
