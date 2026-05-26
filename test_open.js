const axios = require('axios');

async function testOpen() {
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
  console.log('Token acquired successfully');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Event-Id': '1'
  };

  // Get active shift
  console.log('Checking active shift for shop 1...');
  const activeRes = await client.get('/api/sales-svc/shifts/active/1', { headers });
  console.log('Active shift status:', activeRes.status, activeRes.data);

  // Try to open shift
  console.log('Opening shift for shop 1...');
  const openRes = await client.post('/api/sales-svc/shifts/open', {
    shopId: 1,
    openingCash: 1000.00,
    denominations: [
      { currencyValue: 500, noteCount: 2 }
    ]
  }, { headers });
  console.log('Open shift status:', openRes.status, openRes.data);
}

testOpen();
