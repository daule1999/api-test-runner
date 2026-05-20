const { TestClient } = require('../helpers/framework');

// Exportable test suite that simply tests the admin login API
function runTestValidationSuite() {
    describe('E2E Admin Authentication Test', () => {
        test('Should successfully log in admin user', async () => {
            const api = new TestClient();
            console.log('🧪 Testing Admin Login...');

            const token = await api.login('admin', 'Admin@123');
            expect(token).toBeDefined();

            console.log('🧪 Toke created...', token);

            console.log('✅ Admin login successful!');
        });
    });
}

module.exports = runTestValidationSuite;
