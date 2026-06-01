/**
 * ============================================================================
 * SHARED TEST CONTEXT — Cross-phase state for the Comprehensive E2E Suite
 * ============================================================================
 * Mutable singleton holding IDs, tokens, and resolved references that are
 * populated by earlier phases and consumed by later ones.
 */

const ctx = {
  // ─── Auth ──────────────────────────────────────────────────────────────────
  jwtToken: null,

  // ─── User IDs ──────────────────────────────────────────────────────────────
  adminUserId: null,
  managerUserId: null,
  cashierJohnUserId: null,
  cashierJaneUserId: null,

  // ─── Event ─────────────────────────────────────────────────────────────────
  eventId: null,
  eventName: null,

  // ─── Category Map: name → id ──────────────────────────────────────────────
  categoryMap: {},

  // ─── Product Map: name → { id, mrp, sellingPrice, discount, sku } ─────────
  productMap: {},

  // ─── Shop Map: name → { id, counterNumber, categoryId } ──────────────────
  shopMap: {},

  // ─── Shift ─────────────────────────────────────────────────────────────────
  shiftId: null,
  openingCash: 1000.00,

  // ─── Orders: array of { orderNumber, shopId, productName, qty, total, cashAmt, onlineAmt, status }
  orders: [],

  // ─── Stock Snapshots: productName → { warehouseQtyBefore, warehouseQtyAfter, issuedQty }
  stockSnapshots: {},

  // ─── Invoice ───────────────────────────────────────────────────────────────
  invoiceNumber: null,

  // ─── Financial Accumulators ────────────────────────────────────────────────
  totalCashRevenue: 0,
  totalOnlineRevenue: 0,
  totalRefunds: 0,
};

module.exports = ctx;
