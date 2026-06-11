const fs = require('fs');
const path = require('path');
const runTestSetupSuite = require('./test.suite.js');
const runEventSetupSuite = require("./Initial/event-setup.suite");
const runUsersSetupSuite = require('./Initial/users-setup.suite.js');
const runCategoriesSuite = require('./Initial/categories.suite.js');
const runProductsSuite = require('./Initial/products.suite.js');
const { restartEverything } = require('../helpers/restart-all');
const runInventoryStockAddSuite = require('./Event Wise/stock-add.suite.js');
const runShopCounterSuite = require('./Event Wise/shop-counter.suite.js');
const runShopIssueSuite = require('./Event Wise/shop-issue.suite.js');
const runShopShiftSuite = require('./shop-shift.suite.js');


const eventsPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'Event1', 'events_feed.csv');
const usersPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'Event1', 'user_addition.csv');
const categoriesPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'Event1', 'category.csv');
const productsPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'Event1', 'product_addition.csv');
const stocksInPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'Event1', 'inventory_inward.csv');
const shopCountersPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'Event1', 'shop_counters_feed.csv');
const shopIssuesPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', 'Event1', 'stock_issue.csv');

describe('Till Counter Flow', () => {

    // restartEverything();

    // Suite 0: Test Setup Collection
    describe('➡️ Step 0.2: Test Setup Flow', () => {
        runTestSetupSuite();
    });

    // Suite 1: Dynamic Events CRUD Collection
    describe('➡️ Step 1: Dynamic Events CRUD Flow', () => {
        runEventSetupSuite(eventsPath, 'Event1');
    });

    // Suite 1: Users Setup Collection
    describe('➡️ Step 1: Users Setup Flow', () => {
        runUsersSetupSuite(usersPath);
    });

    // Suite 2: Categories Setup Collection
    describe('➡️ Step 2: Categories Setup Flow', () => {
        runCategoriesSuite(categoriesPath);
    });

    // Suite 3: Products Setup Collection
    describe('➡️ Step 3: Products Setup Flow', () => {
        runProductsSuite(productsPath);
    });

    // Suite 4: Jhusi Program Stock Add Collection (CSV-driven IN)
    describe('➡️ Step 4: Jhusi Program Stock Add Flow (STOCK IN)', () => {
        runInventoryStockAddSuite(stocksInPath);
    });

    // Suite 5: Jhusi Program Shop Counter Collection
    describe('➡️ Step 5: Jhusi Program Shop Counter Flow', () => {
        runShopCounterSuite(shopCountersPath);
    });

    // Suite 6: Jhusi Program Shop Issue Collection
    describe('➡️ Step 6: Jhusi Program Shop Issue Flow', () => {
        runShopIssueSuite(shopIssuesPath);
    });

    // Suite 7: Jhusi Program Shop Issue Collection
    describe('➡️ Step 6: Jhusi Program Shop Shift Flow', () => {
        runShopShiftSuite();
    });
})