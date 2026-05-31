const axios = require('axios');

async function main() {
  const client = axios.create({
    baseURL: 'http://localhost:8090',
    validateStatus: () => true
  });

  console.log('Logging in as admin...');
  const loginRes = await client.post('/api/auth-svc/login', { username: 'admin', password: 'Admin@123' });
  console.log('Login Status:', loginRes.status);
  console.log('Login Response:', loginRes.data);

  if (loginRes.status !== 200) {
    console.error('Failed to log in');
    return;
  }

  const token = loginRes.data.accessToken;

  // Let's first search if test_supervisor exists
  console.log('Checking if test_supervisor exists...');
  const getRes = await client.get('/api/users-svc/test_supervisor', {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log('Get User Status:', getRes.status);
  console.log('Get User Response:', getRes.data);

  console.log('Attempting to register test_supervisor...');
  const regRes = await client.post('/api/users-svc/register', {
    username: 'test_supervisor',
    email: 'supervisor@test.com',
    mobile: '9876543210',
    password: 'Super@123',
    fullName: 'Test Supervisor',
    role: 'SHOP_SUPERVISOR'
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log('Register Status:', regRes.status);
  console.log('Register Response:', JSON.stringify(regRes.data));
}

main();

