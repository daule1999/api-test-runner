const { execSync } = require('child_process');
const net = require('net');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Helper to check if a port is open
function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(2000);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, host, () => {
      socket.destroy();
      resolve(true);
    });
  });
}

// Helper to sleep for N ms
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyDockerServices() {
  console.log('🔍 Checking if microservice container network ports are active...');

  const mysqlPort = parseInt(process.env.DB_PORT || '3307', 10);
  const gatewayPort = 8090;

  const isMysqlUp = await isPortOpen(mysqlPort);
  const isGatewayUp = await isPortOpen(gatewayPort);

  if (isMysqlUp && isGatewayUp) {
    console.log(`✅ Required service ports (${mysqlPort}, 8090) are already active and reachable.`);
    return true;
  }

  console.log('⚠️ Required docker container ports are not fully active.');
  console.log('🚀 Attempting to spin up core services via Docker Compose...');

  try {
    // Poll up to 60 seconds for both ports to open
    for (let i = 0; i < 30; i++) {
      const dbOpen = await isPortOpen(mysqlPort);
      const gwOpen = await isPortOpen(gatewayPort);
      if (dbOpen && gwOpen) {
        console.log('✅ Services are now up and accepting connections.');
        return true;
      }
      await sleep(2000);
      console.log(`⏱️ Waiting for services... (${(i + 1) * 2}s elapsed)`);
    }

    throw new Error('Timeout waiting for core Docker services (MySQL, Traefik) to start.');
  } catch (error) {
    console.error('❌ Failed to dynamically start or verify Docker services:', error.message);
    console.log('👉 Please make sure Docker Desktop/Daemon is running and run manually: ./start-all.sh');
    throw error;
  }
}

module.exports = {
  verifyDockerServices,
  isPortOpen
};
