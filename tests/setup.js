const { verifyDockerServices } = require('../helpers/docker-helper');
const { getAdminConnection } = require('../helpers/db-helper');

beforeAll(async () => {
  console.log('🏁 Framework Global Setup: Initializing test environment hooks...');

  // 1. Programmatic health-check or spin-up of Docker core containers
  try {
    await verifyDockerServices();
  } catch (err) {
    console.warn('⚠️ Service verification warning. Proceeding to connect to available local port...');
  }

  // 2. Hermetic db setup: Truncate shop staff assignments to clear stale allocations
  try {
    console.log('🧹 Wiping stale staff assignments to ensure a conflict-free E2E starting state...');
    const conn = await getAdminConnection();
    await conn.query('USE sales_db');
    await conn.query('TRUNCATE TABLE shop_staff_assignment');
    await conn.end();
    console.log('✅ Staff assignments database table successfully truncated.');
  } catch (dbErr) {
    console.warn('⚠️ Warning: Failed to clean up database assignments table:', dbErr.message);
  }

  console.log('✅ Global Setup complete. Starting declarative test suites...\n');
}, 60000);
