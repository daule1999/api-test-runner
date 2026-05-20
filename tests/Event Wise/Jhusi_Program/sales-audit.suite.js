const { TestClient } = require('../../../helpers/framework');
const { readCsv } = require('../../../helpers/csv-helper');
const path = require('path');

function runSalesAuditSuite() {
  describe('Postman Collection: 05: Sales Integration & Financial Audit (Data-Driven - Chunk 1)', () => {
    let eventId;
    const feedsDir = path.resolve(process.cwd(), 'DATA', 'postman_feeds');

    beforeAll(() => {
      eventId = process.env.JHUSI_EVENT_ID || '1';
    });

    // ----------------------------------------------------
    // HELPER: Dynamic Product Stock Resolver & Mitigation
    // ----------------------------------------------------
    async function resolveActiveProduct(api, shopId, preferredName, qtyRequired) {
      const shopStocks = await api.getShopStocks(shopId);
      expect(shopStocks.length).toBeGreaterThan(0);

      // 1. Try to find the preferred product with sufficient stock
      let matched = shopStocks.find(p => p.name === preferredName && parseInt(p.shopStock, 10) >= qtyRequired);

      if (matched) {
        return { product: matched, qty: qtyRequired };
      }

      // 2. If preferred product exists but has some stock (less than required), try to use it with capped quantity
      matched = shopStocks.find(p => p.name === preferredName);
      if (matched && parseInt(matched.shopStock, 10) > 0) {
        const cappedQty = Math.min(qtyRequired, parseInt(matched.shopStock, 10));
        console.log(`ℹ️ [Mitigation] Capping quantity for preferred product "${preferredName}" from ${qtyRequired} to available stock ${cappedQty}.`);
        return { product: matched, qty: cappedQty };
      }

      // 3. Fallback: Dynamically select any product in the shop's stocks that has active stock >= qtyRequired
      let fallback = shopStocks.find(p => parseInt(p.shopStock, 10) >= qtyRequired);
      if (fallback) {
        console.log(`ℹ️ [Mitigation] Preferred product "${preferredName}" is out of stock at shop ID ${shopId}. Dynamically selected fallback "${fallback.name}" (Stock: ${fallback.shopStock}) with quantity ${qtyRequired}.`);
        return { product: fallback, qty: qtyRequired };
      }

      // 4. Ultimate Fallback: Just select the first available product and cap the quantity to whatever is left
      fallback = shopStocks.find(p => parseInt(p.shopStock, 10) > 0) || shopStocks[0];
      const ultimateQty = Math.max(1, Math.min(qtyRequired, parseInt(fallback.shopStock || 0, 10)));
      console.log(`⚠️ [Ultimate Fallback] Shop ID ${shopId} is extremely low on stock. Using "${fallback.name}" with capped qty ${ultimateQty}.`);
      return { product: fallback, qty: ultimateQty };
    }

    // ----------------------------------------------------
    // CHUNK 1: FOLDER 01 - SINGLE CHECKOUT
    // ----------------------------------------------------
    describe('Folder 01: Single Item Checkout & Verification', () => {
      const csvPath = path.join(feedsDir, 'folder_01_single_checkout_feed.csv');
      const syncRows = readCsv(csvPath).slice(0, 5); // First 5 rows for validation

      test.each(
        syncRows.map((row, idx) => [`Row #${idx + 1}: ${row.username} checkout ${row.quantity}x ${row.product_name}`, row])
      )('%s', async (desc, row) => {
        const api = new TestClient();
        api.setEventId(eventId);

        // 1. Login Cashier
        await api.login(row.username, row.password);

        // 2. Fetch User & Shop IDs
        const userId = await api.getUserId(row.username);
        const shopId = await api.getShopId(userId);

        // 3. Resolve Active Product dynamically (mitigates mismatches/out-of-stock)
        const qtyToOrder = parseInt(row.quantity, 10);
        const resolved = await resolveActiveProduct(api, shopId, row.product_name, qtyToOrder);
        const product = resolved.product;
        const finalQty = resolved.qty;

        // 4. Record Initial Stock
        const initialStock = await api.getStock(shopId, product.id);

        // 5. Place Draft Sale
        const draft = await api.createDraftSale({
          shopId,
          productId: product.id,
          productName: product.name,
          quantity: finalQty,
          mrp: product.mrp,
          sellingPrice: product.sellingPrice,
          discount: product.discount
        });
        expect(draft.orderNumber).toBeDefined();

        // 6. Confirm & Settle Splitting
        const totalAmount = (product.sellingPrice - (product.discount || 0)) * finalQty;
        const confirmation = await api.confirmSale(draft.orderNumber, totalAmount);
        expect(['CONFIRMED', 'SUCCESS', 'PAID']).toContain(confirmation.status);

        // 7. Verify Stock Decremented Correctly
        const finalStock = await api.getStock(shopId, product.id);
        expect(finalStock).toBe(initialStock - finalQty);
      });
    });

    // ----------------------------------------------------
    // CHUNK 1: FOLDER 02 - MULTI CHECKOUT
    // ----------------------------------------------------
    describe('Folder 02: Multi-Item Checkout & Verification', () => {
      const csvPath = path.join(feedsDir, 'folder_02_multi_checkout_feed.csv');
      const syncRows = readCsv(csvPath).slice(0, 5);

      test.each(
        syncRows.map((row, idx) => [`Row #${idx + 1}: ${row.username} checkout Multi-Items`, row])
      )('%s', async (desc, row) => {
        const api = new TestClient();
        api.setEventId(eventId);

        await api.login(row.username, row.password);
        const userId = await api.getUserId(row.username);
        const shopId = await api.getShopId(userId);

        // Resolve two separate products dynamically with their required stock
        const qtyA = parseInt(row.qty_a, 10);
        const qtyB = parseInt(row.qty_b, 10);

        const resolvedA = await resolveActiveProduct(api, shopId, row.product_name_a || 'ProductA', qtyA);
        const prodA = resolvedA.product;
        const finalQtyA = resolvedA.qty;

        // Resolve product B ensuring it is different from A
        const shopStocks = await api.getShopStocks(shopId);
        const otherStocks = shopStocks.filter(p => p.id.toString() !== prodA.id.toString());
        
        let prodB = otherStocks.find(p => parseInt(p.shopStock, 10) >= qtyB) || otherStocks[0] || prodA;
        let finalQtyB = Math.max(1, Math.min(qtyB, parseInt(prodB.shopStock || 0, 10)));

        const initialStockA = await api.getStock(shopId, prodA.id);
        const initialStockB = await api.getStock(shopId, prodB.id);

        const draft = await api.createDraftSale({
          shopId,
          items: [
            {
              productId: prodA.id,
              productName: prodA.name,
              hsnCode: 'HSN-000',
              quantity: finalQtyA,
              mrp: parseFloat(prodA.sellingPrice),
              sellingPrice: parseFloat(prodA.sellingPrice),
              discount: 0
            },
            {
              productId: prodB.id,
              productName: prodB.name,
              hsnCode: 'HSN-001',
              quantity: finalQtyB,
              mrp: parseFloat(prodB.sellingPrice),
              sellingPrice: parseFloat(prodB.sellingPrice),
              discount: 0
            }
          ]
        });
        expect(draft.orderNumber).toBeDefined();

        const totalAmount = (parseFloat(prodA.sellingPrice) * finalQtyA) + (parseFloat(prodB.sellingPrice) * finalQtyB);
        const confirmation = await api.confirmSale(draft.orderNumber, totalAmount);
        expect(['CONFIRMED', 'SUCCESS', 'PAID']).toContain(confirmation.status);

        const finalStockA = await api.getStock(shopId, prodA.id);
        const finalStockB = await api.getStock(shopId, prodB.id);

        expect(finalStockA).toBe(initialStockA - finalQtyA);
        // Assert stock B only if B is a separate product from A
        if (prodA.id.toString() !== prodB.id.toString()) {
          expect(finalStockB).toBe(initialStockB - finalQtyB);
        }
      });
    });

    // ----------------------------------------------------
    // CHUNK 1: FOLDER 03 - PARTIAL RETURNS (DURABLE & DYNAMIC)
    // ----------------------------------------------------
    describe('Folder 03: Partial Returns Verification', () => {
      const csvPath = path.join(feedsDir, 'folder_03_partial_return_feed.csv');
      const syncRows = readCsv(csvPath).slice(0, 5);

      test.each(
        syncRows.map((row, idx) => [`Row #${idx + 1}: ${row.username} checkout & Partial Return`, row])
      )('%s', async (desc, row) => {
        const api = new TestClient();
        api.setEventId(eventId);

        await api.login(row.username, row.password);
        const userId = await api.getUserId(row.username);
        const shopId = await api.getShopId(userId);

        // Supports BOTH:
        // 1) Explicit mode (product_name_a, qty_a, product_name_b, qty_b, return_product_name, return_qty)
        // 2) Abstract mode (qty_a, qty_b, partial_return_qty)
        const qtyA = parseInt(row.qty_a || row.quantity, 10);
        const qtyB = row.qty_b !== undefined ? parseInt(row.qty_b, 10) : 0;
        const returnQty = parseInt(row.partial_return_qty || row.return_qty, 10);

        const resolvedA = await resolveActiveProduct(api, shopId, row.product_name_a || row.product_name || 'ProductA', qtyA);
        const prodA = resolvedA.product;
        const finalQtyA = resolvedA.qty;

        let prodB = null;
        let finalQtyB = 0;

        if (qtyB > 0) {
          const resolvedB = await resolveActiveProduct(api, shopId, row.product_name_b || 'ProductB', qtyB);
          prodB = resolvedB.product;
          finalQtyB = resolvedB.qty;
        }

        const initialStockA = await api.getStock(shopId, prodA.id);
        const initialStockB = prodB ? await api.getStock(shopId, prodB.id) : 0;

        // Place Sale
        const itemsToSell = [
          {
            productId: prodA.id,
            productName: prodA.name,
            hsnCode: 'HSN-000',
            quantity: finalQtyA,
            mrp: parseFloat(prodA.sellingPrice),
            sellingPrice: parseFloat(prodA.sellingPrice),
            discount: 0
          }
        ];

        if (prodB && finalQtyB > 0) {
          itemsToSell.push({
            productId: prodB.id,
            productName: prodB.name,
            hsnCode: 'HSN-001',
            quantity: finalQtyB,
            mrp: parseFloat(prodB.sellingPrice),
            sellingPrice: parseFloat(prodB.sellingPrice),
            discount: 0
          });
        }

        const draft = await api.createDraftSale({ shopId, items: itemsToSell });
        const totalAmount = (parseFloat(prodA.sellingPrice) * finalQtyA) + (prodB ? parseFloat(prodB.sellingPrice) * finalQtyB : 0);
        await api.confirmSale(draft.orderNumber, totalAmount);

        // Verify stock drops
        let currentStockA = await api.getStock(shopId, prodA.id);
        expect(currentStockA).toBe(initialStockA - finalQtyA);

        // Resolve which product is being returned (default to prodA)
        let returnProd = prodA;
        if (row.return_product_name && prodB && row.return_product_name === prodB.name) {
          returnProd = prodB;
        }

        // Cap return quantity to the sold quantity to prevent illegal return exceptions
        const maxReturnable = returnProd.id === prodA.id ? finalQtyA : finalQtyB;
        const finalReturnQty = Math.min(returnQty, maxReturnable);

        console.log(`🚀 Performing Partial Return: Returning ${finalReturnQty} of "${returnProd.name}"`);

        // Perform return
        const returned = await api.returnSale(draft.orderNumber, {
          reason: 'Dynamic partial return',
          items: [{
            productId: returnProd.id,
            productName: returnProd.name,
            quantity: finalReturnQty,
            unitPrice: parseFloat(returnProd.sellingPrice)
          }]
        });
        expect(returned).toBeDefined();

        // Verify return stock impacts
        const finalStockA = await api.getStock(shopId, prodA.id);
        const finalStockB = prodB ? await api.getStock(shopId, prodB.id) : 0;

        if (returnProd.id === prodA.id) {
          expect(finalStockA).toBe(currentStockA + finalReturnQty);
          if (prodB && prodA.id !== prodB.id) {
            expect(finalStockB).toBe(initialStockB - finalQtyB);
          }
        } else {
          expect(finalStockB).toBe((initialStockB - finalQtyB) + finalReturnQty);
          expect(finalStockA).toBe(currentStockA);
        }
      });
    });

    // ----------------------------------------------------
    // CHUNK 1: FOLDER 04 - FULL CANCELLATIONS
    // ----------------------------------------------------
    describe('Folder 04: Full Cancellations Verification', () => {
      const csvPath = path.join(feedsDir, 'folder_04_full_cancellation_feed.csv');
      const syncRows = readCsv(csvPath).slice(0, 5);

      test.each(
        syncRows.map((row, idx) => [`Row #${idx + 1}: ${row.username} checkout & Cancellation`, row])
      )('%s', async (desc, row) => {
        const api = new TestClient();
        api.setEventId(eventId);

        await api.login(row.username, row.password);
        const userId = await api.getUserId(row.username);
        const shopId = await api.getShopId(userId);

        const qtyA = parseInt(row.qty_a, 10);
        const qtyB = parseInt(row.qty_b, 10);

        const resolvedA = await resolveActiveProduct(api, shopId, 'ProductA', qtyA);
        const prodA = resolvedA.product;
        const finalQtyA = resolvedA.qty;

        const shopStocks = await api.getShopStocks(shopId);
        const otherStocks = shopStocks.filter(p => p.id.toString() !== prodA.id.toString());
        const prodB = otherStocks.find(p => parseInt(p.shopStock, 10) >= qtyB) || otherStocks[0] || prodA;
        const finalQtyB = Math.max(1, Math.min(qtyB, parseInt(prodB.shopStock || 0, 10)));

        const initialStockA = await api.getStock(shopId, prodA.id);
        const initialStockB = await api.getStock(shopId, prodB.id);

        // Place Sale
        const draft = await api.createDraftSale({
          shopId,
          items: [
            {
              productId: prodA.id,
              productName: prodA.name,
              hsnCode: 'HSN-000',
              quantity: finalQtyA,
              mrp: parseFloat(prodA.sellingPrice),
              sellingPrice: parseFloat(prodA.sellingPrice),
              discount: 0
            },
            {
              productId: prodB.id,
              productName: prodB.name,
              hsnCode: 'HSN-001',
              quantity: finalQtyB,
              mrp: parseFloat(prodB.sellingPrice),
              sellingPrice: parseFloat(prodB.sellingPrice),
              discount: 0
            }
          ]
        });

        const totalAmount = (parseFloat(prodA.sellingPrice) * finalQtyA) + (parseFloat(prodB.sellingPrice) * finalQtyB);
        await api.confirmSale(draft.orderNumber, totalAmount);

        // Cancel order
        const cancellation = await api.cancelSale(draft.orderNumber, 'Declarative cancellation');
        expect(cancellation).toBeDefined();

        // Verify stocks fully revert
        const finalStockA = await api.getStock(shopId, prodA.id);
        const finalStockB = await api.getStock(shopId, prodB.id);

        expect(finalStockA).toBe(initialStockA);
        if (prodA.id.toString() !== prodB.id.toString()) {
          expect(finalStockB).toBe(initialStockB);
        }
      });
    });
  });
}

module.exports = runSalesAuditSuite;
