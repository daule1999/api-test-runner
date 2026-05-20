const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite mapping to the "04: Products" Postman Collection,
 * powered dynamically by Feed_data/product_addition.csv!
 */
function runProductsSuite() {
  describe('Postman Collection: 04: Products (Data-Driven)', () => {
    let adminToken;
    let systemCategoryMap = {};
    let skuMaxTracker = {};

    beforeAll(async () => {
      // 1. Perform Single Admin Login (Postman Request 01)
      const api = new TestClient();
      console.log('🧪 Executing pre-requisite: 01: Admin Login...');
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      console.log('✅ Admin login successful. Token acquired.');

      // 2. Extract Category Map (Postman Request 02)
      api.token = adminToken;
      console.log('🧪 Executing pre-requisite: 02: Get All Categories...');
      const categories = await api.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      categories.forEach(cat => {
        if (cat.name) {
          systemCategoryMap[cat.name.trim().toLowerCase()] = cat.id;
        }
      });
      console.log('✅ Hydrated Category Map successfully.');

      // 3. Hydrate SKU Seed Base Map (Postman Request 03)
      console.log('🧪 Executing pre-requisite: 03: Get All Products (SKU Hydration)...');
      const products = await api.getProducts();
      expect(Array.isArray(products)).toBe(true);

      const skuParserRegex = /^([a-zA-Z_\-]+)(\d+)$/;
      products.forEach(product => {
        if (product.sku) {
          const match = product.sku.trim().match(skuParserRegex);
          if (match) {
            const prefix = match[1].toLowerCase();
            const sequenceNum = parseInt(match[2], 10);
            if (!skuMaxTracker[prefix] || sequenceNum > skuMaxTracker[prefix]) {
              skuMaxTracker[prefix] = sequenceNum;
            }
          }
        }
      });
      console.log('✅ Hydrated SKU Seed Base Map from DB catalog successfully:', skuMaxTracker);
    }, 30000); // 30s timeout

    // Generate dynamic test cases for each product in the CSV file
    describe('Dynamic Product Setup Pipeline', () => {
      const csvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'product_addition.csv');
      const syncRows = readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Product #${index + 1}: ${row.csv_name} [${row.csv_categoryShortName}]`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;

        console.log(`\n──────────────────────────────────────────────────`);
        console.log(`🧪 Starting Pipeline for Product: ${row.csv_name}`);
        console.log(`──────────────────────────────────────────────────`);

        // 1. Resolve Category ID dynamically
        const lookUpName = row.csv_categoryName.trim().toLowerCase();
        const categoryId = systemCategoryMap[lookUpName];
        if (!categoryId) {
          throw new Error(`❌ ERROR: Category "${row.csv_categoryName}" does not exist in the database map.`);
        }

        // 2. Pre-flight Financial Equation Validation (MRP = SellingPrice + Discount)
        const mrp = Number(row.csv_mrp);
        const sellingPrice = Number(row.csv_sellingPrice);
        const discount = Number(row.csv_discount);

        if (mrp !== (sellingPrice + discount)) {
          throw new Error(`❌ ERROR: Financial Integrity Equation Violated! Expected MRP (${mrp}) to equal SellingPrice (${sellingPrice}) + Discount (${discount}). Calculated sum: ${sellingPrice + discount}.`);
        }

        // 3. Smart Isolated SKU Generation Engine
        const shortPrefixRaw = row.csv_categoryShortName.trim().replace(/\s+/g, '');
        const prefixKey = shortPrefixRaw.toLowerCase();

        const currentMaxCounter = skuMaxTracker[prefixKey] !== undefined ? parseInt(skuMaxTracker[prefixKey], 10) : 0;
        const nextCounterValue = currentMaxCounter + 1;

        // Write back updated counter state to keep consecutive runs unique
        skuMaxTracker[prefixKey] = nextCounterValue;

        const paddedCounter = ("0000" + nextCounterValue).slice(-4);
        const generatedSku = shortPrefixRaw + paddedCounter;
        console.log(`🚀 Computed Collide-Free SKU: ${generatedSku}`);

        // 4. Idempotency Check: Query existing products to see if already registered
        let productId;
        let alreadyExists = false;
        let activeSku = generatedSku;

        try {
          const catalog = await api.getProducts();
          const match = catalog.find(
            p => p.name && p.name.trim().toLowerCase() === row.csv_name.trim().toLowerCase()
          );
          if (match) {
            alreadyExists = true;
            productId = match.id;
            activeSku = match.sku;
            console.log(`⚠️ Product "${row.csv_name}" already exists in system with ID ${productId} and SKU ${activeSku}. Skipping creation.`);
          }
        } catch (err) {
          console.warn('⚠️ Warning: Failed to run duplicate check. Proceeding with creation...', err.message);
        }

        // Postman Step 04: Create Product
        if (!alreadyExists) {
          console.log(`🚀 Registering new product: "${row.csv_name}"...`);
          const createdProduct = await api.createProduct({
            categoryId,
            name: row.csv_name,
            sku: generatedSku,
            description: row.csv_description,
            mrp,
            sellingPrice,
            discount
          });

          expect(createdProduct).toBeDefined();
          expect(createdProduct.name).toBe(row.csv_name);
          expect(createdProduct.sku).toBe(generatedSku);
          expect(Number(createdProduct.categoryId)).toBe(Number(categoryId));

          // Validate returned financial fields
          expect(Number(createdProduct.mrp)).toBe(mrp);
          expect(Number(createdProduct.sellingPrice)).toBe(sellingPrice);
          expect(Number(createdProduct.discount)).toBe(discount);

          productId = createdProduct.id;
          console.log(`✅ Product "${row.csv_name}" created successfully with ID ${productId}.`);
        }

        // Postman Step 05: Get Product by id (Persistency Check)
        console.log(`🔍 Querying product by ID ${productId} to verify details...`);
        const persistProduct = await api.getProductById(productId);

        expect(persistProduct).toBeDefined();
        expect(persistProduct.id.toString()).toBe(productId.toString());
        expect(persistProduct.sku).toBe(activeSku);
        expect(persistProduct.name).toBe(row.csv_name);

        if (persistProduct.isActive !== null && persistProduct.isActive !== undefined) {
          expect(persistProduct.isActive).toBe(true);
        }

        // Persistent Financial Integrity Equation check
        const finalMrp = Number(persistProduct.mrp);
        const finalSellingPrice = Number(persistProduct.sellingPrice);
        const finalDiscount = Number(persistProduct.discount);
        expect(finalMrp).toBe(finalSellingPrice + finalDiscount);

        console.log(`🎉 Verification passed: Product details and financial integrity validated perfectly.`);
      });
    });
  });
}

module.exports = runProductsSuite;
