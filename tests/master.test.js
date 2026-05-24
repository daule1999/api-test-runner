const runUsersSetupSuite = require('./Initial/users-setup.suite.js');
const runCategoriesSuite = require('./Initial/categories.suite.js');
const runProductsSuite = require('./Initial/products.suite.js');
const runStockAddSuite = require('./Event Wise/Jhusi_Program/stock-add.suite.js');
const runShopCounterSuite = require('./Event Wise/Jhusi_Program/shop-counter.suite.js');
const runShopIssueSuite = require('./Event Wise/Jhusi_Program/shop-issue.suite.js');
const runSalesAuditSuite = require('./Event Wise/Jhusi_Program/sales-audit.suite.js');
const runTestSetupSuite = require('./test.suite.js');
const runEventSetupSuite = require('./Event Wise/Jhusi_Program/event-setup.suite.js');
const runMultiEventIsolationSuite = require('./multi-event-isolation.suite.js');

const event1 = {
  id: 1,
  event_name: 'Jhusi Program 2026',
  event_type: 'MELA',
  description: 'Default Jhusi Program Event',
  location: 'Jhusi, Prayagraj',
  start_date: '2026-01-01 00:00:00',
  end_date: '2026-12-31 23:59:59',
  is_active: true
};

describe('Master E2E Serial Integration Suite', () => {

  // Suite 0: Test Setup Collection
  describe('➡️ Step 0: Test Setup Flow', () => {
    runTestSetupSuite();
  });

  // Suite 1: Users Setup Collection
  describe('➡️ Step 1: Users Setup Flow', () => {
    runUsersSetupSuite();
  });

  // Suite 1.5: Event Setup Collection
  describe('➡️ Step 1.5: Event Setup Flow', () => {
    runEventSetupSuite(event1);
  });

  // Suite 2: Categories Setup Collection
  describe('➡️ Step 2: Categories Setup Flow', () => {
    runCategoriesSuite();
  });

  // Suite 3: Products Setup Collection
  describe('➡️ Step 3: Products Setup Flow', () => {
    runProductsSuite();
  });

  // Suite 4: Jhusi Program Stock Add Collection
  describe('➡️ Step 4: Jhusi Program Stock Add Flow', () => {
    runStockAddSuite();
  });

  // Suite 5: Jhusi Program Shop Counter Collection
  describe('➡️ Step 5: Jhusi Program Shop Counter Flow', () => {
    runShopCounterSuite();
  });

  // Suite 6: Jhusi Program Shop Issue Collection
  describe('➡️ Step 6: Jhusi Program Shop Issue Flow', () => {
    runShopIssueSuite();
  });

  // Suite 7: Jhusi Program Sales Audit Collection
  // describe('➡️ Step 7: Jhusi Program Sales Audit Flow', () => {
  //   runSalesAuditSuite();
  // });

  // Suite 8: Multi-Event Security Isolation Flow
  describe('➡️ Step 8: Multi-Event Security Isolation Flow', () => {
    runMultiEventIsolationSuite();
  });

});
