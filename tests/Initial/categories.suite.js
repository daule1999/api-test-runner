const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');

/**
 * Exportable Jest suite mapping to the "03: Categories" Postman Collection,
 * powered dynamically by Feed_data/category.csv!
 */
function runCategoriesSuite(customCsvPath) {
  describe('Postman Collection: 03: Categories (Data-Driven)', () => {
    let adminToken;

    beforeAll(async () => {
      // 1. Perform Single Admin Login (Postman Request 01)
      const api = new TestClient();
      console.log('🧪 Executing pre-requisite: 01: Admin Login...');
      adminToken = await api.login('admin', 'Admin@123');
      expect(adminToken).toBeDefined();
      console.log('✅ Admin login successful. Token acquired.');
    }, 30000); // 30s timeout

    // Generate dynamic test cases for each category in the CSV file
    describe('Dynamic Category Creation', () => {
      const csvPath = typeof customCsvPath === 'string' ? customCsvPath : path.resolve(process.cwd(), 'DATA', 'Feed_data', 'Initial', 'category.csv');
      const syncRows = Array.isArray(customCsvPath) ? customCsvPath : readCsv(csvPath);

      test.each(
        syncRows.map((row, index) => [
          `Category #${index + 1}: ${row.categoryName}`,
          row
        ])
      )('%s', async (description, row) => {
        expect(adminToken).toBeDefined();
        const api = new TestClient();
        api.token = adminToken;

        console.log(`\n──────────────────────────────────────────────────`);
        console.log(`🧪 Starting Pipeline for Category: ${row.categoryName}`);
        console.log(`──────────────────────────────────────────────────`);

        let categoryId;
        let alreadyExists = false;

        // Step 1: Pre-creation Check (Check if category already exists)
        try {
          const categories = await api.getCategories();
          const match = categories.find(
            c => c.name && c.name.trim().toLowerCase() === row.categoryName.trim().toLowerCase()
          );
          if (match) {
            alreadyExists = true;
            categoryId = match.id;
            console.log(`⚠️ Category "${row.categoryName}" already exists with ID ${categoryId}.`);
          }
        } catch (err) {
          console.warn('⚠️ Warning: Failed to query existing categories. Proceeding with creation...', err.message);
        }

        // Postman Step 02: Create Category
        if (!alreadyExists) {
          console.log(`🚀 Creating new category: "${row.categoryName}"...`);
          const createdCategory = await api.createCategory({
            name: row.categoryName,
            description: row.categoryDescription
          });

          expect(createdCategory).toBeDefined();
          expect(createdCategory.name).toBe(row.categoryName);
          expect(createdCategory.description).toBe(row.categoryDescription);

          categoryId = createdCategory.id;
          expect(categoryId).toBeDefined();
          console.log(`✅ Category "${row.categoryName}" created successfully with ID ${categoryId}.`);
        }

        // Postman Step 03: Category by id (Verify fetched details)
        console.log(`🔍 Fetching category by ID ${categoryId} to verify details...`);
        const categoryData = await api.getCategoryById(categoryId);

        expect(categoryData).toBeDefined();
        expect(categoryData.id.toString()).toBe(categoryId.toString());
        expect(categoryData.name).toBe(row.categoryName);
        console.log(`🎉 Verification passed: Category details matched perfectly.`);
      });
    });
  });
}

module.exports = runCategoriesSuite;
