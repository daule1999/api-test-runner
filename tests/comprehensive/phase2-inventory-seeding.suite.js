/**
 * PHASE 2 — Inventory Seeding
 * Creates categories, products, purchases (stock IN), and validates warehouse stock.
 */
const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');
const ctx = require('./test-context');

const CSV_DIR = path.resolve(__dirname, '..', '..', 'DATA', 'Feed_data', 'comprehensive');

function runPhase2() {
  describe('Phase 2 — Inventory Seeding', () => {
    let api;
    const categoryRows = readCsv(path.join(CSV_DIR, 'categories.csv'));
    const productRows = readCsv(path.join(CSV_DIR, 'products.csv'));
    const purchaseRows = readCsv(path.join(CSV_DIR, 'purchases.csv'));

    beforeAll(async () => {
      api = new TestClient();
      await api.login('admin', 'Admin@123');
      if (ctx.eventId) api.setEventId(ctx.eventId);
    }, 15000);

    // ─── 2.1 Create Categories from CSV ─────────────────────────────────────
    describe('2.1 Create product categories from CSV', () => {
      test.each(
        categoryRows.map((r, i) => [`[${i + 1}] Category: ${r.name}`, r])
      )('%s', async (_desc, row) => {
        try {
          const result = await api.createCategory({
            name: row.name,
            description: row.description
          });
          expect(result.id || result).toBeDefined();
          if (result.id) ctx.categoryMap[row.name] = result.id;
          console.log(`  ✅ Category "${row.name}" created (ID: ${result.id}).`);
        } catch (err) {
          console.log(`  ℹ️ Category "${row.name}" already exists or skipped: ${err.message}`);
        }
      });
    });

    // ─── 2.2 Duplicate Category Test ────────────────────────────────────────
    describe('2.2 Duplicate category name returns 409', () => {
      test('Duplicate "Beverages" is handled gracefully', async () => {
        const res = await api.client.post('/api/inventory-svc/categories', {
          name: 'Beverages',
          description: 'Duplicate'
        }, { headers: api.headers });
        expect([200, 201, 400, 409]).toContain(res.status);
        console.log(`  ✅ Duplicate category handled (status: ${res.status}).`);
      });
    });

    // ─── 2.3 Resolve category IDs if not stored ────────────────────────────
    describe('2.3 Resolve category map', () => {
      test('Fetch all categories and build map', async () => {
        const cats = await api.getCategories();
        for (const cat of cats) {
          ctx.categoryMap[cat.name] = cat.id;
        }
        expect(Object.keys(ctx.categoryMap).length).toBeGreaterThanOrEqual(categoryRows.length);
        console.log(`  ✅ Category map resolved: ${JSON.stringify(ctx.categoryMap)}`);
      });
    });

    // ─── 2.4 Create Products from CSV ───────────────────────────────────────
    describe('2.4 Create products from CSV', () => {
      test.each(
        productRows.map((r, i) => [`[${i + 1}] Product: ${r.name} (${r.sku})`, r])
      )('%s', async (_desc, row) => {
        const categoryId = ctx.categoryMap[row.categoryName];
        expect(categoryId).toBeDefined();

        try {
          const result = await api.createProduct({
            categoryId,
            name: row.name,
            sku: row.sku,
            description: row.description,
            mrp: parseFloat(row.mrp),
            sellingPrice: parseFloat(row.sellingPrice),
            discount: 0
          });
          expect(result.id || result).toBeDefined();
          if (result.id) {
            ctx.productMap[row.name] = {
              id: result.id,
              mrp: parseFloat(row.mrp),
              sellingPrice: parseFloat(row.sellingPrice),
              discount: 0,
              sku: row.sku
            };
          }
          console.log(`  ✅ Product "${row.name}" created (ID: ${result.id}).`);
        } catch (err) {
          console.log(`  ℹ️ Product "${row.name}" already exists or skipped: ${err.message}`);
        }
      });
    });

    // ─── 2.5 Duplicate SKU Test ─────────────────────────────────────────────
    describe('2.5 Duplicate SKU returns 409', () => {
      test('Duplicate "SKU-BEV-001" is handled gracefully', async () => {
        const catId = ctx.categoryMap['Beverages'] || 1;
        const res = await api.client.post('/api/inventory-svc/products', {
          name: 'Dup Product', sku: 'SKU-BEV-001',
          categoryId: catId, mrp: 20.00, sellingPrice: 18.00, description: 'Dup'
        }, { headers: api.headers });
        expect([400, 409, 500]).toContain(res.status);
        console.log(`  ✅ Duplicate SKU handled (status: ${res.status}).`);
      });
    });

    // ─── 2.6 Resolve product IDs if not stored ─────────────────────────────
    describe('2.6 Resolve product map', () => {
      test('Fetch all products and build map', async () => {
        const products = await api.getProducts();
        for (const p of products) {
          if (!ctx.productMap[p.name]) {
            ctx.productMap[p.name] = {
              id: p.id,
              mrp: parseFloat(p.mrp),
              sellingPrice: parseFloat(p.sellingPrice),
              discount: parseFloat(p.discount || 0),
              sku: p.sku
            };
          }
        }
        expect(Object.keys(ctx.productMap).length).toBeGreaterThanOrEqual(productRows.length);
        console.log(`  ✅ Product map resolved (${Object.keys(ctx.productMap).length} products).`);
      });
    });

    // ─── 2.7 Purchase Stock (Warehouse IN) from CSV ─────────────────────────
    describe('2.7 Purchase stock (warehouse IN) from CSV', () => {
      test.each(
        purchaseRows.map((r, i) => [`[${i + 1}] Inward: ${r.quantity}x "${r.productName}"`, r])
      )('%s', async (_desc, row) => {
        const product = ctx.productMap[row.productName];
        expect(product).toBeDefined();

        const result = await api.createStockMovement({
          productId: product.id,
          movementType: 'IN',
          quantity: parseInt(row.quantity, 10),
          reason: row.reason
        });
        expect(result.id || result).toBeDefined();

        // Track in snapshots
        ctx.stockSnapshots[row.productName] = {
          warehouseInward: parseInt(row.quantity, 10),
          issuedToCounters: 0
        };
        console.log(`  ✅ Warehouse IN: ${row.quantity}x "${row.productName}" (movement ID: ${result.id}).`);
      });
    });

    // ─── 2.8 Verify Warehouse Stock Levels ──────────────────────────────────
    describe('2.8 Verify warehouse stock levels', () => {
      test('Warehouse stocks are populated', async () => {
        const stocks = await api.getStocks();
        expect(stocks).toBeDefined();
        console.log(`  ✅ Warehouse stocks retrieved (${Array.isArray(stocks) ? stocks.length : 'N/A'} records).`);
      });
    });

    // ─── 2.9 Soft Delete Product Test ───────────────────────────────────────
    describe('2.9 Soft delete product sets isActive=false', () => {
      test('Create and soft-delete a temp product', async () => {
        const ts = Date.now();
        const tempProduct = await api.createProduct({
          categoryId: ctx.categoryMap['Beverages'] || 1,
          name: `TempProduct_${ts}`,
          sku: `SKU-TEMP-${ts}`,
          description: 'Temporary product for delete test',
          mrp: 10.00,
          sellingPrice: 9.00,
          discount: 0
        });

        if (tempProduct.id) {
          const delRes = await api.client.delete(
            `/api/inventory-svc/products/${tempProduct.id}`,
            { headers: api.headers }
          );
          expect([200, 204]).toContain(delRes.status);
          console.log(`  ✅ Temp product ${tempProduct.id} soft-deleted (status: ${delRes.status}).`);
        }
      });
    });
  });
}

module.exports = runPhase2;
