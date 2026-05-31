const { execSync } = require('child_process');
const path = require('path');

/**
 * Robust system orchestrator that restarts services, rebuilds container images,
 * and resets database schemas in the exact sequence requested.
 * Stops execution immediately if any step fails.
 */
function restartEverything() {
  console.log('\n==================================================');
  console.log('🔄 STARTING COMPREHENSIVE SYSTEM RESTART PIPELINE');
  console.log('==================================================\n');

  const traefikDir = '/Users/dauleshwar/Downloads/Workspace/Event Manage/bikri-kendra/traefik';
  const bikriKendraDir = '/Users/dauleshwar/Downloads/Workspace/Event Manage/bikri-kendra';
  const testRunnerDir = '/Users/dauleshwar/Downloads/Workspace/Event Manage/api-test-runner';

  try {
    // 1. Stop local services
    console.log('🔌 Step 1: Stopping all running containers via localstop.sh...');
    execSync('bash localstop.sh', { cwd: traefikDir, stdio: 'inherit' });
    console.log('✅ Step 1 complete: Services stopped.\n');

    // 2. Rebuild Service Docker Images
    console.log('🏗️ Step 2: Rebuilding service docker images (createServiceDockerImages.sh)...');
    execSync('bash createServiceDockerImages.sh', { cwd: bikriKendraDir, stdio: 'inherit' });
    console.log('✅ Step 2 complete: Service images compiled and built successfully.\n');

    // 3. Reset databases
    console.log('💾 Step 3: Resetting database schemas via reset-db.js...');
    execSync('node reset-db.js', { cwd: testRunnerDir, stdio: 'inherit' });
    console.log('✅ Step 3 complete: Database wiped and schema DDL executed successfully.\n');

    // 4. Run localstop.sh again (as strictly requested in sequence)
    console.log('🔌 Step 4: Running localstop.sh again as requested...');
    execSync('bash localstop.sh', { cwd: traefikDir, stdio: 'inherit' });
    console.log('✅ Step 4 complete: Services stopped successfully.\n');

    // 5. Spin up services in background so E2E tests can interact with them
    console.log('🚀 Step 5: Starting services in background via docker compose up -d...');
    execSync('docker compose -f docker-compose.yml -f docker-compose.local.yml up -d', { cwd: traefikDir, stdio: 'inherit' });
    console.log('✅ Step 5 complete: Core containers started.\n');

    // 6. Wait for service bootstrap to complete
    console.log('⏱️ Step 6: Waiting 15 seconds for Spring Boot applications to initialize and bootstrap...');
    execSync('sleep 15');
    console.log('✅ Step 6 complete: Services ready!\n');

    console.log('==================================================');
    console.log('🎉 SYSTEM SUCCESSFUL RESTARTED - READY FOR TESTS');
    console.log('==================================================\n');
  } catch (error) {
    console.error('\n❌ ERROR: System restart pipeline broke at a critical step!');
    console.error(`Reason: ${error.message}`);
    console.error('Test execution aborted to prevent stale states.\n');
    throw error;
  }
}

module.exports = {
  restartEverything
};
