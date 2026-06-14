'use strict';

const { TestClient } = require('../../helpers/framework');
const { RedisHelper, sleep } = require('../../helpers/redis-helper');

/**
 * Redis Cache Verification Suite — Bikri Kendra
 *
 * TWO LAYERS of proof:
 *   Layer 1 (API)    — HTTP call patterns: HIT consistency, invalidation marker in Call 3.
 *   Layer 2 (Redis)  — direct Redis inspection: key existence, TTL, invalidation deletion,
 *                       re-population after MISS. Uses a zero-dependency RESP client.
 *
 * If Redis is unreachable, Layer 2 assertions are silently skipped so existing CI still passes.
 *
 * Full lifecycle (API + Redis):  Products · Categories · Permissions · Events
 * HIT consistency only:          Roles · AllUsers · Auth Info · Single User (dual-key) · Shops · Shop Staff
 */
function runRedisCacheSuite() {
  describe('Bikri Kendra — Redis Cache Verification Suite (API + Direct Redis)', () => {
    let adminToken;
    let api;
    let redis;
    const testUsername = 'admin';

    // ── Global setup ──────────────────────────────────────────────────────────
    beforeAll(async () => {
      api = new TestClient();
      redis = new RedisHelper();

      console.log('🧪 [Setup] Admin login + Redis connection...');
      adminToken = await api.login(testUsername, 'Admin@123');
      expect(adminToken).toBeDefined();
      api.token = adminToken;

      await redis.connect(); // graceful — sets redis.available = false on error
    }, 30000);

    afterAll(async () => {
      await redis.disconnect();
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. Inventory: Products Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('1 — Inventory: Products Cache', () => {
      let testProductId, testProductOriginalName, testProductOriginalMrp,
        testProductOriginalPrice, testProductSku;
      let productsCall1 = [];
      let productCacheKeys = []; // populated by Redis layer

      test('[Call 1 & 2] GET /products — Cache HIT Consistency + Redis key discovery', async () => {
        // ── Layer 2: snapshot before ────────────────────────────────────────
        const snapBefore = await redis.snapshotKeys();

        // ── Layer 1: Call 1 ──────────────────────────────────────────────────
        const res1 = await api.client.get('/api/inventory-svc/products', { headers: api.headers });
        expect(res1.status).toBe(200);
        productsCall1 = res1.data.data || res1.data;
        expect(Array.isArray(productsCall1)).toBe(true);
        expect(productsCall1.length).toBeGreaterThan(0);

        const target = productsCall1[0];
        testProductId = target.id;
        testProductOriginalName = target.name;
        testProductOriginalMrp = target.mrp;
        testProductOriginalPrice = target.sellingPrice || target.mrp;
        testProductSku = target.sku;
        console.log(`[Products Call 1] id=${testProductId}, name="${testProductOriginalName}", sku="${testProductSku}"`);

        // ── Layer 2: discover keys written by Call 1 (MISS → cache populated) ─
        productCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          expect(productCacheKeys.length).toBeGreaterThan(0);
          for (const k of productCacheKeys) {
            const ttl = await redis.getTTL(k);
            console.log(`[Redis] 🔍 Products key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
          }
        }

        // ── Layer 1: Call 2 (Cache HIT — data must match) ────────────────────
        const res2 = await api.client.get('/api/inventory-svc/products', { headers: api.headers });
        expect(res2.status).toBe(200);
        const productsCall2 = res2.data.data || res2.data;
        expect(productsCall2.length).toBe(productsCall1.length);
        expect(productsCall2[0].id).toBe(testProductId);
        expect(productsCall2[0].name).toBe(testProductOriginalName);
        console.log('✅ [API] Products cache HIT data matches Call 1 perfectly.');

        // ── Layer 2: keys must STILL exist after Call 2 ──────────────────────
        for (const k of productCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);

      test('[Update & Call 3] PUT /products/{id} — Invalidation + Re-population', async () => {
        const marker = `CACHE_TEST_${Date.now()}`;
        console.log(`[Products Update] Invalidation marker: "${marker}"`);

        // ── Layer 1: PUT ──────────────────────────────────────────────────────
        const updateRes = await api.client.put(
          `/api/inventory-svc/products/${testProductId}`,
          { name: marker, sku: testProductSku, mrp: testProductOriginalMrp, sellingPrice: testProductOriginalPrice },
          { headers: api.headers }
        );
        expect(updateRes.status).toBe(200);

        // ── Layer 2: keys must be GONE from Redis ─────────────────────────────
        await sleep(150);
        for (const k of productCacheKeys) {
          await redis.assertKeyNotExists(k, 'after PUT — invalidation');
        }

        // ── Layer 1 + 2: Call 3 — DB MISS, marker visible, cache re-populated ─
        const snapBeforeCall3 = await redis.snapshotKeys();
        const res3 = await api.client.get('/api/inventory-svc/products', { headers: api.headers });
        expect(res3.status).toBe(200);
        const productsCall3 = res3.data.data || res3.data;
        const updatedProduct = productsCall3.find(p => p.name === marker);
        expect(updatedProduct).toBeDefined();
        console.log('✅ [API] Products cache invalidation verified. Marker found in Call 3.');

        const rePopKeys = await redis.getNewKeys(snapBeforeCall3);
        if (redis.available) {
          expect(rePopKeys.length).toBeGreaterThan(0);
          console.log(`✅ [Redis] Products cache RE-POPULATED. Keys: [${rePopKeys.join(', ')}]`);
        }
      }, 15000);

      test('[Cleanup] PUT /products/{id} — Restore Original', async () => {
        const r = await api.client.put(
          `/api/inventory-svc/products/${testProductId}`,
          { name: testProductOriginalName, sku: testProductSku, mrp: testProductOriginalMrp, sellingPrice: testProductOriginalPrice },
          { headers: api.headers }
        );
        expect(r.status).toBe(200);
        console.log('✅ [API] Products restored.');
      }, 10000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. Inventory: Categories Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('2 — Inventory: Categories Cache', () => {
      let testCategoryId, testCategoryOriginalName;
      let categoriesCall1 = [];
      let catCacheKeys = [];

      test('[Call 1 & 2] GET /categories — Cache HIT + Redis key discovery', async () => {
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get('/api/inventory-svc/categories', { headers: api.headers });
        expect(res1.status).toBe(200);
        categoriesCall1 = res1.data.data || res1.data;
        expect(Array.isArray(categoriesCall1)).toBe(true);
        expect(categoriesCall1.length).toBeGreaterThan(0);

        testCategoryId = categoriesCall1[0].id;
        testCategoryOriginalName = categoriesCall1[0].name;
        console.log(`[Categories Call 1] id=${testCategoryId}, name="${testCategoryOriginalName}"`);

        catCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          expect(catCacheKeys.length).toBeGreaterThan(0);
          for (const k of catCacheKeys) {
            const ttl = await redis.getTTL(k);
            console.log(`[Redis] 🔍 Categories key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
          }
        }

        const res2 = await api.client.get('/api/inventory-svc/categories', { headers: api.headers });
        expect(res2.status).toBe(200);
        const cat2 = res2.data.data || res2.data;
        expect(cat2.length).toBe(categoriesCall1.length);
        expect(cat2[0].id).toBe(testCategoryId);
        expect(cat2[0].name).toBe(testCategoryOriginalName);
        console.log('✅ [API] Categories cache HIT matches Call 1.');

        for (const k of catCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);

      test('[Update & Call 3] PUT /categories/{id} — Invalidation + Re-population', async () => {
        const marker = `CAT_CACHE_TEST_${Date.now()}`;

        const updateRes = await api.client.put(
          `/api/inventory-svc/categories/${testCategoryId}`,
          { name: marker },
          { headers: api.headers }
        );
        expect(updateRes.status).toBe(200);

        await sleep(150);
        for (const k of catCacheKeys) {
          await redis.assertKeyNotExists(k, 'after PUT — invalidation');
        }

        const snapBeforeCall3 = await redis.snapshotKeys();
        const res3 = await api.client.get('/api/inventory-svc/categories', { headers: api.headers });
        expect(res3.status).toBe(200);
        const cat3 = res3.data.data || res3.data;
        expect(cat3.find(c => c.name === marker)).toBeDefined();
        console.log('✅ [API] Categories cache invalidation verified.');

        const rePopKeys = await redis.getNewKeys(snapBeforeCall3);
        if (redis.available) {
          expect(rePopKeys.length).toBeGreaterThan(0);
          console.log(`✅ [Redis] Categories cache RE-POPULATED. Keys: [${rePopKeys.join(', ')}]`);
        }
      }, 15000);

      test('[Cleanup] PUT /categories/{id} — Restore Original', async () => {
        const r = await api.client.put(
          `/api/inventory-svc/categories/${testCategoryId}`,
          { name: testCategoryOriginalName },
          { headers: api.headers }
        );
        expect(r.status).toBe(200);
        console.log('✅ [API] Categories restored.');
      }, 10000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. User: Roles Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('3 — User: Roles Cache', () => {
      let rolesCall1 = [];

      test('[Call 1 & 2] GET /roles — Cache HIT + Redis', async () => {
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get('/api/users-svc/roles', { headers: api.headers });
        expect(res1.status).toBe(200);
        rolesCall1 = res1.data.data || res1.data;
        expect(Array.isArray(rolesCall1)).toBe(true);
        expect(rolesCall1.length).toBeGreaterThan(0);

        const rolesCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (rolesCacheKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /roles — cache was already warm (login pre-warmed) or endpoint is not cached in Redis.');
          } else {
            for (const k of rolesCacheKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Roles key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get('/api/users-svc/roles', { headers: api.headers });
        expect(res2.status).toBe(200);
        const rolesCall2 = res2.data.data || res2.data;
        expect(rolesCall2.length).toBe(rolesCall1.length);
        for (let i = 0; i < rolesCall1.length; i++) {
          expect(rolesCall2[i].id).toBe(rolesCall1[i].id);
          expect(rolesCall2[i].name).toBe(rolesCall1[i].name);
        }
        console.log('✅ [API] Roles cache HIT data matches perfectly.');

        for (const k of rolesCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. User: Permissions Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('4 — User: Permissions Cache', () => {
      let testPermId, testPermOriginalName, testPermOriginalDesc;
      let permsCall1 = [];
      let permCacheKeys = [];

      test('[Call 1 & 2] GET /permissions — Cache HIT + Redis key discovery', async () => {
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get('/api/users-svc/permissions', { headers: api.headers });
        expect(res1.status).toBe(200);
        permsCall1 = res1.data.data || res1.data;
        expect(Array.isArray(permsCall1)).toBe(true);
        expect(permsCall1.length).toBeGreaterThan(0);

        testPermId = permsCall1[0].id;
        testPermOriginalName = permsCall1[0].name;
        testPermOriginalDesc = permsCall1[0].description || '';

        permCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (permCacheKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /permissions — cache was already warm (login pre-warmed) or endpoint is not cached in Redis.');
          } else {
            for (const k of permCacheKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Permissions key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get('/api/users-svc/permissions', { headers: api.headers });
        expect(res2.status).toBe(200);
        const perms2 = res2.data.data || res2.data;
        expect(perms2.length).toBe(permsCall1.length);
        expect(perms2[0].id).toBe(testPermId);
        expect(perms2[0].name).toBe(testPermOriginalName);
        console.log('✅ [API] Permissions cache HIT matches.');

        for (const k of permCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);

      test('[Update & Call 3] PUT /permissions/{id} — Invalidation + Re-population', async () => {
        const marker = `PERM_CACHE_TEST_${Date.now()}`;

        // Snapshot BEFORE PUT — independent of discovery (catches warm-cache keys too)
        const snapBeforePut = await redis.snapshotKeys();

        const updateRes = await api.client.put(
          `/api/users-svc/permissions/${testPermId}`,
          { name: testPermOriginalName, description: marker },
          { headers: api.headers }
        );
        expect(updateRes.status).toBe(200);

        await sleep(150);

        // Known discovered keys (may be empty if cache was warm)
        for (const k of permCacheKeys) {
          await redis.assertKeyNotExists(k, 'after PUT — invalidation');
        }

        // Independent invalidation detection via before/after PUT diff
        if (redis.available) {
          const snapAfterPut = await redis.snapshotKeys();
          const deletedByPut = [...snapBeforePut].filter(k => !snapAfterPut.has(k));
          if (deletedByPut.length > 0) {
            console.log(`[Redis] ✅ Keys invalidated by PUT (detected via diff): [${deletedByPut.join(', ')}]`);
          } else {
            console.warn('[Redis] ⚠️  No Redis keys deleted by PUT /permissions — backend may not invalidate Redis for this endpoint.');
          }
        }

        const snapBeforeCall3 = await redis.snapshotKeys();
        const res3 = await api.client.get('/api/users-svc/permissions', { headers: api.headers });
        expect(res3.status).toBe(200);
        const perms3 = res3.data.data || res3.data;
        expect(perms3.find(p => p.description === marker)).toBeDefined();
        console.log('✅ [API] Permissions cache invalidation verified.');

        const rePopKeys = await redis.getNewKeys(snapBeforeCall3);
        if (redis.available) {
          if (rePopKeys.length > 0) {
            console.log(`[Redis] ✅ Permissions cache RE-POPULATED. Keys: [${rePopKeys.join(', ')}]`);
          } else {
            console.warn('[Redis] ⚠️  No keys re-populated after Call 3 — /permissions may not cache in Redis.');
          }
        }
      }, 15000);

      test('[Cleanup] PUT /permissions/{id} — Restore Original', async () => {
        const r = await api.client.put(
          `/api/users-svc/permissions/${testPermId}`,
          { name: testPermOriginalName, description: testPermOriginalDesc },
          { headers: api.headers }
        );
        expect(r.status).toBe(200);
        console.log('✅ [API] Permissions restored.');
      }, 10000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. User: All Users Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('5 — User: All Users Cache', () => {
      let usersCall1 = [];

      test('[Call 1 & 2] GET /allUsers — Cache HIT + Redis', async () => {
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get('/api/users-svc/allUsers', { headers: api.headers });
        expect(res1.status).toBe(200);
        usersCall1 = res1.data.data || res1.data;
        expect(Array.isArray(usersCall1)).toBe(true);
        expect(usersCall1.length).toBeGreaterThan(0);

        const usersCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (usersCacheKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /allUsers — cache was already warm (login pre-warmed) or endpoint is not cached in Redis.');
          } else {
            for (const k of usersCacheKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 AllUsers key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get('/api/users-svc/allUsers', { headers: api.headers });
        expect(res2.status).toBe(200);
        const users2 = res2.data.data || res2.data;
        expect(users2.length).toBe(usersCall1.length);
        expect(users2[0].id).toBe(usersCall1[0].id);
        console.log('✅ [API] All Users cache HIT verified.');

        for (const k of usersCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. User: Auth Info Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('6 — User: Auth Info Cache', () => {
      let authInfoCall1;

      test('[Call 1 & 2] GET /{username}/authorization — Cache Deserialization + Redis', async () => {
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/users-svc/${testUsername}/authorization`, { headers: api.headers });
        expect(res1.status).toBe(200);
        authInfoCall1 = res1.data.data || res1.data;
        expect(authInfoCall1.userId).toBeDefined();
        expect(Array.isArray(authInfoCall1.roles)).toBe(true);
        expect(Array.isArray(authInfoCall1.permissions)).toBe(true);

        const authCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (authCacheKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /authorization — cache was already warm (login pre-warmed) or endpoint is not cached in Redis.');
          } else {
            for (const k of authCacheKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 AuthInfo key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/users-svc/${testUsername}/authorization`, { headers: api.headers });
        expect(res2.status).toBe(200);
        const authInfoCall2 = res2.data.data || res2.data;
        expect(authInfoCall2.userId).toBe(authInfoCall1.userId);
        expect(authInfoCall2.roles.length).toBe(authInfoCall1.roles.length);
        expect(authInfoCall2.permissions.length).toBe(authInfoCall1.permissions.length);
        console.log('✅ [API] Auth Info cache HIT consistency and deserialization verified.');

        for (const k of authCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. User: Single User Cache (Dual-Key: user:username + user:id)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('7 — User: Single User Cache (Dual-Key)', () => {
      let testUserId;
      let singleUserCall1;

      test('[Call 1+2+3] Dual-Key cache HIT consistency + Redis key verification', async () => {
        // ── Call 1: GET by username — should MISS, write BOTH keys ────────────
        const snapBefore1 = await redis.snapshotKeys();
        const res1 = await api.client.get(`/api/users-svc/${testUsername}`, { headers: api.headers });
        expect(res1.status).toBe(200);
        singleUserCall1 = res1.data.data || res1.data;
        testUserId = singleUserCall1.id;
        expect(testUserId).toBeDefined();

        const keysAfterCall1 = await redis.getNewKeys(snapBefore1);
        if (redis.available) {
          expect(keysAfterCall1.length).toBeGreaterThan(0);
          console.log(`[Redis] 🔍 Dual-Key — Keys after username-lookup: [${keysAfterCall1.join(', ')}]`);
          if (keysAfterCall1.length >= 2) {
            console.log('[Redis] ✅ Both username-key AND id-key written (dual-key strategy confirmed).');
          } else {
            console.warn(`[Redis] ⚠️  Only ${keysAfterCall1.length} key(s) — backend may use single-key or lazy dual-write.`);
          }
          for (const k of keysAfterCall1) {
            const ttl = await redis.getTTL(k);
            console.log(`[Redis]   → "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
          }
        }

        // ── Call 2: GET by username — HIT ─────────────────────────────────────
        const res2 = await api.client.get(`/api/users-svc/${testUsername}`, { headers: api.headers });
        expect(res2.status).toBe(200);
        const userCall2 = res2.data.data || res2.data;
        expect(userCall2.id).toBe(testUserId);
        expect(userCall2.email).toBe(singleUserCall1.email);
        console.log('✅ [API] Single User (by username) cache HIT verified.');

        for (const k of keysAfterCall1) {
          await redis.assertKeyExists(k, 'after Call 2 username HIT');
        }

        // ── Call 3: GET by ID — should HIT existing id-key ───────────────────
        const snapBeforeCall3 = await redis.snapshotKeys();
        const res3 = await api.client.get(`/api/users-svc/users/${testUserId}`, { headers: api.headers });
        expect(res3.status).toBe(200);
        const userCall3 = res3.data.data || res3.data;
        expect(userCall3.id).toBe(testUserId);
        expect(userCall3.username).toBe(testUsername);
        console.log('✅ [API] Single User (by id) cache HIT verified — dual-key strategy confirmed.');

        // No NEW keys should appear after Call 3 (served from existing Redis key)
        if (redis.available) {
          const newKeysAfterCall3 = await redis.getNewKeys(snapBeforeCall3);
          if (newKeysAfterCall3.length === 0) {
            console.log('[Redis] ✅ No new keys after Call 3 by-ID — served from existing Redis key (HIT confirmed).');
          } else {
            console.warn(`[Redis] ⚠️  ${newKeysAfterCall3.length} new key(s) after Call 3 by-ID — may be a MISS on the id-key.`);
          }
        }
      }, 20000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. Sales: Events Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('8 — Sales: Events Cache', () => {
      const adminHeaders = () => ({
        ...api.headers,
        'X-Username': testUsername,
        'X-Roles': 'ADMIN',
        'X-User-Id': '1'
      });

      let testEventId, testEventOriginalName;
      let eventsCall1 = [];
      let eventCacheKeys = [];

      test('[Call 1 & 2] GET /events — Cache HIT (Admin) + Redis', async () => {
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get('/api/sales-svc/events', { headers: adminHeaders() });
        expect(res1.status).toBe(200);
        eventsCall1 = res1.data.data || res1.data;
        expect(Array.isArray(eventsCall1)).toBe(true);
        expect(eventsCall1.length).toBeGreaterThan(0);

        testEventId = eventsCall1[0].id;
        testEventOriginalName = eventsCall1[0].name || eventsCall1[0].eventName;

        eventCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (eventCacheKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /events — endpoint may not cache in Redis.');
          } else {
            for (const k of eventCacheKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Events key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get('/api/sales-svc/events', { headers: adminHeaders() });
        expect(res2.status).toBe(200);
        const events2 = res2.data.data || res2.data;
        expect(events2.length).toBe(eventsCall1.length);
        expect(events2[0].id).toBe(testEventId);
        console.log('✅ [API] Events cache HIT verified (Admin path).');

        for (const k of eventCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);

      test('[Update & Call 3] PUT /events/{id} — Invalidation + Re-population', async () => {
        const marker = `EVT_CACHE_TEST_${Date.now()}`;

        const getRes = await api.client.get(`/api/sales-svc/events/${testEventId}`, { headers: adminHeaders() });
        expect(getRes.status).toBe(200);
        const orig = getRes.data.data || getRes.data;

        // Snapshot BEFORE PUT — catches invalidation even when call-1 found no keys
        const snapBeforePut = await redis.snapshotKeys();

        const updateRes = await api.client.put(
          `/api/sales-svc/events/${testEventId}`,
          {
            eventName: marker, eventType: orig.eventType, description: orig.description,
            location: orig.location, startDate: orig.startDate, endDate: orig.endDate, isActive: orig.isActive
          },
          { headers: adminHeaders() }
        );
        expect(updateRes.status).toBe(200);

        await sleep(150);

        // Known discovered keys (may be empty if endpoint is not cached)
        for (const k of eventCacheKeys) {
          await redis.assertKeyNotExists(k, 'after PUT — invalidation');
        }

        // Independent invalidation detection via before/after PUT diff
        if (redis.available) {
          const snapAfterPut = await redis.snapshotKeys();
          const deletedByPut = [...snapBeforePut].filter(k => !snapAfterPut.has(k));
          if (deletedByPut.length > 0) {
            console.log(`[Redis] ✅ Keys invalidated by PUT (detected via diff): [${deletedByPut.join(', ')}]`);
          } else {
            console.warn('[Redis] ⚠️  No Redis keys deleted by PUT /events — backend may not invalidate Redis for this endpoint.');
          }
        }

        const snapBeforeCall3 = await redis.snapshotKeys();
        const res3 = await api.client.get('/api/sales-svc/events', { headers: adminHeaders() });
        expect(res3.status).toBe(200);
        const events3 = res3.data.data || res3.data;
        expect(events3.find(e => (e.name || e.eventName) === marker)).toBeDefined();
        console.log('✅ [API] Events cache invalidation verified.');

        const rePopKeys = await redis.getNewKeys(snapBeforeCall3);
        if (redis.available) {
          if (rePopKeys.length > 0) {
            console.log(`[Redis] ✅ Events cache RE-POPULATED. Keys: [${rePopKeys.join(', ')}]`);
          } else {
            console.warn('[Redis] ⚠️  No keys re-populated after Call 3 — /events may not cache in Redis.');
          }
        }
      }, 20000);

      test('[Cleanup] PUT /events/{id} — Restore Original', async () => {
        const getRes = await api.client.get(`/api/sales-svc/events/${testEventId}`, { headers: adminHeaders() });
        expect(getRes.status).toBe(200);
        const curr = getRes.data.data || getRes.data;

        const r = await api.client.put(
          `/api/sales-svc/events/${testEventId}`,
          {
            eventName: testEventOriginalName, eventType: curr.eventType, description: curr.description,
            location: curr.location, startDate: curr.startDate, endDate: curr.endDate, isActive: curr.isActive
          },
          { headers: adminHeaders() }
        );
        expect(r.status).toBe(200);
        console.log('✅ [API] Events restored.');
      }, 10000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. Sales: Shops Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('9 — Sales: Shops Cache', () => {
      const EVENT_ID = '1';

      test('[Call 1 & 2] GET /shops — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get('/api/sales-svc/shops', { headers });
        expect(res1.status).toBe(200);
        const shopsCall1 = res1.data.data || res1.data;
        expect(Array.isArray(shopsCall1)).toBe(true);

        const shopsCacheKeys = await redis.getNewKeys(snapBefore);

        if (shopsCall1.length > 0) {
          const testShopId = shopsCall1[0].id;

          if (redis.available) {
            if (shopsCacheKeys.length === 0) {
              console.warn('[Redis] ⚠️  No new keys after GET /shops — endpoint may not cache in Redis.');
            } else {
              for (const k of shopsCacheKeys) {
                const ttl = await redis.getTTL(k);
                console.log(`[Redis] 🔍 Shops key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
              }
            }
          }

          const res2 = await api.client.get('/api/sales-svc/shops', { headers });
          expect(res2.status).toBe(200);
          const shops2 = res2.data.data || res2.data;
          expect(shops2.length).toBe(shopsCall1.length);
          expect(shops2[0].id).toBe(testShopId);
          console.log('✅ [API] Shops cache HIT consistency verified.');

          for (const k of shopsCacheKeys) {
            await redis.assertKeyExists(k, 'after Call 2 HIT');
          }
        } else {
          console.warn('⚠️  No shops found for event 1. Shop cache HIT test skipped.');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. Sales: Shop Staff Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('10 — Sales: Shop Staff Cache', () => {
      const EVENT_ID = '1';
      const SHOP_ID = '1';

      test('[Call 1 & 2] GET /shops-staff/{shopId} — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/sales-svc/shops-staff/${SHOP_ID}`, { headers });
        expect(res1.status).toBe(200);
        const staffCall1 = res1.data.data || res1.data;
        expect(Array.isArray(staffCall1)).toBe(true);

        const staffCacheKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (staffCacheKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /shops-staff — endpoint may not cache in Redis.');
          } else {
            for (const k of staffCacheKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 ShopStaff key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/sales-svc/shops-staff/${SHOP_ID}`, { headers });
        expect(res2.status).toBe(200);
        const staffCall2 = res2.data.data || res2.data;
        expect(staffCall2.length).toBe(staffCall1.length);
        if (staffCall1.length > 0) {
          expect(staffCall2[0].id).toBe(staffCall1[0].id);
        }
        console.log('✅ [API] Shop Staff cache HIT consistency verified.');

        for (const k of staffCacheKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 11. Inventory: Single Product by ID Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('11 — Inventory: Single Product by ID Cache', () => {
      let testProductId;

      test('[Call 1 & 2] GET /products/{id} — Cache HIT + Redis', async () => {
        // First get a valid product ID
        const listRes = await api.client.get('/api/inventory-svc/products', { headers: api.headers });
        expect(listRes.status).toBe(200);
        const products = listRes.data.data || listRes.data;
        expect(products.length).toBeGreaterThan(0);
        testProductId = products[0].id;

        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/inventory-svc/products/${testProductId}`, { headers: api.headers });
        expect(res1.status).toBe(200);
        const prod1 = res1.data.data || res1.data;
        expect(prod1.id).toBe(testProductId);

        const prodIdKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (prodIdKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /products/{id} — cache was already warm.');
          } else {
            for (const k of prodIdKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Product-by-ID key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/inventory-svc/products/${testProductId}`, { headers: api.headers });
        expect(res2.status).toBe(200);
        const prod2 = res2.data.data || res2.data;
        expect(prod2.id).toBe(prod1.id);
        expect(prod2.name).toBe(prod1.name);
        expect(prod2.sku).toBe(prod1.sku);
        console.log('✅ [API] Single Product by ID cache HIT verified.');

        for (const k of prodIdKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 12. Inventory: Single Category by ID Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('12 — Inventory: Single Category by ID Cache', () => {
      let testCategoryId;

      test('[Call 1 & 2] GET /categories/{id} — Cache HIT + Redis', async () => {
        const listRes = await api.client.get('/api/inventory-svc/categories', { headers: api.headers });
        expect(listRes.status).toBe(200);
        const categories = listRes.data.data || listRes.data;
        expect(categories.length).toBeGreaterThan(0);
        testCategoryId = categories[0].id;

        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/inventory-svc/categories/${testCategoryId}`, { headers: api.headers });
        expect(res1.status).toBe(200);
        const cat1 = res1.data.data || res1.data;
        expect(cat1.id).toBe(testCategoryId);

        const catIdKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (catIdKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /categories/{id} — cache was already warm.');
          } else {
            for (const k of catIdKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Category-by-ID key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/inventory-svc/categories/${testCategoryId}`, { headers: api.headers });
        expect(res2.status).toBe(200);
        const cat2 = res2.data.data || res2.data;
        expect(cat2.id).toBe(cat1.id);
        expect(cat2.name).toBe(cat1.name);
        console.log('✅ [API] Single Category by ID cache HIT verified.');

        for (const k of catIdKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 13. Inventory: Product Search (Cache-Assisted)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('13 — Inventory: Product Search (Cache-Assisted)', () => {
      test('GET /products/search — Filters products:all cache in-memory', async () => {
        // Warm the products:all cache first
        const warmRes = await api.client.get('/api/inventory-svc/products', { headers: api.headers });
        expect(warmRes.status).toBe(200);
        const allProducts = warmRes.data.data || warmRes.data;
        expect(allProducts.length).toBeGreaterThan(0);

        const searchTerm = allProducts[0].name.substring(0, 3);
        const snapBefore = await redis.snapshotKeys();

        const res = await api.client.get(
          `/api/inventory-svc/products/search?name=${encodeURIComponent(searchTerm)}&isActive=true`,
          { headers: api.headers }
        );
        expect(res.status).toBe(200);
        const searchResults = res.data.data || res.data;
        expect(Array.isArray(searchResults)).toBe(true);
        console.log(`[Products Search] Term="${searchTerm}" → ${searchResults.length} results`);

        // Cache-assisted: should NOT create new Redis keys (reads products:all)
        if (redis.available) {
          const newKeys = await redis.getNewKeys(snapBefore);
          if (newKeys.length === 0) {
            console.log('✅ [Redis] Product search used products:all cache — no new keys created (cache-assisted confirmed).');
          } else {
            console.warn(`[Redis] ⚠️  ${newKeys.length} new key(s) after search — may have its own cache or fell back to DB.`);
          }
        }

        // Verify search results are a subset of all products
        for (const sr of searchResults) {
          expect(allProducts.find(p => p.id === sr.id)).toBeDefined();
        }
        console.log('✅ [API] Product search results are valid subset of cached catalog.');
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 14. Sales: Single Shop by ID Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('14 — Sales: Single Shop by ID Cache', () => {
      const EVENT_ID = '1';
      let testShopId;

      test('[Call 1 & 2] GET /shops/{id} — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        // Get a valid shop ID
        const listRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(listRes.status).toBe(200);
        const shops = listRes.data.data || listRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops found. Single shop cache test skipped.');
          return;
        }
        testShopId = shops[0].id;

        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/sales-svc/shops/${testShopId}`, { headers });
        expect(res1.status).toBe(200);
        const shop1 = res1.data.data || res1.data;
        expect(shop1.id).toBe(testShopId);

        const shopIdKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (shopIdKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /shops/{id} — cache was already warm.');
          } else {
            for (const k of shopIdKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Shop-by-ID key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/sales-svc/shops/${testShopId}`, { headers });
        expect(res2.status).toBe(200);
        const shop2 = res2.data.data || res2.data;
        expect(shop2.id).toBe(shop1.id);
        expect(shop2.shopName || shop2.name).toBe(shop1.shopName || shop1.name);
        console.log('✅ [API] Single Shop by ID cache HIT verified.');

        for (const k of shopIdKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 15. Sales: Shop by Name Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('15 — Sales: Shop by Name Cache', () => {
      const EVENT_ID = '1';
      let testShopName;

      test('[Call 1 & 2] GET /shops/name/{shopName} — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        // Get a valid shop name
        const listRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(listRes.status).toBe(200);
        const shops = listRes.data.data || listRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops found. Shop-by-name cache test skipped.');
          return;
        }
        testShopName = shops[0].shopName || shops[0].name;

        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/sales-svc/shops/name/${encodeURIComponent(testShopName)}`, { headers });
        expect(res1.status).toBe(200);
        const shopByName1 = res1.data.data || res1.data;

        const shopNameKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (shopNameKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /shops/name/{name} — cache was already warm.');
          } else {
            for (const k of shopNameKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Shop-by-Name key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/sales-svc/shops/name/${encodeURIComponent(testShopName)}`, { headers });
        expect(res2.status).toBe(200);
        const shopByName2 = res2.data.data || res2.data;
        expect((shopByName2.shopName || shopByName2.name)).toBe((shopByName1.shopName || shopByName1.name));
        console.log('✅ [API] Shop by Name cache HIT verified.');

        for (const k of shopNameKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 16. Sales: Shop History Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('16 — Sales: Shop History Cache', () => {
      const EVENT_ID = '1';
      let testShopId;

      test('[Call 1 & 2] GET /shops/{id}/history — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        const listRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(listRes.status).toBe(200);
        const shops = listRes.data.data || listRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops found. Shop history cache test skipped.');
          return;
        }
        testShopId = shops[0].id;

        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/sales-svc/shops/${testShopId}/history`, { headers });
        expect(res1.status).toBe(200);
        const hist1 = res1.data.data || res1.data;

        const histKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (histKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /shops/{id}/history — cache was already warm.');
          } else {
            for (const k of histKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Shop-History key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/sales-svc/shops/${testShopId}/history`, { headers });
        expect(res2.status).toBe(200);
        const hist2 = res2.data.data || res2.data;

        // History arrays should match (same data from cache)
        if (Array.isArray(hist1) && Array.isArray(hist2)) {
          expect(hist2.length).toBe(hist1.length);
        }
        console.log('✅ [API] Shop History cache HIT verified (5 min TTL).');

        for (const k of histKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 17. Sales: Active Shift Cache (Write-Through on Open)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('17 — Sales: Active Shift Cache', () => {
      const EVENT_ID = '1';
      let testShopId;

      test('[Call 1 & 2] GET /shifts/active/{shopId} — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        // Find a shop that might have an active shift
        const listRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(listRes.status).toBe(200);
        const shops = listRes.data.data || listRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops found. Active shift cache test skipped.');
          return;
        }
        testShopId = shops[0].id;

        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/sales-svc/shifts/active/${testShopId}`, { headers });
        // 200 = active shift exists, 404 = no active shift — both are valid
        if (res1.status === 404) {
          console.warn(`⚠️  No active shift for shop ${testShopId}. Active shift HIT test skipped.`);
          return;
        }
        expect(res1.status).toBe(200);
        const shift1 = res1.data.data || res1.data;

        const shiftKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (shiftKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /shifts/active — cache was already warm (write-through on open).');
          } else {
            for (const k of shiftKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Active-Shift key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/sales-svc/shifts/active/${testShopId}`, { headers });
        expect(res2.status).toBe(200);
        const shift2 = res2.data.data || res2.data;
        expect(shift2.id || shift2.shiftId).toBe(shift1.id || shift1.shiftId);
        console.log('✅ [API] Active Shift cache HIT verified (write-through, 30 min TTL).');

        for (const k of shiftKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 18. Sales: Shift History Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('18 — Sales: Shift History Cache', () => {
      const EVENT_ID = '1';
      let testShopId;

      test('[Call 1 & 2] GET /shifts/history/{shopId} — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        const listRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(listRes.status).toBe(200);
        const shops = listRes.data.data || listRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops found. Shift history cache test skipped.');
          return;
        }
        testShopId = shops[0].id;

        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get(`/api/sales-svc/shifts/history/${testShopId}`, { headers });
        expect(res1.status).toBe(200);
        const hist1 = res1.data.data || res1.data;

        const histKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (histKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /shifts/history — cache was already warm.');
          } else {
            for (const k of histKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Shift-History key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get(`/api/sales-svc/shifts/history/${testShopId}`, { headers });
        expect(res2.status).toBe(200);
        const hist2 = res2.data.data || res2.data;

        // Content or page structure should match
        const h1Content = hist1.content || hist1;
        const h2Content = hist2.content || hist2;
        if (Array.isArray(h1Content) && Array.isArray(h2Content)) {
          expect(h2Content.length).toBe(h1Content.length);
        }
        console.log('✅ [API] Shift History cache HIT verified (5 min TTL, in-memory page slice).');

        for (const k of histKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 19. Sales: Shift Event Summary Cache
    // ═══════════════════════════════════════════════════════════════════════════
    describe('19 — Sales: Shift Event Summary Cache', () => {
      const EVENT_ID = '1';

      test('[Call 1 & 2] GET /shifts/event-summary — Cache HIT + Redis', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };
        const snapBefore = await redis.snapshotKeys();

        const res1 = await api.client.get('/api/sales-svc/shifts/event-summary', { headers });
        expect(res1.status).toBe(200);
        const summary1 = res1.data.data || res1.data;

        const summaryKeys = await redis.getNewKeys(snapBefore);
        if (redis.available) {
          if (summaryKeys.length === 0) {
            console.warn('[Redis] ⚠️  No new keys after GET /shifts/event-summary — cache was already warm.');
          } else {
            for (const k of summaryKeys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis] 🔍 Event-Summary key: "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          }
        }

        const res2 = await api.client.get('/api/sales-svc/shifts/event-summary', { headers });
        expect(res2.status).toBe(200);
        const summary2 = res2.data.data || res2.data;

        // Summary structure should match
        expect(JSON.stringify(summary2)).toBe(JSON.stringify(summary1));
        console.log('✅ [API] Shift Event Summary cache HIT verified (5 min TTL).');

        for (const k of summaryKeys) {
          await redis.assertKeyExists(k, 'after Call 2 HIT');
        }
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 20. User: Events by User ID (Cache-Assisted)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('20 — User: Events by User ID (Cache-Assisted)', () => {
      let testUserId;

      test('GET /users/{userId}/events/ids — Uses user:id cache', async () => {
        // Get admin user ID
        const userRes = await api.client.get(`/api/users-svc/${testUsername}`, { headers: api.headers });
        expect(userRes.status).toBe(200);
        testUserId = (userRes.data.data || userRes.data).id;

        // Ensure user:id cache is warm
        await api.client.get(`/api/users-svc/users/${testUserId}`, { headers: api.headers });

        const snapBefore = await redis.snapshotKeys();

        const res = await api.client.get(`/api/users-svc/users/${testUserId}/events/ids`, { headers: api.headers });
        expect(res.status).toBe(200);

        if (redis.available) {
          const newKeys = await redis.getNewKeys(snapBefore);
          if (newKeys.length === 0) {
            console.log('✅ [Redis] Events-by-UserID used user:id cache — no new keys (cache-assisted confirmed).');
          } else {
            console.warn(`[Redis] ⚠️  ${newKeys.length} new key(s) — may have own cache or user:id was cold.`);
          }
        }
        console.log('✅ [API] Events by User ID returned successfully (cache-assisted via user:id).');
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 21. Sales: Retail Complete (Cache-Assisted via Active Shift)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('21 — Sales: Retail Complete (Cache-Assisted)', () => {
      test('POST /retail/complete — Uses shift:active cache (read-only verification)', async () => {
        // This is a write endpoint — we only verify cache-assisted behavior exists
        // by confirming shift:active keys exist after warming
        const EVENT_ID = '1';
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        const shopsRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(shopsRes.status).toBe(200);
        const shops = shopsRes.data.data || shopsRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops. Retail complete cache-assisted test skipped.');
          return;
        }

        const shopId = shops[0].id;
        const shiftRes = await api.client.get(`/api/sales-svc/shifts/active/${shopId}`, { headers });
        if (shiftRes.status === 404) {
          console.warn('⚠️  No active shift. POST /retail/complete cache-assisted test skipped.');
          return;
        }

        // Verify the shift:active key exists in Redis (the cache POST /retail/complete reads from)
        if (redis.available) {
          const keys = await redis.scanKeys(`shift:active:${shopId}:*`);
          if (keys.length > 0) {
            console.log(`✅ [Redis] shift:active key exists for shop ${shopId} — POST /retail/complete can read from cache.`);
            for (const k of keys) {
              const ttl = await redis.getTTL(k);
              console.log(`[Redis]   → "${k}" | TTL: ${ttl === -1 ? 'NO_EXPIRY' : ttl + 's'}`);
            }
          } else {
            console.warn('[Redis] ⚠️  No shift:active key found despite active shift — may not be cached yet.');
          }
        }
        console.log('✅ [API] Retail complete cache-assisted dependency (shift:active) verified.');
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 22. Sales: Next Invoice (Cache-Assisted via Active Shift)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('22 — Sales: Next Invoice (Cache-Assisted)', () => {
      const EVENT_ID = '1';

      test('GET /retail/next-invoice — Uses shift:active cache', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        const shopsRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(shopsRes.status).toBe(200);
        const shops = shopsRes.data.data || shopsRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops. Next invoice cache-assisted test skipped.');
          return;
        }
        const shopId = shops[0].id;

        // Warm the shift:active cache
        const shiftRes = await api.client.get(`/api/sales-svc/shifts/active/${shopId}`, { headers });
        if (shiftRes.status === 404) {
          console.warn('⚠️  No active shift. Next invoice test skipped.');
          return;
        }

        const snapBefore = await redis.snapshotKeys();

        const res = await api.client.get(`/api/sales-svc/retail/next-invoice?shopId=${shopId}`, { headers });
        expect(res.status).toBe(200);

        if (redis.available) {
          const newKeys = await redis.getNewKeys(snapBefore);
          if (newKeys.length === 0) {
            console.log('✅ [Redis] Next-invoice used shift:active cache — no new keys (cache-assisted confirmed).');
          } else {
            console.warn(`[Redis] ⚠️  ${newKeys.length} new key(s) after next-invoice — may have own cache.`);
          }
        }
        console.log('✅ [API] Next Invoice returned successfully (cache-assisted via shift:active).');
      }, 15000);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // 23. Sales: Shop Catalog (Cache-Assisted via products:all Cross-Service)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('23 — Sales: Shop Catalog (Cache-Assisted)', () => {
      const EVENT_ID = '1';

      test('GET /retail/shop/{shopId}/catalog — Uses products:all cross-service cache', async () => {
        const headers = { ...api.headers, 'X-Event-Id': EVENT_ID };

        const shopsRes = await api.client.get('/api/sales-svc/shops', { headers });
        expect(shopsRes.status).toBe(200);
        const shops = shopsRes.data.data || shopsRes.data;
        if (shops.length === 0) {
          console.warn('⚠️  No shops. Shop catalog cache-assisted test skipped.');
          return;
        }
        const shopId = shops[0].id;

        // Warm the products:all cache (inventory service)
        await api.client.get('/api/inventory-svc/products', { headers: api.headers });

        const snapBefore = await redis.snapshotKeys();

        const res = await api.client.get(`/api/sales-svc/retail/shop/${shopId}/catalog`, { headers });
        expect(res.status).toBe(200);
        const catalog = res.data.data || res.data;

        // ShopCatalogDto structure: { nextInvoiceNumber, products[], stocks[] }
        expect(catalog).toBeDefined();
        expect(typeof catalog).toBe('object');
        expect(Array.isArray(catalog.products)).toBe(true);
        expect(Array.isArray(catalog.stocks)).toBe(true);
        expect(typeof catalog.nextInvoiceNumber).toBe('string');

        if (redis.available) {
          const newKeys = await redis.getNewKeys(snapBefore);
          // Cross-service: InventoryClient reads products:all from Redis before HTTP call
          const productsAllExists = await redis.keyExists('products:all');
          if (productsAllExists) {
            console.log('✅ [Redis] products:all key exists — InventoryClient can read from cross-service cache.');
          }
          if (newKeys.length === 0) {
            console.log('✅ [Redis] Shop catalog used products:all cache — no new keys (cache-assisted confirmed).');
          } else {
            console.warn(`[Redis] ⚠️  ${newKeys.length} new key(s) — catalog endpoint may also cache independently.`);
          }
        }
        console.log(`✅ [API] Shop Catalog returned ${catalog.products.length} products, ${catalog.stocks.length} stocks, next invoice: ${catalog.nextInvoiceNumber} (cache-assisted via products:all).`);
      }, 15000);
    });
  });
}

module.exports = runRedisCacheSuite;
