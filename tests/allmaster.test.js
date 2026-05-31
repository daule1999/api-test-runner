const runUsersSetupSuite = require('./Initial/users-setup.suite.js');
const runCategoriesSuite = require('./Initial/categories.suite.js');
const runProductsSuite = require('./Initial/products.suite.js');
const runStockAddSuite = require('./Event Wise/Jhusi_Program/stock-add.suite.js');
const runShopCounterSuite = require('./Event Wise/Jhusi_Program/shop-counter.suite.js');
const runShopIssueSuite = require('./Event Wise/Jhusi_Program/shop-issue.suite.js');
const runSalesAuditSuite = require('./Event Wise/Jhusi_Program/sales-audit.suite.js');
const runTestSetupSuite = require('./test.suite.js');
const runEventSetupSuite = require('./Initial/event-setup.suite.js');
const runMultiEventIsolationSuite = require('./multi-event-isolation.suite.js');

// --- Expanded High-Rigor and CRUD Integration Suites ---
const runEventsSuite = require('./Initial/events.suite.js');
const runShopsSuite = require('./Initial/shops.suite.js');
const runUsersManagementSuite = require('./Initial/users-management.suite.js');
const runInventoryAdvancedSuite = require('./Initial/inventory-advanced.suite.js');
const runRbacSecuritySuite = require('./Initial/rbac-security.suite.js');
const runSalesActionsSuite = require('./Event Wise/Jhusi_Program/sales-actions.suite.js');
const runShiftsReconciliationSuite = require('./Event Wise/Jhusi_Program/shifts-reconciliation.suite.js');

// --- Phase 1 NEW SUITES (100% coverage expansion) ---
const runAuthContractSuite = require('./Initial/auth-contract.suite.js');
const runValidationSuite = require('./Initial/validation.suite.js');
const runStockMovementDirectionsSuite = require('./Event Wise/Jhusi_Program/stock-movement-directions.suite.js');
const runBillingVerificationSuite = require('./Event Wise/Jhusi_Program/billing-verification.suite.js');
const runConcurrencySuite = require('./Event Wise/Jhusi_Program/concurrency.suite.js');
const runPaymentModesSuite = require('./Event Wise/Jhusi_Program/payment-modes.suite.js');
const runShiftAnalyticsSuite = require('./Event Wise/Jhusi_Program/shift-analytics.suite.js');

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

  // ─────────────────────────────────────────────────────────────
  // PHASE 0: Auth Contract Verification (P0)
  // Must run FIRST — all other suites depend on working auth.
  // ─────────────────────────────────────────────────────────────
  describe('➡️ Step 0.1: Auth Contract — Full Boundary Tests (P0)', () => {
    runAuthContractSuite();
  });

  // ─────────────────────────────────────────────────────────────
  // PHASE 1: Initial Setup
  // ─────────────────────────────────────────────────────────────

  // Suite 0: Test Setup Collection
  describe('➡️ Step 0.2: Test Setup Flow', () => {
    runTestSetupSuite();
  });

  // Suite 1: Users Setup Collection
  describe('➡️ Step 1: Users Setup Flow', () => {
    runUsersSetupSuite();
  });

  // Suite 1.1: Field Validation — 400/409 Paths (P0)
  describe('➡️ Step 1.1: Field Validation — All 400/409 Bad-Request Paths (P0)', () => {
    runValidationSuite();
  });

  // Suite 1.2: Dynamic Events CRUD Collection
  describe('➡️ Step 1.2: Dynamic Events CRUD Flow', () => {
    runEventsSuite();
  });

  // Suite 1.3: Dynamic Users Management Collection
  describe('➡️ Step 1.3: Dynamic Users Management Flow', () => {
    runUsersManagementSuite();
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

  // Suite 3.5: Advanced Inventory CRUD Collection
  describe('➡️ Step 3.5: Advanced Inventory CRUD & Bulk Flow', () => {
    runInventoryAdvancedSuite();
  });

  // Suite 3.8: RBAC Hardened Security Verification (P0) — Strict 403 enforcement
  describe('➡️ Step 3.8: RBAC Hardened Security — Strict 403 Enforcement (P0)', () => {
    runRbacSecuritySuite();
  });

  // ─────────────────────────────────────────────────────────────
  // PHASE 2: Event-Wise Testing (Jhusi Program)
  // ─────────────────────────────────────────────────────────────

  // Suite 4: Jhusi Program Stock Add Collection (CSV-driven IN)
  describe('➡️ Step 4: Jhusi Program Stock Add Flow (STOCK IN)', () => {
    runStockAddSuite();
  });

  // Suite 4.1: Stock Movement Directions — ALL Types (P0)
  describe('➡️ Step 4.1: Stock Movement Directions — OUT/ADJUSTMENT/RETURN_FROM_COUNTER (P0)', () => {
    runStockMovementDirectionsSuite();
  });

  // Suite 5: Jhusi Program Shop Counter Collection
  describe('➡️ Step 5: Jhusi Program Shop Counter Flow', () => {
    runShopCounterSuite();
  });

  // Suite 5.5: Dynamic Shop Counters CRUD Collection
  describe('➡️ Step 5.5: Dynamic Shop Counters CRUD Flow', () => {
    runShopsSuite();
  });

  // Suite 6: Jhusi Program Shop Issue Collection
  describe('➡️ Step 6: Jhusi Program Shop Issue Flow', () => {
    runShopIssueSuite();
  });

  // Suite 6.5: Dynamic Sales Returns & Split Refunds Collection
  describe('➡️ Step 6.5: Dynamic Sales Returns & Order Cancellations Flow', () => {
    runSalesActionsSuite();
  });

  // Suite 6.6: Payment Modes — CASH/ONLINE/BOTH Permutations (P0)
  describe('➡️ Step 6.6: Payment Modes — All Permutations + Mismatch Validation (P0)', () => {
    runPaymentModesSuite();
  });

  // Suite 6.7: Billing Verification — Invoice Lifecycle + Price Snapshot (P0)
  describe('➡️ Step 6.7: Billing Verification — Invoice Lifecycle & Price Snapshot (P0)', () => {
    runBillingVerificationSuite();
  });

  // Suite 6.8: Shifts Float Closures and Supervisor Reconciliation Collection
  describe('➡️ Step 6.8: Shifts Float Closures and Supervisor Reconciliations Flow', () => {
    runShiftsReconciliationSuite();
  });

  // Suite 6.9: Shift Analytics — Product Summary & Cash/Online Totals (P1)
  describe('➡️ Step 6.9: Shift Analytics — Product Summary & Totals (P1)', () => {
    runShiftAnalyticsSuite();
  });

  // Suite 7: Jhusi Program Sales Audit Collection
  describe('➡️ Step 7: Jhusi Program Sales Audit Flow', () => {
    runSalesAuditSuite();
  });

  // ─────────────────────────────────────────────────────────────
  // PHASE 3: Concurrency & Security Tests (Run Last)
  // These modify stock aggressively — must run after setup is complete.
  // ─────────────────────────────────────────────────────────────

  // Suite 7.5: Concurrency & Pessimistic Lock Tests (P0)
  describe('➡️ Step 7.5: Concurrency & Pessimistic Lock — Double-Submit Prevention (P0)', () => {
    runConcurrencySuite();
  });

  // Suite 8: Multi-Event Security Isolation Flow (P0/P1)
  describe('➡️ Step 8: Multi-Event Security Isolation Flow (P0/P1)', () => {
    runMultiEventIsolationSuite();
  });

});

