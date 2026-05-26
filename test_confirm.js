const axios = require('axios');

async function testConfirm() {
  const client = axios.create({
    baseURL: 'http://localhost:8090',
    validateStatus: () => true
  });

  console.log('Logging in...');
  const loginRes = await client.post('/api/auth-svc/login', {
    username: 'arjun_csh',
    password: 'Admin@123'
  });
  console.log('Login status:', loginRes.status);
  const token = loginRes.data.accessToken;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Event-Id': '1'
  };

  // Get shop ID for cashier
  console.log('Fetching shop assignment...');
  const userProfileRes = await client.get('/api/users-svc/arjun_csh', { headers });
  console.log('Profile:', userProfileRes.data);
  const userId = userProfileRes.data.id;

  const staffRes = await client.get(`/api/sales-svc/shops-staff/user/${userId}`, { headers });
  console.log('Staff assignment:', staffRes.data);
  const shopId = staffRes.data[0].shopId;

  // 1. Create a draft order
  console.log('Creating draft order...');
  const draftRes = await client.post('/api/sales-svc/retail', {
    shopId: parseInt(shopId, 10),
    customerName: 'Test customer',
    customerMobile: '9999988888',
    items: [
      {
        productId: 1, // Special Chyawanprash
        productName: 'Special Chyawanprash',
        hsnCode: 'HSN-1234',
        quantity: 1,
        mrp: 200.00,
        sellingPrice: 200.00,
        discount: 0.00
      }
    ]
  }, { headers });
  console.log('Draft order response:', draftRes.status, draftRes.data);
  const orderNumber = draftRes.data.orderNumber;

  // Let's test the inventory-service endpoints directly!
  console.log('Testing inventory-service/api/inventory-svc/sales...');
  const invSalesRes = await client.get('/api/inventory-svc/sales', { headers });
  console.log('Inventory sales status:', invSalesRes.status, JSON.stringify(invSalesRes.data).substring(0, 500));

  // Let's test the billing-service endpoints directly!
  console.log('Testing billing-service/api/billing-svc/invoices...');
  const billingRes = await client.get('/api/billing-svc/invoices', { headers });
  console.log('Billing invoices status:', billingRes.status, JSON.stringify(billingRes.data).substring(0, 500));

  // 2. Confirm order
  console.log(`Confirming order ${orderNumber}...`);
  const confirmRes = await client.put(`/api/sales-svc/retail/${orderNumber}/confirm`, {
    paymentMode: 'BOTH',
    amount: 200.00,
    cashAmount: 100.00,
    onlineAmount: 100.00,
    paymentReference: 'FW-TXN-TEST'
  }, { headers });
  console.log('Confirm response status:', confirmRes.status);
  console.log('Confirm response data:', JSON.stringify(confirmRes.data, null, 2));
}

testConfirm();
