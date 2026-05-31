const axios = require('axios');
const path = require('path');
const { readCsv } = require('./csv-helper');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8090';

/**
 * Fluent HTTP API Client wrapping axios for declarative test flows.
 */
class TestClient {
  constructor(baseURL = BASE_URL) {
    this.client = axios.create({
      baseURL,
      validateStatus: () => true // Handle statuses explicitly inside assertions
    });
    this.token = null;
    this.userId = null;
    this.shopId = null;
    this.eventId = '1';
  }

  setEventId(eventId) {
    this.eventId = eventId ? eventId.toString() : '1';
  }

  get headers() {
    const hdrs = { 'X-Event-Id': this.eventId };
    if (this.token) {
      hdrs.Authorization = `Bearer ${this.token}`;
    }
    return hdrs;
  }

  /**
   * Authenticats cashier credentials against the auth service.
   */
  async login(username, password) {
    const res = await this.client.post('/api/auth-svc/login', { username, password });
    if (res.status !== 200) {
      throw new Error(`Authentication failed for user "${username}" (Status: ${res.status})`);
    }
    console.log('Token: ' + res.data);
    this.token = res.data.accessToken;
    return this.token;
  }

  /**
   * Retrieves active product catalog and finds item matching by name.
   */
  async getProduct(productName) {
    const res = await this.client.get('/api/inventory-svc/products', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch inventory catalog (Status: ${res.status})`);
    }
    const products = res.data.data || res.data;
    if (!Array.isArray(products)) {
      throw new Error('Products response is not a valid list');
    }
    const cleanTargetName = productName.trim().toLowerCase();
    const match = products.find(p => p.name && p.name.trim().toLowerCase() === cleanTargetName);
    if (!match) {
      throw new Error(`Product "${productName}" was not found in active inventory catalog.`);
    }
    return {
      id: match.id,
      name: match.name,
      sku: match.sku,
      mrp: parseFloat(match.mrp),
      sellingPrice: parseFloat(match.sellingPrice),
      discount: parseFloat(match.discount || 0)
    };
  }

  /**
   * Fetches user profile to map internal user ID.
   */
  async getUserId(username) {
    const res = await this.client.get(`/api/users-svc/${username}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve user profile for "${username}" (Status: ${res.status})`);
    }
    this.userId = res.data.id;
    return this.userId;
  }

  /**
   * Retrieves active shop allocation ID for the given user ID.
   */
  async getShopId(userId) {
    const res = await this.client.get(`/api/sales-svc/shops-staff/user/${userId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch shop counter assignments for user ID ${userId} (Status: ${res.status})`);
    }
    const allocations = res.data;
    const target = Array.isArray(allocations) ? allocations[0] : allocations;
    if (!target || !target.shopId) {
      throw new Error(`No active shop counter allocation exists for user ID ${userId}`);
    }
    this.shopId = target.shopId;
    return this.shopId;
  }

  async getStock(shopId, productId) {
    const res = await this.client.get(`/api/sales-svc/retail/stocks/${shopId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve stock levels for shop ID ${shopId} (Status: ${res.status})`);
    }
    const stocks = res.data;
    const match = stocks.find(s => s.id && s.id.toString() === productId.toString());
    return match ? parseInt(match.shopStock, 10) : 0;
  }

  /**
   * Retrieves all counter stocks for a specific shop.
   */
  async getShopStocks(shopId) {
    const res = await this.client.get(`/api/sales-svc/retail/stocks/${shopId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve all stock levels for shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data;
  }

  /**
   * Places a draft order in the retail checkout channel.
   */
  async createDraftSale({ shopId, productId, productName, quantity, mrp, sellingPrice, discount, items }) {
    const body = {
      shopId: parseInt(shopId, 10),
      customerName: 'Framework E2E Customer',
      customerMobile: '9999988888',
      items: items || [
        {
          productId: parseInt(productId, 10),
          productName,
          hsnCode: 'HSN-1234',
          quantity: parseInt(quantity, 10),
          mrp: parseFloat(mrp),
          sellingPrice: parseFloat(sellingPrice),
          discount: parseFloat(discount || 0)
        }
      ]
    };
    const res = await this.client.post('/api/sales-svc/retail', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to initialize draft retail order (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async openShift(shopId, openingCash = 1000) {
    const body = {
      shopId: parseInt(shopId, 10),
      openingCash: parseFloat(openingCash),
      denominations: [
        { currencyValue: 500, noteCount: 2 }
      ]
    };
    const res = await this.client.post('/api/sales-svc/shifts/open', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to open shift session (Status: ${res.status}): ${JSON.stringify(res.data)}`);
    }
    return res.data;
  }

  /**
   * Confirms, settles and registers a sales order.
   */
  async confirmSale(orderNumber, totalAmount, cashAmt = null, onlineAmt = null) {
    // Automatically ensure a shift session is open
    try {
      if (this.shopId) {
        await this.openShift(this.shopId);
      }
    } catch (err) {
      // Ignore if already open or any other acceptable error
    }

    const cashSplit = cashAmt !== null ? cashAmt : totalAmount / 2;
    const onlineSplit = onlineAmt !== null ? onlineAmt : totalAmount / 2;
    const body = {
      paymentMode: 'BOTH',
      amount: parseFloat(totalAmount.toFixed(2)),
      cashAmount: parseFloat(cashSplit.toFixed(2)),
      onlineAmount: parseFloat(onlineSplit.toFixed(2)),
      paymentReference: `FW-TXN-${Date.now()}`
    };
    const res = await this.client.put(`/api/sales-svc/retail/${orderNumber}/confirm`, body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      console.error(`❌ [FW ERROR] confirmSale failed for order ${orderNumber} with Status ${res.status}. Response Body:`, JSON.stringify(res.data));
      if (res.status === 400) {
        // Return raw data for discrepancy tests
        return { status: res.status, data: res.data };
      }
      throw new Error(`Failed to confirm order ${orderNumber} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 1. Event Setup & Management ---
  async getEvents() {
    const res = await this.client.get('/api/sales-svc/events', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve events (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getEventById(eventId) {
    const res = await this.client.get(`/api/sales-svc/events/${eventId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve event ID ${eventId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async createEvent({ eventName, eventType, description, location, startDate, endDate, isActive }) {
    const body = { eventName, eventType, description, location, startDate, endDate, isActive: isActive !== false };
    const res = await this.client.post('/api/sales-svc/events', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to create event "${eventName}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 2. User Setup & Management ---
  async getRoles() {
    const res = await this.client.get('/api/users-svc/roles', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve user roles (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getUser(username) {
    const res = await this.client.get(`/api/users-svc/${username}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve user profile for "${username}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async registerUser({ username, email, mobile, password, fullName, role }) {
    const body = { username, email, mobile, password, fullName, role };
    const res = await this.client.post('/api/users-svc/register', body, { headers: this.headers });
    if (res.status === 409) {
      // Idempotent: user already exists — treat as success
      console.log(`ℹ️ User "${username}" already exists (409) — treating as idempotent success.`);
      return res.data.data || res.data || { username };
    }
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to register user "${username}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getAdminProfile() {
    const res = await this.client.get('/api/users-svc/admin', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve admin profile (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async assignEvents(username, eventIds) {
    let authUsername = 'admin';
    let authRoles = 'ADMIN';
    try {
      const adminProfile = await this.getAdminProfile();
      authUsername = adminProfile.username || 'admin';
      authRoles = Array.isArray(adminProfile.roles) ? adminProfile.roles.join(',') : (adminProfile.roles || 'ADMIN');
    } catch (err) {
      // Keep defaults
    }
    const hdrs = {
      ...this.headers,
      'X-Username': authUsername,
      'X-Roles': authRoles
    };
    const res = await this.client.post('/api/users-svc/assign-events', { username, eventIds }, { headers: hdrs });
    if (res.status !== 200) {
      throw new Error(`Failed to assign events to user "${username}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 3. Catalog Categories ---
  async createCategory({ name, description }) {
    const body = { name, description };
    const res = await this.client.post('/api/inventory-svc/categories', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to create category "${name}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getCategories() {
    const res = await this.client.get('/api/inventory-svc/categories', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve categories (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getCategoryById(categoryId) {
    const res = await this.client.get(`/api/inventory-svc/categories/${categoryId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve category ID ${categoryId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 4. Products Setup ---
  async createProduct({ categoryId, name, sku, description, mrp, sellingPrice, discount }) {
    const body = {
      categoryId: parseInt(categoryId, 10),
      name,
      sku,
      description,
      mrp: parseFloat(mrp),
      sellingPrice: parseFloat(sellingPrice),
      discount: parseFloat(discount || 0)
    };
    const res = await this.client.post('/api/inventory-svc/products', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to create product "${name}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getProductById(productId) {
    const res = await this.client.get(`/api/inventory-svc/products/${productId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve product ID ${productId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getProducts() {
    const res = await this.client.get('/api/inventory-svc/products', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve product catalog (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async searchProducts(name, isActive = true) {
    const res = await this.client.get(`/api/inventory-svc/products/search?name=${encodeURIComponent(name)}&isActive=${isActive}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to search products for "${name}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 5. Stock Management ---
  async createStockMovement({ productId, movementType, quantity, reason }) {
    const body = {
      productId: parseInt(productId, 10),
      movementType: movementType || 'IN',
      quantity: parseInt(quantity, 10),
      reason
    };
    const res = await this.client.post('/api/inventory-svc/stock-movements', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to create stock movement for product ID ${productId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getStocks() {
    const res = await this.client.get('/api/inventory-svc/stocks', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve stock records (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getInventorySales() {
    const res = await this.client.get('/api/inventory-svc/sales', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve inventory sales (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async issueStockToShop({ productId, sellerUser, shopId, quantity }) {
    const body = {
      productId: parseInt(productId, 10),
      sellerUser: sellerUser || 'admin',
      shopId: parseInt(shopId, 10),
      quantity: parseInt(quantity, 10)
    };
    const res = await this.client.post('/api/inventory-svc/sales', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to issue stock of product ID ${productId} to shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 6. Shop & Counter Registration ---
  async getShopByName(shopName) {
    const res = await this.client.get(`/api/sales-svc/shops/name/${encodeURIComponent(shopName)}`, { headers: this.headers });
    if (res.status !== 200 && res.status !== 404) {
      throw new Error(`Failed to search shop by name "${shopName}" (Status: ${res.status})`);
    }
    return res.status === 200 ? (res.data.data || res.data) : null;
  }

  async registerShop({ shopName, categoryId, counterNumber, isActive }) {
    const body = {
      shopName,
      categoryId: parseInt(categoryId, 10),
      counterNumber: parseInt(counterNumber, 10),
      isActive: isActive !== false
    };
    const res = await this.client.post('/api/sales-svc/shops/register', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to register shop counter "${shopName}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getShopById(shopId) {
    const res = await this.client.get(`/api/sales-svc/shops/${shopId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getShops() {
    const res = await this.client.get('/api/sales-svc/shops', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve shops (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 7. Staff Allocation ---
  async assignStaff({ shopId, userId, roleCode }) {
    const body = {
      shopId: parseInt(shopId, 10),
      userId: parseInt(userId, 10),
      roleCode
    };
    const res = await this.client.post('/api/sales-svc/shops-staff/assign', body, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed to assign staff user ID ${userId} to shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getStaffByShopId(shopId) {
    const res = await this.client.get(`/api/sales-svc/shops-staff/${shopId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve staff for shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 8. Order Returns & Cancellations ---
  async returnSale(orderNumber, { reason, items }) {
    const body = {
      reason,
      items: items.map(item => ({
        productId: parseInt(item.productId, 10),
        productName: item.productName,
        quantity: parseInt(item.quantity, 10),
        unitPrice: parseFloat(item.unitPrice)
      }))
    };
    const res = await this.client.put(`/api/sales-svc/retail/${orderNumber}/return`, body, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to process return for order ${orderNumber} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async cancelSale(orderNumber, reason) {
    const url = `/api/sales-svc/retail/${orderNumber}/cancel?reason=${encodeURIComponent(reason)}`;
    const res = await this.client.put(url, {}, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to cancel order ${orderNumber} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  // --- 9. Additional CRUD and High-Rigor Operations ---
  async updateEvent(eventId, payload) {
    const res = await this.client.put(`/api/sales-svc/events/${eventId}`, payload, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to update event ID ${eventId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async deleteEvent(eventId) {
    const res = await this.client.delete(`/api/sales-svc/events/${eventId}`, { headers: this.headers });
    if (res.status !== 200 && res.status !== 204) {
      throw new Error(`Failed to delete event ID ${eventId} (Status: ${res.status})`);
    }
    return res.data;
  }

  async updateShop(shopId, payload) {
    const res = await this.client.put(`/api/sales-svc/shops/${shopId}`, payload, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to update shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async deleteShop(shopId) {
    const res = await this.client.delete(`/api/sales-svc/shops/${shopId}`, { headers: this.headers });
    if (res.status !== 200 && res.status !== 204) {
      throw new Error(`Failed to delete shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data;
  }

  async getShopSalesHistory(shopId) {
    const res = await this.client.get(`/api/sales-svc/shops/${shopId}/history`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve sales history for shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async updateUserProfile(username, payload) {
    const res = await this.client.put(`/api/users-svc/${username}`, payload, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to update user profile for "${username}" (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async updateUserRole({ userId, roleIds }) {
    const res = await this.client.put('/api/users-svc/users-role', { userId, roleIds }, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to update user role for ID ${userId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async deleteUser(username) {
    const res = await this.client.delete(`/api/users-svc/${username}`, { headers: this.headers });
    if (res.status !== 200 && res.status !== 204) {
      throw new Error(`Failed to delete user "${username}" (Status: ${res.status})`);
    }
    return res.data;
  }

  async updateCategory(categoryId, payload) {
    const res = await this.client.put(`/api/inventory-svc/categories/${categoryId}`, payload, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to update category ID ${categoryId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async updateProduct(productId, payload) {
    const res = await this.client.put(`/api/inventory-svc/products/${productId}`, payload, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to update product ID ${productId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async deleteProduct(productId) {
    const res = await this.client.delete(`/api/inventory-svc/products/${productId}`, { headers: this.headers });
    if (res.status !== 200 && res.status !== 204) {
      throw new Error(`Failed to delete product ID ${productId} (Status: ${res.status})`);
    }
    return res.data;
  }

  async bulkCreateProducts(productsList) {
    const res = await this.client.post('/api/inventory-svc/products/bulk', productsList, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed bulk creating products (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async bulkIssueStock(bulkPayload) {
    const res = await this.client.post('/api/inventory-svc/sales/bulk', bulkPayload, { headers: this.headers });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Failed bulk issuing stock (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getActiveShift(shopId) {
    const res = await this.client.get(`/api/sales-svc/shifts/active/${shopId}`, { headers: this.headers });
    if (res.status !== 200 && res.status !== 404) {
      throw new Error(`Failed to fetch active shift for shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data;
  }

  async getShiftHistory(shopId) {
    const res = await this.client.get(`/api/sales-svc/shifts/history/${shopId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch shift history for shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data;
  }

  async closeShift(shiftId, payload) {
    const res = await this.client.post(`/api/sales-svc/shifts/${shiftId}/close`, payload, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to close shift ID ${shiftId} (Status: ${res.status})`);
    }
    return res.data;
  }

  async reconcileShift(shiftId, comment) {
    const res = await this.client.post(`/api/sales-svc/shifts/${shiftId}/reconcile`, { comment }, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to reconcile shift ID ${shiftId} (Status: ${res.status})`);
    }
    return res.data;
  }

  async getShopStaff(shopId) {
    const res = await this.client.get(`/api/sales-svc/shops-staff/${shopId}`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve staff for shop ID ${shopId} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getAllUsers() {
    const res = await this.client.get('/api/users-svc/allUsers', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch all users (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getProductSalesAnalytics() {
    const res = await this.client.get('/api/sales-svc/retail/analytics/product-shop-sales', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve product counter sales analytics (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getShiftProductSummary(shopId, shiftSessionId) {
    let url = '/api/sales-svc/retail/analytics/shift-product-summary?';
    const params = new URLSearchParams();
    if (shopId) params.append('shopId', shopId);
    if (shiftSessionId) params.append('shiftSessionId', shiftSessionId);
    const res = await this.client.get(url + params.toString(), { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to retrieve shift product summary (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getPaymentDetails(orderNumber) {
    const res = await this.client.get(`/api/sales-svc/retail/${orderNumber}/payment`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch payment details for order ${orderNumber} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getAllRetailSales() {
    const res = await this.client.get('/api/sales-svc/retail/all', { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch all retail sales (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }

  async getInvoiceItemsByOrderNo(orderNo) {
    const res = await this.client.get(`/api/billing-svc/invoices/order/${orderNo}/items`, { headers: this.headers });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch invoice items for order ${orderNo} (Status: ${res.status})`);
    }
    return res.data.data || res.data;
  }
}

/**
 * High-level runner that declaratively constructs Jest suites using CSV files.
 * 
 * @param {string} suiteName - Descriptive name of the Jest suite.
 * @param {string} csvFileName - Filename of the CSV feed relative to workspace root (e.g. 'sales_test_feed.csv').
 * @param {Function} [customTestCallback] - Optional callback override for custom flows. Receives (row, api).
 */
function runCsvSuite(suiteName, csvFileName, customTestCallback) {
  const fullCsvPath = path.join(__dirname, '..', '..', csvFileName);

  describe(suiteName, () => {
    let rows = [];

    beforeAll(() => {
      rows = readCsv(fullCsvPath);
    });

    test.each(
      (() => {
        const syncRows = readCsv(fullCsvPath);
        return syncRows.map((row, index) => [
          `Case #${index + 1}: ${row.username} checkout ${row.quantity}x ${row.product_name}`,
          row
        ]);
      })()
    )('%s', async (description, row) => {
      const api = new TestClient();
      api.setEventId(process.env.SELECTED_EVENT_ID)

      if (customTestCallback) {
        // Mode 2: Call custom testing flow override
        await customTestCallback(row, api);
      } else {
        // Mode 1: Default standard transaction & stock decrement verification flow

        // 1. Authenticate login
        await api.login(row.username, row.password);

        // 2. Map target product catalog details
        const product = await api.getProduct(row.product_name);

        // 3. Map profile details to find User ID
        const userId = await api.getUserId(row.username);

        // 4. Fetch shop counter allocation ID
        const shopId = await api.getShopId(userId);

        // 5. Record initial stock level
        const initialStock = await api.getStock(shopId, product.id);

        // 6. Place Draft order
        const draft = await api.createDraftSale({
          shopId,
          productId: product.id,
          productName: product.name,
          quantity: row.quantity,
          mrp: product.mrp,
          sellingPrice: product.sellingPrice,
          discount: product.discount
        });

        expect(draft.orderNumber).toBeDefined();

        // 7. Confirm & settle splits
        const grandTotal = (product.sellingPrice - product.discount) * parseInt(row.quantity, 10);
        const confirmation = await api.confirmSale(draft.orderNumber, grandTotal);
        expect(['CONFIRMED', 'SUCCESS', 'PAID']).toContain(confirmation.status);

        // 8. Assert inventory stock correctly decremented
        const finalStock = await api.getStock(shopId, product.id);
        const expectedStock = initialStock - parseInt(row.quantity, 10);

        console.log(`📉 Stock Verification -> Product: ${product.name} | Counter Shop ID: ${shopId} | Initial: ${initialStock} | Final: ${finalStock} (Expected: ${expectedStock})`);
        expect(finalStock).toBe(expectedStock);
      }
    });
  });
}

module.exports = {
  TestClient,
  runCsvSuite
};
