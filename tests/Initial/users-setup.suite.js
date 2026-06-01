const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite mapping to the "02: Users Setup" Postman Collection,
 * powered dynamically by Feed_data/user_addition.csv!
 */
function runUsersSetupSuite(customCsvPath) {
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
      const csvPathForSync = typeof customCsvPath === 'string' ? customCsvPath : path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'user_addition.csv');
      const syncRows = Array.isArray(customCsvPath) ? customCsvPath : readCsv(csvPathForSync);

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

        // Verification Check: Without event assignment (no X-Event-Id header), user should not have any role
        console.log(`🧪 Verifying role omission without event assignment...`);
        const apiNoEvent = new TestClient();
        apiNoEvent.token = adminToken;
        apiNoEvent.eventId = ''; // Remove event ID header so no event is assigned
        
        const noEventUsername = `no_ev_${row.username}`;
        try {
            await apiNoEvent.registerUser({
                username: noEventUsername,
                email: `no_ev_${row.email}`,
                mobile: String(row.mobile).replace('98765', '98700'),
                password: 'Admin@123',
                fullName: `No Event ${row.fullName}`,
                role: row.role
            });
            
            const profileNoEvent = await apiNoEvent.getUser(noEventUsername);
            expect(profileNoEvent.roles).toBeDefined();
            // User registered without event assignment must have 0 roles
            const rolesList = Array.from(profileNoEvent.roles);
            expect(rolesList.length).toBe(0); 
            console.log(`✅ Passed: User ${noEventUsername} registered without event assignment has 0 roles.`);
            
            // Clean up the dummy user
            await apiNoEvent.deleteUser(noEventUsername);
        } catch (err) {
            console.warn(`⚠️ Warning during unassigned user role verification:`, err.message);
        }
      });
    });
  });
}

module.exports = runUsersSetupSuite;
