const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite mapping to the "03: Shop/Counter" collection,
 * powered dynamically by Feed_data/EventWise/Jhusi_Program/Setup/shop_assignment.csv!
 */
function runShopCounterSuite(customCsvPath) {
  describe('Postman Collection: 03: Shop/Counter (Data-Driven)', () => {
    let adminToken;
    let authUsername = 'admin';
    let authRole = 'ADMIN';
    let systemCategoryMap = {};
    let eventId;

    beforeAll(async () => {
      // Resolve Event ID from environment variable or fallback to '1'
      eventId = process.env.SELECTED_EVENT_ID;

      // 1. Perform Single Admin Login (Postman Request 01)
      const api = new TestClient();
      api.setEventId(eventId);
      console.log('🧪 Executing pre-requisite: 01: Admin Login...');
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      console.log('✅ Admin login successful. Token acquired.');

      // 2. Get admin user data (Postman Request 02)
      api.token = adminToken;
      console.log('🧪 Executing pre-requisite: 02: Get Admin Profile...');
      const adminProfile = await api.getAdminProfile();
      expect(adminProfile).toBeDefined();
      authUsername = adminProfile.username || 'admin';
      authRole = Array.isArray(adminProfile.roles) ? adminProfile.roles.join(',') : (adminProfile.roles || 'ADMIN');
      console.log(`✅ Admin Profile extracted: ${authUsername} [${authRole}]`);

      // 3. Hydrate Category Map (Postman Request 04)
      console.log('🧪 Executing pre-requisite: 04: Get All Categories...');
      const categories = await api.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      categories.forEach(cat => {
        if (cat.name) {
          systemCategoryMap[cat.name.trim().toLowerCase()] = cat.id;
        }
      });
      console.log('✅ Hydrated Category Map successfully.');
    }, 30000); // 30s timeout

    // Generate dynamic test cases for each assignment in the CSV file
    describe('Dynamic Shop Setup and Staff Allocation', () => {
      const csvPath = typeof customCsvPath === 'string' ? customCsvPath : path.resolve(
        process.cwd(),
        'DATA',
        'Feed_data',
        'EventWise',
        'Jhusi_Program',
        'Setup',
        'shop_assignment.csv'
      );
      const syncRows = Array.isArray(customCsvPath) ? customCsvPath : readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Counter Setup #${index + 1}: ${row.username || 'N/A'} -> ${row.category_name}_counter_${row.counter_number}`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;
        api.setEventId(eventId);

        console.log(`\n──────────────────────────────────────────────────`);
        console.log(`🧪 Starting Pipeline for Shop Assignment: ${row.username} [Counter ${row.counter_number}]`);
        console.log(`──────────────────────────────────────────────────`);

        let userId = null;
        let userRole = 'CASHIER';
        let userProfile = null;
        const hasUsername = row.username && row.username.trim() !== '';

        // Postman Step 03: Get User by username
        if (hasUsername) {
          console.log(`🔍 Resolving user profile details for: "${row.username}"...`);
          userProfile = await api.getUser(row.username);
          expect(userProfile).toBeDefined();
          userId = userProfile.id;
          userRole = Array.isArray(userProfile.roles) ? userProfile.roles.join(',') : (userProfile.roles || 'CASHIER');
          expect(userId).toBeDefined();
          console.log(`✅ User resolved: ID ${userId}, Role Code: ${userRole}`);
        } else {
          console.log('ℹ️ No username provided for this counter assignment row. Skipping staff allocation phases.');
        }

        // Postman Step 04 Check: Map Category ID dynamically
        const categoryId = systemCategoryMap[row.category_name.trim().toLowerCase()];
        if (!categoryId) {
          throw new Error(`❌ CRITICAL ERROR: Category Name "${row.category_name}" does not exist in backend database.`);
        }

        const shopName = `${row.category_name}_counter_${row.counter_number}`;
        let shopId = null;
        let skipShopRegistration = false;

        // Postman Step 06: Shop by shopname (Search to see if already registered)
        console.log(`🔍 Searching shop counter name: "${shopName}"...`);
        try {
          const existingShop = await api.getShopByName(shopName);
          if (existingShop) {
            // Support both direct array, wrapped array, or single object format
            const list = Array.isArray(existingShop) ? existingShop : (existingShop.data && Array.isArray(existingShop.data) ? existingShop.data : null);
            const shopObj = list && list.length > 0 ? list[0] : (existingShop.data ? existingShop.data : existingShop);

            if (shopObj && shopObj.id) {
              skipShopRegistration = true;
              shopId = shopObj.id;
              console.log(`⚠️ Shop counter already exists with ID ${shopId}. Skipping registration.`);
            }
          }
        } catch (err) {
          console.warn('⚠️ Warning: Failed to query existing shop. Proceeding with registration...', err.message);
        }

        // Postman Step 07: Register Shop
        if (!skipShopRegistration) {
          console.log(`🚀 Registering new shop counter: "${shopName}"...`);
          const createdShop = await api.registerShop({
            shopName,
            categoryId,
            counterNumber: row.counter_number,
            isActive: true
          });

          expect(createdShop).toBeDefined();
          const shopObj = createdShop.data ? createdShop.data : createdShop;
          expect(shopObj.id).toBeDefined();
          shopId = shopObj.id;
          console.log(`✅ Shop counter registered successfully with ID ${shopId}.`);
        }

        // Postman Step 08: Shop by id
        console.log(`🔍 Verifying shop registration via ID ${shopId}...`);
        const shopDetails = await api.getShopById(shopId);
        expect(shopDetails).toBeDefined();
        const details = shopDetails.data ? shopDetails.data : shopDetails;
        expect(details.id.toString()).toBe(shopId.toString());
        expect(Number(details.counterNumber)).toBe(Number(row.counter_number));
        console.log(`✅ Shop details matched perfectly.`);

        if (hasUsername) {
          // step 09: check event already assigned to user
          const assignedEvents = userProfile.assignedEvents || [];
          const isEventAlreadyAssigned = assignedEvents.includes(parseInt(eventId, 10));

          if (isEventAlreadyAssigned) {
            console.log(`✅ User "${row.username}" is already assigned to event ID ${eventId}. Skipping assignment.`);
          } else {
            // Postman Step 09: Assign Event to Cashier/Supervisor
            console.log(`🚀 Assigning event ID ${eventId} to user "${row.username}"...`);
            const assignEventResult = await api.assignEvents(row.username, [parseInt(eventId, 10)]);
            expect(assignEventResult).toBeDefined();

            // Verify returned assigned events array contains active event ID
            const record = assignEventResult.data ? assignEventResult.data : assignEventResult;
            const assignedList = record.assignedEvents || [];
            expect(assignedList).toContain(parseInt(eventId, 10));
            console.log(`✅ Event assignment complete.`);
          }

          // Postman Step 10: Assign Staff to shop counter
          let skipStaffAssignment = false;
          try {
            const staffList = await api.getStaffByShopId(shopId);
            expect(Array.isArray(staffList)).toBe(true);
            const isAssigned = staffList.find(
              s => s.userId && s.userId.toString() === userId.toString()
            );
            if (isAssigned) {
              skipStaffAssignment = true;
              console.log(`⚠️ Cashier "${row.username}" is already assigned to shop ID ${shopId}. Skipping assignment.`);
            }
          } catch (err) {
            console.warn('⚠️ Warning: Failed to retrieve active staff list. Proceeding with assignment...', err.message);
          }

          let staffAssignmentSuccessful = true;

          if (!skipStaffAssignment) {
            console.log(`🚀 Allocating cashier staff user ID ${userId} to shop ID ${shopId}...`);
            try {
              const allocationRecord = await api.assignStaff({
                shopId,
                userId,
                roleCode: userRole
              });
              expect(allocationRecord).toBeDefined();
              console.log(`✅ Cashier allocated successfully.`);
            } catch (err) {
              if (err.message.includes('Status: 409')) {
                staffAssignmentSuccessful = false;
                console.warn(`⚠️ Warning: Role "${userRole}" is already assigned/taken at shop ID ${shopId} (Status 409). Skipping duplicate allocation.`);
              } else {
                throw err;
              }
            }
          }

          // Postman Step 11: Get Staff by Shop ID (Verification Check)
          if (staffAssignmentSuccessful) {
            console.log(`🔍 Verifying staff assignment is active for shop ID ${shopId}...`);
            const staffAllocations = await api.getStaffByShopId(shopId);
            expect(Array.isArray(staffAllocations)).toBe(true);

            const verifiedUser = staffAllocations.find(
              s => s.userId && s.userId.toString() === userId.toString()
            );

            expect(verifiedUser).toBeDefined();
            if (verifiedUser.isActive !== null && verifiedUser.isActive !== undefined) {
              expect(verifiedUser.isActive).toBe(true);
            }
            console.log(`🎉 Staff allocation verified successfully.`);
          }
        }
      });
    });
  });
}

module.exports = runShopCounterSuite;
