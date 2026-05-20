const { verifyDockerServices } = require('../helpers/docker-helper');

beforeAll(async () => {
  console.log('🏁 Framework Global Setup: Initializing test environment hooks...');

  // 2. Programmatic health-check or spin-up of Docker core containers
  try {
    await verifyDockerServices();
  } catch (err) {
    console.warn('⚠️ Service verification warning. Proceeding to connect to available local port...');
  }

  console.log('✅ Global Setup complete. Starting declarative test suites...\n');
}, 60000);
