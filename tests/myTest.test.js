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

const eventName = process.env.EVENT_NAME
const eventsPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', eventName, 'events_feed.csv');
const usersPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', eventName, 'user_addition.csv');
const categoriesPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', eventName, 'category.csv');
const productsPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', eventName, 'product_addition.csv');
const stocksInPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', eventName, 'inventory_inward.csv');
const shopCountersPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', eventName, 'shop_counters_feed.csv');
const shopIssuesPath = path.resolve(process.cwd(), 'DATA', 'Feed_data', 'EventWise', eventName, 'stock_issue.csv');

let createdEventId;
describe('Till Counter Flow', () => {

    // restartEverything();

    // Suite 0: Test Setup Collection
    describe('➡️ Step 0.2: Test Setup Flow', () => {
        runTestSetupSuite();
        console.log(eventName)
    });

    // Suite 1: Dynamic Events CRUD Collection
    describe('➡️ Step 1: Dynamic Events CRUD Flow', () => {
        createdEventId = runEventSetupSuite(eventsPath, eventName);
    });

    // Suite 1: Users Setup Collection
    describe('➡️ Step 1: Users Setup Flow', () => {
        runUsersSetupSuite(usersPath, createdEventId);
    });

    // Suite 2: Categories Setup Collection
    describe('➡️ Step 2: Categories Setup Flow', () => {
        runCategoriesSuite(categoriesPath, createdEventId);
    });

    // Suite 3: Products Setup Collection
    describe(`➡️ Step 3: Products Setup Flow (${eventName})`, () => {
        runProductsSuite(productsPath, createdEventId);
    });

    // Suite 4:  Stock Add Collection (CSV-driven IN)
    describe(`➡️ Step 4:  Stock Add Flow (${eventName}) (STOCK IN)`, () => {
        runInventoryStockAddSuite(stocksInPath, createdEventId);
    });

    // Suite 5:  Shop Counter Collection
    describe(`➡️ Step 5:  Shop Counter Flow (${eventName})`, () => {
        runShopCounterSuite(shopCountersPath, createdEventId);
    });

    // Suite 6:  Shop Issue Collection
    describe(`➡️ Step 6:  Shop Issue Flow (${eventName})`, () => {
        runShopIssueSuite(shopIssuesPath, createdEventId);
    });

    // // Suite 7:  Shop Issue Collection
    // describe(`➡️ Step 7:  Shop Shift Flow (${eventName})`, () => {
    //     runShopShiftSuite(createdEventId);
    // });
})