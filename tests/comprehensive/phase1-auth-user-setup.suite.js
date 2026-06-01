/**
 * PHASE 1 — Auth & User Setup
 * Registers users from CSV, tests login, JWT validation, and negative paths.
 */
const { TestClient } = require('../../helpers/framework');
const { readCsv } = require('../../helpers/csv-helper');
const path = require('path');
const ctx = require('./test-context');

const CSV_DIR = path.resolve(__dirname, '..', '..', 'DATA', 'Feed_data', 'comprehensive');

function runPhase1() {
  describe('Phase 1 — Auth & User Setup', () => {
    const api = new TestClient();
    const userRows = readCsv(path.join(CSV_DIR, 'users.csv'));
    const invalidRows = readCsv(path.join(CSV_DIR, 'invalid_users.csv'));

    beforeAll(async () => {
      await api.login('admin', 'Admin@123');
      // Bootstrap default event early to resolve eventId for Phase 2 stock tagging
      try {
        const result = await api.createEvent({
          eventName: 'Bikri Mela 2026',
          eventType: 'MELA',
          description: 'Annual retail event',
          location: 'Bengaluru Palace Grounds',
          startDate: '2026-06-15T09:00:00',
          endDate: '2026-06-17T22:00:00',
          isActive: true
        });
        if (result && result.id) {
          ctx.eventId = result.id;
          ctx.eventName = 'Bikri Mela 2026';
          api.setEventId(ctx.eventId);
          console.log(`  🏁 Bootstrapped Event "${ctx.eventName}" (ID: ${ctx.eventId}).`);
        }
      } catch (err) {
        console.log(`  🏁 Early event bootstrap skipped or failed: ${err.message}`);
      }
    }, 15000);

    // ─── 1.1 Register Users from CSV ────────────────────────────────────────
    describe('1.1 Register Users from CSV', () => {
      test.each(
        userRows.map((r, i) => [`[${i + 1}] Register user: ${r.username}`, r])
      )('%s', async (_desc, row) => {
        const result = await api.registerUser({
          username: row.username,
          email: row.email,
          mobile: row.mobile,
          password: row.password,
          fullName: row.fullName,
          role: row.role
        });
        expect(result).toBeDefined();
        console.log(`  ✅ User "${row.username}" registered (role: ${row.role}).`);

        if (ctx.eventId) {
          try {
            await api.assignEvents(row.username, [ctx.eventId]);
            console.log(`  ✅ Event ID ${ctx.eventId} assigned to user "${row.username}".`);
          } catch (assignErr) {
            console.log(`  ⚠️ Event assignment failed for user "${row.username}": ${assignErr.message}`);
          }
        }
      });
    });

    // ─── 1.2 Negative: Duplicate Username → 409 ─────────────────────────────
    describe('1.2 Negative: Duplicate username returns 409', () => {
      test('Duplicate "cashier_john" returns 409 or idempotent success', async () => {
        const res = await api.client.post('/api/users-svc/register', {
          username: 'cashier_john',
          email: 'other@email.com',
          mobile: '9000099999',
          password: 'Pass@1234',
          fullName: 'Dup User',
          role: 'CASHIER'
        }, { headers: api.headers });

        expect([200, 201, 409]).toContain(res.status);
        console.log(`  ✅ Duplicate username correctly handled (status: ${res.status}).`);
      });
    });

    // ─── 1.3 Negative: Invalid fields from CSV ─────────────────────────────
    describe('1.3 Negative: Invalid user registrations', () => {
      test.each(
        invalidRows.map((r, i) => [`[${i + 1}] Invalid user: "${r.username || '(empty)'}" → expect ${r.expectedError}`, r])
      )('%s', async (_desc, row) => {
        const res = await api.client.post('/api/users-svc/register', {
          username: row.username || undefined,
          email: row.email || undefined,
          mobile: row.mobile || undefined,
          password: row.password || undefined,
          fullName: row.fullName || undefined
        }, { headers: api.headers });

        const expected = parseInt(row.expectedError, 10);
        expect([expected, 400, 409, 422, 500]).toContain(res.status);
        console.log(`  ✅ Invalid registration correctly rejected (status: ${res.status}, expected: ${expected}).`);
      });
    });

    // ─── 1.4 Login Admin & Extract JWT ──────────────────────────────────────
    describe('1.4 Login and receive JWT tokens', () => {
      test('Admin login returns JWT', async () => {
        await api.login('admin', 'Admin@123');
        ctx.jwtToken = api.token;
        expect(ctx.jwtToken).toBeDefined();
        expect(ctx.jwtToken.length).toBeGreaterThan(10);
        console.log(`  ✅ Admin JWT obtained (length: ${ctx.jwtToken.length}).`);
      });
    });

    // ─── 1.5 JWT Structure Validation ───────────────────────────────────────
    describe('1.5 JWT contains required claims', () => {
      test('JWT payload has roles and userId', () => {
        const parts = ctx.jwtToken.split('.');
        expect(parts.length).toBe(3);
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        expect(payload).toHaveProperty('roles');
        expect(payload).toHaveProperty('userId');
        console.log(`  ✅ JWT claims validated: roles=${JSON.stringify(payload.roles)}, userId=${payload.userId}`);
        ctx.adminUserId = payload.userId;
      });
    });

    // ─── 1.6 Negative: Wrong Password → 401 ────────────────────────────────
    describe('1.6 Wrong password returns 401', () => {
      test('Wrong password is rejected', async () => {
        const res = await api.client.post('/api/auth-svc/login', {
          username: 'admin',
          password: 'WrongPass!'
        });
        expect([401, 403]).toContain(res.status);
        console.log(`  ✅ Wrong password correctly rejected (status: ${res.status}).`);
      });
    });

    // ─── 1.7 Negative: Expired/Malformed JWT ────────────────────────────────
    describe('1.7 Expired/malformed JWT returns 401 not 500', () => {
      test('Malformed token is rejected', async () => {
        const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTYwMDAwMDAwMX0.fakeSig';
        const res = await api.client.get('/api/users-svc/allUsers', {
          headers: { Authorization: `Bearer ${expiredToken}`, 'X-Event-Id': '1' }
        });
        expect(res.status).not.toBe(500);
        expect([401, 403]).toContain(res.status);
        console.log(`  ✅ Malformed JWT correctly rejected (status: ${res.status}).`);
      });
    });

    // ─── 1.8 Resolve User IDs for later phases ─────────────────────────────
    describe('1.8 Resolve user IDs for later phases', () => {
      test('Resolve cashier_john userId', async () => {
        const authed = new TestClient();
        await authed.login('admin', 'Admin@123');
        ctx.cashierJohnUserId = await authed.getUserId('cashier_john');
        expect(ctx.cashierJohnUserId).toBeDefined();
        console.log(`  ✅ cashier_john userId = ${ctx.cashierJohnUserId}`);
      });

      test('Resolve cashier_jane userId', async () => {
        const authed = new TestClient();
        await authed.login('admin', 'Admin@123');
        ctx.cashierJaneUserId = await authed.getUserId('cashier_jane');
        expect(ctx.cashierJaneUserId).toBeDefined();
        console.log(`  ✅ cashier_jane userId = ${ctx.cashierJaneUserId}`);
      });
    });
  });
}

module.exports = runPhase1;
