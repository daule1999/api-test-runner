const runShopShiftSuite = require('./shop-shift.suite');

describe('Bikri Kendra — Shop Shift Operations Suite', () => {
  // Execute the CSV-driven shift suite.
  // It will dynamically resolve and check operations against the database.
  runShopShiftSuite();
});
