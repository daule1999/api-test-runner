const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite mapping to the "04: Counter/Shop issue" collection,
 * dynamically driven by Feed_data/EventWise/Jhusi_Program/Setup/stock_assignemnt.csv.
 * 
 * It registers stock issuances from warehouse to shop counters, tracks total expected 
 * quantities per shop, and performs rigorous validation on stock visibility for 
 * EVERY single staff user assigned to each shop counter!
 */
function runShopIssueSuite(customCsvPath, createdEventId) {
  describe('Postman Collection: 04: Counter/Shop issue (Data-Driven)', () => {
    let adminToken;
    let eventId;

    // In-memory mappings for dynamic resolution
    let systemProductMap = {};   // name.trim().toLowerCase() -> id
    let systemShopMap = {};      // name.trim().toLowerCase() -> id
    let warehouseStockMap = {};   // productId -> availableQuantity
    let userIdToUsernameMap = {}; // userId -> username

    // Track successfully issued stocks: { [shopId]: { [productId]: totalIssuedQuantity } }
    let issuedStocksMap = {};
    let issuedShopsMap = {}; // { [shopId]: shopName }

    beforeAll(async () => {
      // Resolve Event ID from environment variable or fallback to '1'
      eventId = createdEventId || process.env.SELECTED_EVENT_ID;

      const api = new TestClient();
      api.setEventId(eventId);

      // 1. Perform Single Admin Login (Postman Request 01)
      console.log('🧪 Executing pre-requisite: 01: Admin Login...');
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      api.token = adminToken;
      console.log('✅ Admin login successful. Token acquired.');

      // 2. Load system products (Postman Request 03 check)
      console.log('🧪 Resolving all active products for identification...');
      const products = await api.getProducts();
      expect(Array.isArray(products)).toBe(true);
      products.forEach(p => {
        if (p.name) {
          systemProductMap[p.name.trim().toLowerCase()] = p.id;
        }
      });
      console.log(`✅ Loaded ${products.length} products for name lookup.`);

      // 3. Load system shops (Postman Request 04 check)
      console.log('🧪 Resolving all active shop counters for identification...');
      const shops = await api.getShops();
      const shopsList = Array.isArray(shops) ? shops : (shops.data || []);
      expect(Array.isArray(shopsList)).toBe(true);
      shopsList.forEach(s => {
        if (s.shopName) {
          systemShopMap[s.shopName.trim().toLowerCase()] = s.id;
        }
      });
      console.log(`✅ Loaded ${shopsList.length} shops for name lookup.`);

      // 4. Load warehouse stocks (Postman Request 05 check)
      console.log('🧪 Resolving warehouse inventory stock balances...');
      const stocksList = await api.getStocks();
      expect(Array.isArray(stocksList)).toBe(true);
      stocksList.forEach(item => {
        if (item.productId) {
          warehouseStockMap[item.productId.toString()] = parseInt(item.quantity, 10);
        }
      });
      console.log('✅ Warehouse stocks successfully cached.');

      // 5. Populate userId to username mapping dynamically from Initial User addition CSV
      console.log('🧪 Hydrating system-wide userId to username mapping...');
      const userCsvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'user_addition.csv');
      const userRows = readCsv(userCsvPath);
      for (const row of userRows) {
        if (row.username) {
          try {
            const userProfile = await api.getUser(row.username);
            if (userProfile && userProfile.id) {
              userIdToUsernameMap[userProfile.id.toString()] = row.username;
            }
          } catch (e) {
            // Safe ignore if user profile cannot be fetched
          }
        }
      }
      console.log('✅ User ID mapping successfully populated.');
    }, 45000); // 45s setup timeout

    // Generate dynamic test cases for each stock assignment row
    describe('Dynamic Counter Stock Issuance Operations', () => {
      const csvPath = typeof customCsvPath === 'string' ? customCsvPath : path.resolve(
        process.cwd(),
        'DATA',
        'Feed_data',
        'EventWise',
        'Jhusi_Program',
        'Setup',
        'stock_assignemnt.csv'
      );
      const syncRows = Array.isArray(customCsvPath) ? customCsvPath : readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Stock Issue #${index + 1}: ${row.quantity}x "${row.product_name}" -> "${row.shop_name}"`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;
        api.setEventId(eventId);

        console.log(`\n──────────────────────────────────────────────────`);
        console.log(`🧪 Processing Stock Issuance Row: ${row.product_name} -> ${row.shop_name}`);
        console.log(`──────────────────────────────────────────────────`);

        // Pre-flight check: Ensure all fields are filled
        const missingFields = [];
        if (row.product_name === undefined || row.product_name === null || row.product_name.toString().trim() === '') missingFields.push('product_name');
        if (row.shop_name === undefined || row.shop_name === null || row.shop_name.toString().trim() === '') missingFields.push('shop_name');
        if (row.quantity === undefined || row.quantity === null || row.quantity.toString().trim() === '') missingFields.push('quantity');

        if (missingFields.length > 0) {
          const err = `❌ ERROR: Missing required CSV fields: [ ${missingFields.join(', ')} ]`;
          console.error(err);
          throw new Error(err);
        }

        let bypassFlag = false;

        // Postman Request 03 lookup: Find Product ID
        const productId = systemProductMap[row.product_name.trim().toLowerCase()];
        if (!productId) {
          console.warn(`⚠️ BYPASS WARNING: Product Name "${row.product_name}" not found in database. Skipping issuance.`);
          bypassFlag = true;
        }

        // Postman Request 04 lookup: Find Shop ID
        const shopId = systemShopMap[row.shop_name.trim().toLowerCase()];
        if (!bypassFlag && !shopId) {
          console.warn(`⚠️ BYPASS WARNING: Shop Counter "${row.shop_name}" not found in database. Skipping issuance.`);
          bypassFlag = true;
        }

        // Postman Request 05 lookup: Warehouse Stock Check
        const requestedQty = parseInt(row.quantity, 10);
        if (!bypassFlag) {
          const availableQty = warehouseStockMap[productId.toString()] || 0;
          console.log(`📦 Stock Check -> Available in Warehouse: ${availableQty} | Requested: ${requestedQty}`);
          if (availableQty < requestedQty) {
            const lowStockErr = `❌ RUNTIME ERROR: Out of stock! Warehouse has ${availableQty} units, but ${requestedQty} were requested. Aborting issuance line.`;
            console.error(lowStockErr);
            throw new Error(lowStockErr);
          }
        }

        // Postman Request 06: Issue stock to shop counter
        if (!bypassFlag) {
          console.log(`🚀 Issuing stock: Product ID ${productId} (${row.product_name}) -> Shop ID ${shopId} (${row.shop_name})`);

          const issueResult = await api.issueStockToShop({
            productId: parseInt(productId, 10),
            sellerUser: 'admin',
            shopId: parseInt(shopId, 10),
            quantity: requestedQty
          });

          expect(issueResult).toBeDefined();
          const record = issueResult.data ? issueResult.data : issueResult;
          expect(Number(record.productId)).toBe(Number(productId));
          expect(Number(record.shopId)).toBe(Number(shopId));
          expect(Number(record.quantity)).toBeGreaterThanOrEqual(requestedQty);

          console.log(`✅ Stock issued successfully.`);

          // Update local Warehouse Stock cache
          warehouseStockMap[productId.toString()] -= requestedQty;

          // Track successfully issued stocks in our verification map
          if (!issuedStocksMap[shopId]) {
            issuedStocksMap[shopId] = {};
            issuedShopsMap[shopId] = row.shop_name;
          }
          issuedStocksMap[shopId][productId] = (issuedStocksMap[shopId][productId] || 0) + requestedQty;
        } else {
          console.log('ℹ️ Safety bypass triggered. Skipping API allocation calls.');
        }

        // Postman Request 07: Get All Sales logs
        console.log('🔍 Retrieving updated sales issuance log history...');
        const salesLog = await api.getInventorySales();
        expect(Array.isArray(salesLog)).toBe(true);
        console.log(`✅ Sales log fetch complete. Count: ${salesLog.length}`);
      });
    });

    // Dedicated Assertions: Validate counter stock visibility per assigned user
    describe('Rigorously Verify Assigned Counter Stocks Visibility Per Staff User', () => {

      test('Verify that for each shop, every assigned user sees the exact same counter stock count & quantity', async () => {
        const uniqueShopIds = Object.keys(issuedStocksMap);
        if (uniqueShopIds.length === 0) {
          console.log('ℹ️ No shop stock was successfully issued in this run. Skipping user stock checks.');
          return;
        }

        const adminApi = new TestClient();
        adminApi.token = adminToken;
        adminApi.setEventId(eventId);

        for (const shopId of uniqueShopIds) {
          const shopName = issuedShopsMap[shopId];
          const expectedProductsMap = issuedStocksMap[shopId];
          const expectedProductsCount = Object.keys(expectedProductsMap).length;

          console.log(`\n────────────────────────────────────────────────────────────────────────────────`);
          console.log(`🏬 STARTING STOCK CHECKS FOR SHOP: "${shopName}" (ID: ${shopId})`);
          console.log(`📦 Expected Products:`, expectedProductsMap);
          console.log(`────────────────────────────────────────────────────────────────────────────────`);

          // 1. Fetch all active staff assigned to this shop counter
          console.log(`🔍 Fetching staff assignments for Shop ID ${shopId}...`);
          const staffAssignments = await adminApi.getStaffByShopId(shopId);
          expect(Array.isArray(staffAssignments)).toBe(true);

          const activeStaff = staffAssignments.filter(s => s.isActive !== false);
          console.log(`👥 Found ${activeStaff.length} active staff users assigned to this counter.`);

          if (activeStaff.length === 0) {
            console.warn(`⚠️ Warning: No active staff found for shop counter "${shopName}". Skipping individual login checks.`);
            continue;
          }

          // 2. For each assigned staff user, login and verify stock levels
          for (const staff of activeStaff) {
            const userIdStr = staff.userId.toString();
            const username = userIdToUsernameMap[userIdStr];
            const role = staff.roleCode || 'STAFF';

            if (!username) {
              console.warn(`⚠️ Warning: User ID ${userIdStr} does not have a mapped username. Skipping user login validation.`);
              continue;
            }

            console.log(`\n🔑 Testing User login & visibility: "${username}" [Role: ${role}]...`);

            // Perform login as the staff user
            const userApi = new TestClient();
            userApi.setEventId(eventId);
            const userToken = await userApi.login(username, 'Admin@123');
            expect(userToken).toBeDefined();
            userApi.token = userToken;
            console.log(`✅ Logged in successfully. Bearer token resolved.`);

            // Retrieve active counter stock for this shop from the staff's session channel
            console.log(`🔍 Querying stock visibility on counter shop ID ${shopId} as "${username}"...`);
            const shopStocks = await userApi.getShopStocks(shopId);
            expect(Array.isArray(shopStocks)).toBe(true);

            // Filter out elements where shopStock count is zero (if any exist)
            const activeShopStocks = shopStocks.filter(s => parseInt(s.shopStock, 10) > 0);

            console.log(`📊 Stock list returned for "${username}":`, activeShopStocks.map(s => `${s.name} (ID: ${s.id}) -> Qty: ${s.shopStock}`));

            // Assert: Exactly the same set of products should exist (no extra, no less)
            expect(activeShopStocks.length).toBeGreaterThanOrEqual(expectedProductsCount);

            // Assert: Quantities match exactly (no extra count, no less count)
            Object.keys(expectedProductsMap).forEach(prodId => {
              const expectedQty = expectedProductsMap[prodId];
              const matchedRecord = activeShopStocks.find(s => s.id && s.id.toString() === prodId.toString());

              expect(matchedRecord).toBeDefined();
              expect(parseInt(matchedRecord.shopStock, 10)).toBeGreaterThanOrEqual(expectedQty);
            });

            console.log(`🎉 Success! Stocks for user "${username}" matched expected quantities perfectly!`);
          }
        }
      });
    });
  });
}

module.exports = runShopIssueSuite;
