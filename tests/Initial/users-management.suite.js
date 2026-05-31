const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

function runUsersManagementSuite() {
  describe('Postman Collection: Users Management and Profiles (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      const api = new TestClient();
      api.setEventId(process.env.SELECTED_EVENT_ID)
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
    });

    describe('Dynamic Users CRUD Lifecycle', () => {
      const csvPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'users_feed.csv');
      const syncRows = readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `User Case #${index + 1}: ${row.username} (${row.action})`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;

        console.log(`\n🧪 Process User Action [${row.action}] for: ${row.username}`);

        let existing;
        try {
          existing = await api.getUser(row.username);
        } catch (e) {
          // If not found, it throws error which is acceptable
          existing = null;
        }

        if (row.action === 'CREATE') {
          if (existing) {
            console.log(`⚠️ User "${row.username}" already exists.`);
            return;
          }
          const created = await api.registerUser({
            username: row.username,
            email: row.email,
            mobile: row.mobile,
            password: row.password,
            fullName: row.fullName,
            role: row.role
          });
          expect(created).toBeDefined();
          console.log(`✅ Created User: ${row.username}`);
        }

        else if (row.action === 'UPDATE_ROLE') {
          let targetUser = existing;
          if (!targetUser) {
            console.log(`🚀 Pre-creating user for UPDATE_ROLE check...`);
            targetUser = await api.registerUser({
              username: row.username,
              email: row.email,
              mobile: row.mobile,
              password: row.password,
              fullName: row.fullName,
              role: 'CASHIER'
            });
          }

          // Fetch exact User ID from user endpoint
          const userId = await api.getUserId(row.username);

          // Resolve role ID dynamically from role name
          const roles = await api.getRoles();
          const roleObj = roles.find(r => r.name === row.role);
          const roleId = roleObj ? roleObj.id : row.role;

          // Map to new role role IDs (e.g. SHOP_SUPERVISOR)
          const updated = await api.updateUserRole({
            userId,
            roleIds: [roleId]
          });
          expect(updated).toBeDefined();
          console.log(`✅ Updated User role for ID ${userId} to ${row.role} (Role ID: ${roleId})`);
        }

        else if (row.action === 'DELETE') {
          let targetUser = existing;
          if (!targetUser) {
            console.log(`🚀 Pre-creating user for DELETE check...`);
            targetUser = await api.registerUser({
              username: row.username,
              email: row.email,
              mobile: row.mobile,
              password: row.password,
              fullName: row.fullName,
              role: row.role
            });
          }
          await api.deleteUser(row.username);
          console.log(`✅ Deleted User: ${row.username}`);
        }
      });
    });

    describe('Role and Event Assignment Constraints (Negative Tests)', () => {
      test('Edit user role without specifying event in request body or header → 400 Bad Request', async () => {
        const api = new TestClient();
        api.token = adminToken;
        
        // 1. Create a dummy user
        const username = 'neg_role_no_event';
        try { await api.deleteUser(username); } catch (e) {} // cleanup
        
        await api.registerUser({
          username,
          email: 'neg_role_no_event@test.com',
          mobile: '9870000001',
          password: 'Admin@123',
          fullName: 'Negative Role Test',
          role: 'CASHIER'
        });
        
        const userId = await api.getUserId(username);
        
        // 2. Fetch role ID for CASHIER
        const roles = await api.getRoles();
        const cashierRole = roles.find(r => r.name === 'CASHIER');
        const roleId = cashierRole ? cashierRole.id : 1;
        
        // 3. Try to update user role with empty eventId (without header and without body eventId)
        api.eventId = ''; // clear header
        
        const response = await api.client.put('/api/users-svc/users-role', {
          userId,
          roleIds: [roleId]
        }, { headers: api.headers });
        
        expect(response.status).toBe(400);
        console.log('✅ Passed: Editing user role without specifying event successfully failed with 400.');
        
        // Cleanup
        api.eventId = '1';
        await api.deleteUser(username);
      });

      test('Assign event to a user without any role → 400 Bad Request', async () => {
        const api = new TestClient();
        api.token = adminToken;
        
        // 1. Create a dummy user without event assignment (results in 0 roles)
        const username = 'neg_ev_no_role';
        try { await api.deleteUser(username); } catch (e) {} // cleanup
        
        api.eventId = ''; // register without event assignment
        await api.registerUser({
          username,
          email: 'neg_ev_no_role@test.com',
          mobile: '9870000002',
          password: 'Admin@123',
          fullName: 'Negative Event Test',
          role: 'CASHIER'
        });
        
        // 2. Try to assign an event to this user who has no roles
        api.eventId = '1'; // set event header for subsequent requests
        const response = await api.client.post('/api/users-svc/assign-events', {
          username,
          eventIds: [1]
        }, { headers: { ...api.headers, 'X-Username': 'admin', 'X-Roles': 'ADMIN' } });
        
        expect(response.status).toBe(400);
        console.log('✅ Passed: Assigning event to a user without a role successfully failed with 400.');
        
        // Cleanup
        await api.deleteUser(username);
      });
    });
  });
}

module.exports = runUsersManagementSuite;
