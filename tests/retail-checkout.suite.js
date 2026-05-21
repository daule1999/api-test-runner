
const runSalesAuditSuite = require('./Event Wise/Jhusi_Program/sales-audit.suite.js');
const runTestSetupSuite = require('./test.suite.js');

describe('Retail sales Integration Suite', () => {

  // Suite 0: Test Setup Collection
  // describe('➡️ Step 0: Test Setup Flow', () => {
  //   runTestSetupSuite();
  // });


  // Suite 7: Jhusi Program Sales Audit Collection
  describe('➡️ Step 7: Jhusi Program Sales Audit Flow', () => {
    runSalesAuditSuite();
  });

});
