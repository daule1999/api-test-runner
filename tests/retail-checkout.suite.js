const { runCsvSuite } = require('../helpers/framework');

// Exportable standard retail checkout dynamic integration suite
function runRetailCheckoutSuite() {
  runCsvSuite(
    'E2E Retail Checkouts (Declarative Feed)',
    'sales_test_feed.csv'
  );
}

module.exports = runRetailCheckoutSuite;
