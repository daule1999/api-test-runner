/**
 * ============================================================================
 * MASTER COMPREHENSIVE E2E TEST ORCHESTRATOR
 * ============================================================================
 * Sequentially loads and executes all 9 E2E test suites in a single serial execution.
 * Context is dynamically accumulated in test-context.js across all phases.
 */

const runPhase1 = require('./phase1-auth-user-setup.suite');
const runPhase2 = require('./phase2-inventory-seeding.suite');
const runPhase3 = require('./phase3-event-shop-setup.suite');
const runPhase4 = require('./phase4-shift-sales-lifecycle.suite');
const runPhase5 = require('./phase5-shift-reconciliation.suite');
const runPhase6 = require('./phase6-billing-verification.suite');
const runPhase7 = require('./phase7-reports-analytics.suite');
const runPhase8 = require('./phase8-conservation-audit.suite');
const runPhase9 = require('./phase9-negative-edge-cases.suite');

describe('Bikri Kendra — Master Comprehensive E2E Test Suite', () => {
  runPhase1();
  runPhase2();
  runPhase3();
  runPhase4();
  runPhase5();
  runPhase6();
  runPhase7();
  runPhase8();
  runPhase9();
});
