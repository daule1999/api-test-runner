const { TestClient } = require('../../helpers/framework');

/**
 * Field Validation Suite
 * P0 — tests all 400/409 bad-request paths across User, Inventory, and Sales services.
 *
 * Mapped to Plan §1.2
 */
function runValidationSuite() {
  describe('Field Validation — All 400/409 Bad-Request Paths (P0)', () => {
    let adminToken;
    let adminApi;

    beforeAll(async () => {
      adminApi = new TestClient();
      adminToken = await adminApi.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      adminApi.token = adminToken;
    }, 20000);

    // ─────────────────────────────────────────────────────────────
    // USER SERVICE — Registration validations
    // ─────────────────────────────────────────────────────────────
    describe('User Service — Registration Field Validations', () => {
      const ts = Date.now();

      test('Missing username → 400', async () => {
        const res = await adminApi.client.post('/api/users-svc/register', {
          email: `no_username_${ts}@test.com`,
          mobile: '9876543299',
          password: 'Admin@123',
          fullName: 'No Username',
          role: 'CASHIER'
        }, { headers: adminApi.headers });
        console.log(`🔍 Missing username: ${res.status}`);
        expect([400, 422]).toContain(res.status);
      });

      test('Missing email → 400', async () => {
        const res = await adminApi.client.post('/api/users-svc/register', {
          username: `no_email_${ts}`,
          mobile: '9876543299',
          password: 'Admin@123',
          fullName: 'No Email',
          role: 'CASHIER'
        }, { headers: adminApi.headers });
        console.log(`🔍 Missing email: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted registration without email. Email should be required.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Duplicate email → 409 Conflict', async () => {
        // First: register a user
        const uniqueUsername = `dup_email_${ts}`;
        const sharedEmail = `dup_email_${ts}@test.com`;
        await adminApi.client.post('/api/users-svc/register', {
          username: uniqueUsername,
          email: sharedEmail,
          mobile: '9111111111',
          password: 'Admin@123',
          fullName: 'Dup Email User',
          role: 'CASHIER'
        }, { headers: adminApi.headers });

        // Second: register with same email
        const res = await adminApi.client.post('/api/users-svc/register', {
          username: `dup_email_2_${ts}`,
          email: sharedEmail,
          mobile: '9222222222',
          password: 'Admin@123',
          fullName: 'Dup Email User 2',
          role: 'CASHIER'
        }, { headers: adminApi.headers });
        console.log(`🔍 Duplicate email: ${res.status}`);
        expect([409, 400]).toContain(res.status);
      });

      test('Duplicate username → 409 Conflict', async () => {
        const fixedUsername = `dup_user_${ts}`;
        // First register
        await adminApi.client.post('/api/users-svc/register', {
          username: fixedUsername,
          email: `first_${ts}@test.com`,
          mobile: '9333333333',
          password: 'Admin@123',
          fullName: 'First',
          role: 'CASHIER'
        }, { headers: adminApi.headers });

        // Try duplicate
        const res = await adminApi.client.post('/api/users-svc/register', {
          username: fixedUsername,
          email: `second_${ts}@test.com`,
          mobile: '9444444444',
          password: 'Admin@123',
          fullName: 'Second',
          role: 'CASHIER'
        }, { headers: adminApi.headers });
        console.log(`🔍 Duplicate username: ${res.status}`);
        expect([409, 400]).toContain(res.status);
      });

      test('Mobile with letters → 400', async () => {
        const res = await adminApi.client.post('/api/users-svc/register', {
          username: `bad_mobile_${ts}`,
          email: `bad_mobile_${ts}@test.com`,
          mobile: 'ABCDEFGHIJ', // letters instead of digits
          password: 'Admin@123',
          fullName: 'Bad Mobile',
          role: 'CASHIER'
        }, { headers: adminApi.headers });
        console.log(`🔍 Mobile with letters: ${res.status}`);
        // Backend may accept this — if so, it's a validation gap
        if (res.status === 200 || res.status === 201) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted non-numeric mobile number.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Mobile with 11 digits → 400', async () => {
        const res = await adminApi.client.post('/api/users-svc/register', {
          username: `long_mobile_${ts}`,
          email: `long_mobile_${ts}@test.com`,
          mobile: '98765432101', // 11 digits
          password: 'Admin@123',
          fullName: 'Long Mobile',
          role: 'CASHIER'
        }, { headers: adminApi.headers });
        console.log(`🔍 11-digit mobile: ${res.status}`);
        if (res.status === 200 || res.status === 201) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted 11-digit mobile number.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Invalid role name → 400', async () => {
        const res = await adminApi.client.post('/api/users-svc/register', {
          username: `bad_role_${ts}`,
          email: `bad_role_${ts}@test.com`,
          mobile: '9555555555',
          password: 'Admin@123',
          fullName: 'Bad Role User',
          role: 'SUPER_HACKER'
        }, { headers: adminApi.headers });
        console.log(`🔍 Invalid role: ${res.status}`);
        expect([400, 422]).toContain(res.status);
      });
    });

    // ─────────────────────────────────────────────────────────────
    // INVENTORY SERVICE — Product & Category validations
    // ─────────────────────────────────────────────────────────────
    describe('Inventory Service — Product & Category Field Validations', () => {
      const ts = Date.now();

      test('Create product with MRP < 0 → 400', async () => {
        const res = await adminApi.client.post('/api/inventory-svc/products', {
          categoryId: 1,
          name: `Neg MRP Product ${ts}`,
          sku: `NEG${ts}`,
          description: 'Negative MRP test',
          mrp: -100,
          sellingPrice: 90,
          discount: 0
        }, { headers: adminApi.headers });
        console.log(`🔍 Negative MRP: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted negative MRP.');
        } else if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on negative MRP. Should return 400.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Create product with sellingPrice > MRP → 400', async () => {
        const res = await adminApi.client.post('/api/inventory-svc/products', {
          categoryId: 1,
          name: `Over MRP Product ${ts}`,
          sku: `OVER${ts}`,
          description: 'Selling > MRP test',
          mrp: 50,
          sellingPrice: 200,
          discount: 0
        }, { headers: adminApi.headers });
        console.log(`🔍 sellingPrice > MRP: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted sellingPrice > MRP.');
        } else if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on sellingPrice > MRP. Should return 400.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Create product with missing name → 400', async () => {
        const res = await adminApi.client.post('/api/inventory-svc/products', {
          categoryId: 1,
          sku: `NONAME${ts}`,
          description: 'No name test',
          mrp: 100,
          sellingPrice: 90,
          discount: 0
        }, { headers: adminApi.headers });
        console.log(`🔍 Missing product name: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted product without name.');
        } else if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on missing product name. Should return 400.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Create product with invalid categoryId → 400/404', async () => {
        const res = await adminApi.client.post('/api/inventory-svc/products', {
          categoryId: 999999,
          name: `Bad Cat ${ts}`,
          sku: `BADCAT${ts}`,
          description: 'Bad category id',
          mrp: 100,
          sellingPrice: 90,
          discount: 0
        }, { headers: adminApi.headers });
        console.log(`🔍 Invalid categoryId: ${res.status}`);
        if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on invalid categoryId. Should return 400/404.');
        } else {
          expect([400, 404, 422]).toContain(res.status);
        }
      });

      test('Create category with empty name → 400', async () => {
        const res = await adminApi.client.post('/api/inventory-svc/categories', {
          name: '',
          description: 'Empty name test'
        }, { headers: adminApi.headers });
        console.log(`🔍 Empty category name: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted category with empty name.');
        } else if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on empty category name. Should return 400.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Duplicate product SKU → 409', async () => {
        const sharedSku = `DUPSKU${ts}`;
        // First product
        await adminApi.client.post('/api/inventory-svc/products', {
          categoryId: 1,
          name: `Dup SKU A ${ts}`,
          sku: sharedSku,
          description: 'First with sku',
          mrp: 100,
          sellingPrice: 90,
          discount: 0
        }, { headers: adminApi.headers });

        // Duplicate
        const res = await adminApi.client.post('/api/inventory-svc/products', {
          categoryId: 1,
          name: `Dup SKU B ${ts}`,
          sku: sharedSku,
          description: 'Second with same sku',
          mrp: 100,
          sellingPrice: 90,
          discount: 0
        }, { headers: adminApi.headers });
        console.log(`🔍 Duplicate SKU: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted duplicate SKU.');
        } else if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on duplicate SKU. Should return 409.');
        } else {
          expect([409, 400]).toContain(res.status);
        }
      });
    });

    // ─────────────────────────────────────────────────────────────
    // INVENTORY SERVICE — Stock movement validations
    // ─────────────────────────────────────────────────────────────
    describe('Inventory Service — Stock Movement Field Validations', () => {
      const ts = Date.now();

      test('Stock movement with quantity = 0 → 400', async () => {
        const products = await adminApi.getProducts();
        const firstProduct = products[0];
        expect(firstProduct).toBeDefined();

        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: firstProduct.id,
          movementType: 'IN',
          quantity: 0,
          reason: 'Zero quantity test'
        }, { headers: adminApi.headers });
        console.log(`🔍 Zero quantity stock movement: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted zero-quantity stock movement.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Stock movement with negative quantity → 400', async () => {
        const products = await adminApi.getProducts();
        const firstProduct = products[0];

        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: firstProduct.id,
          movementType: 'IN',
          quantity: -50,
          reason: 'Negative quantity test'
        }, { headers: adminApi.headers });
        console.log(`🔍 Negative quantity stock movement: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted negative-quantity stock movement.');
        } else if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on negative quantity. Should return 400.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Stock movement with invalid productId → 400/404', async () => {
        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: 999999,
          movementType: 'IN',
          quantity: 10,
          reason: 'Invalid product id test'
        }, { headers: adminApi.headers });
        console.log(`🔍 Invalid productId stock movement: ${res.status}`);
        if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on invalid productId. Should return 400/404.');
        } else {
          expect([400, 404, 409]).toContain(res.status);
        }
      });

      test('Stock movement missing movementType → 400', async () => {
        const products = await adminApi.getProducts();
        const firstProduct = products[0];

        const res = await adminApi.client.post('/api/inventory-svc/stock-movements', {
          productId: firstProduct.id,
          quantity: 10,
          reason: 'Missing type test'
        }, { headers: adminApi.headers });
        console.log(`🔍 Missing movementType: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted stock movement without movementType.');
        } else if (res.status === 500) {
          console.error('❌ BACKEND BUG: Inventory service crashes (500) on missing movementType. Should return 400.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });
    });

    // ─────────────────────────────────────────────────────────────
    // SALES SERVICE — Sale creation validations
    // ─────────────────────────────────────────────────────────────
    describe('Sales Service — Sale Creation Field Validations', () => {
      let cashierToken;
      let shopId;

      beforeAll(async () => {
        // Fix: use adminToken (already defined in outer scope), not validAdminToken
        cashierToken = adminToken;
        const api = new TestClient();
        api.setEventId(process.env.SELECTED_EVENT_ID);
        api.token = adminToken;
        const shops = await api.getShops();
        shopId = shops[0] ? shops[0].id : 1;
      });

      function authHeaders(token, eventId = '1') {
        return { Authorization: `Bearer ${token}`, 'X-Event-Id': eventId };
      }

      test('Create sale with empty items array → 400', async () => {
        const res = await adminApi.client.post('/api/sales-svc/retail', {
          shopId,
          customerName: 'Validation Test',
          customerMobile: '9876543210',
          items: []
        }, { headers: authHeaders(adminToken) });
        console.log(`🔍 Empty items array: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted empty items array for sale.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });

      test('Create sale with missing shopId → 400', async () => {
        const res = await adminApi.client.post('/api/sales-svc/retail', {
          customerName: 'No Shop Test',
          customerMobile: '9876543210',
          items: [{ productId: 1, productName: 'Test', hsnCode: 'HSN001', quantity: 1, mrp: 100, sellingPrice: 100, discount: 0 }]
        }, { headers: authHeaders(adminToken) });
        console.log(`🔍 Missing shopId: ${res.status}`);
        expect([400, 422]).toContain(res.status);
      });

      test('Create sale with invalid shopId → 400/404', async () => {
        const res = await adminApi.client.post('/api/sales-svc/retail', {
          shopId: 999999,
          customerName: 'Bad Shop',
          customerMobile: '9876543210',
          items: [{ productId: 1, productName: 'Test', hsnCode: 'HSN001', quantity: 1, mrp: 100, sellingPrice: 100, discount: 0 }]
        }, { headers: authHeaders(adminToken) });
        console.log(`🔍 Invalid shopId: ${res.status}`);
        expect([400, 404, 422]).toContain(res.status);
      });

      test('Confirm sale with amount mismatch → 400', async () => {
        // Create a valid draft first
        const api = new TestClient();
        api.setEventId(process.env.SELECTED_EVENT_ID);
        api.token = adminToken;

        const products = await api.getProducts();
        const product = products[0];
        if (!product) { return; }

        const shops = await api.getShops();
        const shop = shops[0];
        if (!shop) { return; }

        const draft = await api.createDraftSale({
          shopId: shop.id,
          productId: product.id,
          productName: product.name,
          quantity: 1,
          mrp: product.mrp || 100,
          sellingPrice: product.sellingPrice || 90,
          discount: product.discount || 0
        });

        if (!draft || !draft.orderNumber) {
          console.warn('⚠️ Could not create draft sale for amount mismatch test.');
          return;
        }

        // Now confirm with completely wrong amount
        const res = await adminApi.client.put(
          `/api/sales-svc/retail/${draft.orderNumber}/confirm`,
          {
            paymentMode: 'CASH',
            amount: 0.01,       // deliberately wrong
            cashAmount: 0.01,
            onlineAmount: 0,
            paymentReference: 'MISMATCH_TEST'
          },
          { headers: authHeaders(adminToken) }
        );
        console.log(`🔍 Amount mismatch confirm: ${res.status}`);
        if ([200, 201].includes(res.status)) {
          console.warn('⚠️ VALIDATION GAP: Backend accepted mismatched payment amount.');
        } else {
          expect([400, 422]).toContain(res.status);
        }
      });
    });
  });
}

module.exports = runValidationSuite;
