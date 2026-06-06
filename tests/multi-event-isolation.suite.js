const { TestClient } = require('../helpers/framework');

function runMultiEventIsolationSuite() {
  describe('Event Tenant Isolation Security Suite', () => {
    let adminToken;
    let event1, event2;
    let cashier1, cashier2;
    let shop1, shop2;
    let adminApi;

    beforeAll(async () => {
      adminApi = new TestClient();
      console.log('🧪 Logging in as admin to prepare isolation test resources...');
      adminToken = await adminApi.login('admin', 'Admin@123');
      adminApi.token = adminToken;

      const time = Date.now();

      // 1. Create two distinct events
      console.log('🚀 Creating isolation event 1...');
      event1 = await adminApi.createEvent({
        eventName: `Isolation Event Alpha ${time}`,
        eventType: 'MELA',
        description: 'Multi-Event Isolation Test 1',
        location: 'Zone A',
        startDate: '2026-01-01T00:00:00',
        endDate: '2026-12-31T23:59:59',
        isActive: true
      });
      expect(event1.id).toBeDefined();
      console.log(`✅ Event 1 created with ID: ${event1.id}`);

      console.log('🚀 Creating isolation event 2...');
      event2 = await adminApi.createEvent({
        eventName: `Isolation Event Beta ${time}`,
        eventType: 'MELA',
        description: 'Multi-Event Isolation Test 2',
        location: 'Zone B',
        startDate: '2026-01-01T00:00:00',
        endDate: '2026-12-31T23:59:59',
        isActive: true
      });
      expect(event2.id).toBeDefined();
      console.log(`✅ Event 2 created with ID: ${event2.id}`);

      // 2. Register Cashier 1 and Cashier 2
      console.log('🚀 Registering Cashier 1 and Cashier 2...');
      cashier1 = await adminApi.registerUser({
        username: `c1_iso_${time}`,
        email: `c1_iso_${time}@example.com`,
        mobile: `911${time.toString().slice(-7)}`,
        password: 'Cashier@123',
        fullName: 'Cashier One Isolation',
        role: 'CASHIER'
      });
      expect(cashier1.username).toBeDefined();

      cashier2 = await adminApi.registerUser({
        username: `c2_iso_${time}`,
        email: `c2_iso_${time}@example.com`,
        mobile: `922${time.toString().slice(-7)}`,
        password: 'Cashier@123',
        fullName: 'Cashier Two Isolation',
        role: 'CASHIER',
        eventId: event1.id
      });
      expect(cashier2.username).toBeDefined();

      // 3. Assign Cashier 1 to Event 1, and Cashier 2 to Event 2
      console.log('🚀 Assigning Cashier 1 -> Event 1 and Cashier 2 -> Event 2...');
      await adminApi.updateUserRole({ username: cashier2.username, roleIds: [roleIds], eventId: event2.id });

      // 4. Set up Shop Counters scoped to respective Events
      console.log('🚀 Registering Shop 1 for Event 1...');
      adminApi.setEventId(event1.id);
      shop1 = await adminApi.registerShop({
        shopName: `Counter Alpha ${time}`,
        categoryId: 1,
        counterNumber: 1,
        isActive: true
      });
      expect(shop1.id).toBeDefined();

      console.log('🚀 Assigning Cashier 1 to Shop 1...');
      const cashier1Profile = await adminApi.getUser(cashier1.username);
      await adminApi.assignStaff({
        shopId: shop1.id,
        userId: cashier1Profile.id,
        roleCode: 'CASHIER'
      });

      console.log('🚀 Registering Shop 2 for Event 2...');
      adminApi.setEventId(event2.id);
      shop2 = await adminApi.registerShop({
        shopName: `Counter Beta ${time}`,
        categoryId: 1,
        counterNumber: 2,
        isActive: true
      });
      expect(shop2.id).toBeDefined();

      console.log('🚀 Assigning Cashier 2 to Shop 2...');
      const cashier2Profile = await adminApi.getUser(cashier2.username);
      await adminApi.assignStaff({
        shopId: shop2.id,
        userId: cashier2Profile.id,
        roleCode: 'CASHIER'
      });
    }, 35000);

    describe('Cross-Event Access Verification Checks', () => {
      let cashier1Client;
      let cashier2Client;

      beforeAll(async () => {
        cashier1Client = new TestClient();
        await cashier1Client.login(cashier1.username, 'Cashier@123');

        cashier2Client = new TestClient();
        await cashier2Client.login(cashier2.username, 'Cashier@123');
      });

      test('Cashier 1 can query counter stocks for their assigned Event 1', async () => {
        cashier1Client.setEventId(event1.id);
        const stocks = await cashier1Client.getShopStocks(shop1.id);
        expect(Array.isArray(stocks)).toBe(true);
      });

      test('Cashier 1 is blocked from querying counter stocks of Shop 2 (Event 2)', async () => {
        // Attack: query shop counter stock in event 2 (which Cashier 1 has no access to)
        cashier1Client.setEventId(event2.id);
        const res = await cashier1Client.client.get(`/api/sales-svc/retail/stocks/${shop2.id}`, {
          headers: cashier1Client.headers
        });
        // Since cashier1 has no assignment to event2, sales-service should return empty list or 403
        // Let's assert either an error or empty array of stocks
        if (res.status === 200) {
          expect(res.data).toEqual([]);
        } else {
          expect([400, 401, 403, 404]).toContain(res.status);
        }
      });

      test('Cashier 1 cannot create checkout order for Shop 2 (Event 2)', async () => {
        cashier1Client.setEventId(event2.id);
        const body = {
          shopId: shop2.id,
          customerName: 'Illegal Checkout',
          customerMobile: '9999900000',
          items: [{ productId: 1, productName: 'Test Book', hsnCode: 'HSN-001', quantity: 1, mrp: 100, sellingPrice: 100, discount: 0 }]
        };

        const res = await cashier1Client.client.post('/api/sales-svc/retail', body, {
          headers: cashier1Client.headers
        });
        // The backend should return bad request / validation failure / unauthorized since Shop 2 is outside Event 1
        expect([400, 401, 403, 500]).toContain(res.status);
      });

      test('Cashier 2 can access their assigned Shop 2 (Event 2)', async () => {
        cashier2Client.setEventId(event2.id);
        const stocks = await cashier2Client.getShopStocks(shop2.id);
        expect(Array.isArray(stocks)).toBe(true);
      });
    });
  });
}

module.exports = runMultiEventIsolationSuite;
