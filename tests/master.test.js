const runTestSetupSuite = require('./test.suite.js');
const runEventSetupSuite = require("./Initial/event-setup.suite");
const runUsersSetupSuite = require('./Initial/users-setup.suite.js');
const runValidationSuite = require('./Initial/validation.suite.js');
const runUsersManagementSuite = require('./Initial/users-management.suite.js');
const runCategoriesSuite = require('./Initial/categories.suite.js');
const runProductsSuite = require('./Initial/products.suite.js');
const { restartEverything } = require('../helpers/restart-all');
const runShopsSuite = require('./Initial/shops.suite.js');
const runStockAddSuite = require('./Event Wise/Jhusi_Program/stock-add.suite.js');
const runShopCounterSuite = require('./Event Wise/Jhusi_Program/shop-counter.suite.js');

describe('Master E2E Serial Integration Suite', () => {

    restartEverything();

    // Suite 0: Test Setup Collection
    describe('➡️ Step 0.2: Test Setup Flow', () => {
        runTestSetupSuite();
    });

    // Suite 1: Dynamic Events CRUD Collection
    describe('➡️ Step 1: Dynamic Events CRUD Flow', () => {
        runEventSetupSuite();
    });

    // Suite 1: Users Setup Collection
    describe('➡️ Step 1: Users Setup Flow', () => {
        runUsersSetupSuite();
    });

    // // // Suite 1.1: Field Validation — 400/409 Paths (P0)
    // // describe('➡️ Step 1.1: Field Validation — All 400/409 Bad-Request Paths (P0)', () => {
    // //     runValidationSuite();
    // // });

    // Suite 2: Categories Setup Collection
    describe('➡️ Step 2: Categories Setup Flow', () => {
        runCategoriesSuite();
    });

    // Suite 3: Products Setup Collection
    describe('➡️ Step 3: Products Setup Flow', () => {
        runProductsSuite();
    });

    // Suite 4: Jhusi Program Stock Add Collection (CSV-driven IN)
    describe('➡️ Step 4: Jhusi Program Stock Add Flow (STOCK IN)', () => {
        runStockAddSuite();
    });

    // Suite 5: Jhusi Program Shop Counter Collection
    describe('➡️ Step 5: Jhusi Program Shop Counter Flow', () => {
        runShopCounterSuite();
    });

    // Suite 5.5: Dynamic Shop Counters CRUD Collection
    describe('➡️ Step 5.5: Dynamic Shop Counters CRUD Flow', () => {
        runShopsSuite();
    });



    // // Suite 1.3: Dynamic Users Management Collection
    // describe('➡️ Step 1.3: Dynamic Users Management Flow', () => {
    //     runUsersManagementSuite();
    // });

})