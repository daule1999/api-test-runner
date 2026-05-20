const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite mapping to the "02: Users Setup" Postman Collection,
 * powered dynamically by Feed_data/user_addition.csv!
 */
function runUsersSetupSuite() {
  describe('Postman Collection: 02: Users Setup (Data-Driven)', () => {
    let adminToken;
    let systemRoles = [];

    beforeAll(async () => {
      // 1. Perform Single Admin Login (Postman Request 01)
      const api = new TestClient();
      console.log('🧪 Executing pre-requisite: 01: Admin Login...');
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      console.log('✅ Admin login successful. Token acquired.');

      // 2. Extract system roles (Postman Request 02)
      api.token = adminToken;
      console.log('🧪 Executing pre-requisite: 02: Get All Roles...');
      const roles = await api.getRoles();
      expect(Array.isArray(roles)).toBe(true);
      systemRoles = roles.map(role => role.name);
      console.log('✅ System Roles Stored Successfully:', systemRoles);
    }, 30000); // 30s timeout for setup

    // Generate dynamic test cases for each user in the CSV file
    describe('Dynamic User Registrations', () => {
      const csvPathForSync = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'user_addition.csv');
      const syncRows = readCsv(csvPathForSync);

      test.each(
        syncRows.map((row, index) => [
          `User #${index + 1}: ${row.username} [${row.role}]`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;

        console.log(`\n──────────────────────────────────────────────────`);
        console.log(`🧪 Starting Pipeline for User: ${row.username}`);
        console.log(`──────────────────────────────────────────────────`);

        // Postman Step 03: Pre-creation Check (Check if user exists)
        let alreadyExists = false;
        try {
          const existingUser = await api.getUser(row.username);
          if (existingUser && existingUser.username === row.username) {
            alreadyExists = true;
            console.log(`⚠️ Skip mode active: User "${row.username}" already exists in system.`);
          }
        } catch (err) {
          console.log(`ℹ️ User "${row.username}" does not exist yet. Safe to register.`);
        }

        // Postman Step 04: Role Validation & Registration
        // Assert role is present in systemRoles (Pre-request Role check)
        expect(systemRoles).toContain(row.role);

        if (!alreadyExists) {
          console.log(`🚀 Registering new user: ${row.username}...`);
          const createdUser = await api.registerUser({
            username: row.username,
            email: row.email,
            mobile: row.mobile,
            password: row.password || 'Admin@123', // fallback password
            fullName: row.fullName,
            role: row.role
          });

          expect(createdUser.username).toBe(row.username);
          expect(createdUser.status).toBe('ACTIVE');
          console.log(`✅ User "${row.username}" registered successfully with role ${row.role}.`);
        }

        // Postman Step 05: Verify User Details (GET User Profile check)
        console.log(`🔍 Verifying profile data integrity for: ${row.username}...`);
        const userProfile = await api.getUser(row.username);

        expect(userProfile.username).toBe(row.username);
        expect(userProfile.email).toBe(row.email);
        expect(userProfile.roles).toContain(row.role);
        console.log(`🎉 Verification passed: User profile details match exactly.`);
      });
    });
  });
}

module.exports = runUsersSetupSuite;
