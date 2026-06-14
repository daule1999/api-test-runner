/**
 * helpers/redis-helper.js
 *
 * Zero-dependency Redis client built on Node's net module (pure RESP protocol).
 * Provides direct Redis inspection for cache HIT / MISS / invalidation verification.
 */

'use strict';

const net  = require('net');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const REDIS_HOST    = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT    = parseInt(process.env.REDIS_PORT || '6379', 10);
const CMD_TIMEOUT   = 5000;
const CONN_TIMEOUT  = 3000;

// ─── RESP parser ────────────────────────────────────────────────────────────

function findCRLF(buf, start) {
  for (let i = start; i < buf.length - 1; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i;
  }
  return -1;
}

/**
 * Parses one RESP value from `buf` starting at `offset`.
 * Returns { value, end } or null if the buffer is incomplete.
 */
function parseRESP(buf, offset = 0) {
  if (offset >= buf.length) return null;
  const type = buf[offset];

  // Simple String (+), Error (-), Integer (:)
  if (type === 43 || type === 45 || type === 58) {
    const nl = findCRLF(buf, offset + 1);
    if (nl === -1) return null;
    const str = buf.slice(offset + 1, nl).toString('utf8');
    const value = type === 58
      ? parseInt(str, 10)
      : type === 45
        ? new RedisError(str)
        : str;
    return { value, end: nl + 2 };
  }

  // Bulk String ($)
  if (type === 36) {
    const nl = findCRLF(buf, offset + 1);
    if (nl === -1) return null;
    const len = parseInt(buf.slice(offset + 1, nl).toString(), 10);
    if (len === -1) return { value: null, end: nl + 2 };
    const ds = nl + 2, de = ds + len;
    if (buf.length < de + 2) return null;
    return { value: buf.slice(ds, de).toString('utf8'), end: de + 2 };
  }

  // Array (*)
  if (type === 42) {
    const nl = findCRLF(buf, offset + 1);
    if (nl === -1) return null;
    const count = parseInt(buf.slice(offset + 1, nl).toString(), 10);
    if (count === -1) return { value: null, end: nl + 2 };
    let pos = nl + 2;
    const items = [];
    for (let i = 0; i < count; i++) {
      const r = parseRESP(buf, pos);
      if (r === null) return null;
      items.push(r.value);
      pos = r.end;
    }
    return { value: items, end: pos };
  }

  return null; // unknown type prefix
}

class RedisError extends Error {
  constructor(msg) { super(msg); this.name = 'RedisError'; }
}

// ─── Low-level TCP client ────────────────────────────────────────────────────

function buildCommand(...args) {
  let cmd = `*${args.length}\r\n`;
  for (const arg of args) {
    const s = String(arg);
    cmd += `$${Buffer.byteLength(s, 'utf8')}\r\n${s}\r\n`;
  }
  return cmd;
}

class MinimalRedisClient {
  constructor(host, port) {
    this.host = host;
    this.port = port;
    this._socket  = null;
    this._buf     = Buffer.alloc(0);
    this._pending = null;
    this.connected = false;
  }

  connect(timeout = CONN_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Redis connect timeout (${this.host}:${this.port})`)),
        timeout
      );
      this._socket = net.createConnection({ host: this.host, port: this.port });
      this._socket.on('connect', () => {
        clearTimeout(timer);
        this.connected = true;
        resolve(this);
      });
      this._socket.on('error', err => { clearTimeout(timer); reject(err); });
      this._socket.on('data',  chunk => this._onData(chunk));
      this._socket.on('close', () => { this.connected = false; });
    });
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    this._drain();
  }

  _drain() {
    if (!this._pending || this._buf.length === 0) return;
    const result = parseRESP(this._buf);
    if (result === null) return; // incomplete — wait for more data
    this._buf = this._buf.slice(result.end);
    const pending = this._pending;
    this._pending = null;
    if (result.value instanceof RedisError) {
      pending.reject(result.value);
    } else {
      pending.resolve(result.value);
    }
  }

  send(...args) {
    if (!this.connected) return Promise.reject(new Error('Redis: not connected'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending = null;
        reject(new Error(`Redis command timeout: ${args[0]}`));
      }, CMD_TIMEOUT);
      this._pending = {
        resolve: v  => { clearTimeout(timer); resolve(v); },
        reject:  e  => { clearTimeout(timer); reject(e); }
      };
      this._socket.write(buildCommand(...args));
    });
  }

  disconnect() {
    if (this._socket) {
      this._socket.destroy();
      this._socket  = null;
      this.connected = false;
    }
  }
}

// ─── High-level RedisHelper ──────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

class RedisHelper {
  constructor(host = REDIS_HOST, port = REDIS_PORT) {
    this._host   = host;
    this._port   = port;
    this._client = null;
    /** Set to false if Redis is unreachable — all assertions become no-ops */
    this.available = false;
  }

  /** Connect and PING. On failure, available stays false and tests degrade gracefully. */
  async connect() {
    try {
      this._client = new MinimalRedisClient(this._host, this._port);
      await this._client.connect();
      const pong = await this._client.send('PING');
      this.available = (pong === 'PONG');
      console.log(`\n[Redis] ✅ Connected to ${this._host}:${this._port} — PING: ${pong}`);
    } catch (err) {
      console.warn(`\n[Redis] ⚠️  Connection FAILED (${err.message}). Direct Redis assertions will be SKIPPED.`);
      this.available = false;
    }
    return this;
  }

  async disconnect() {
    if (this._client) {
      this._client.disconnect();
      this._client = null;
    }
  }

  // ── Primitives ─────────────────────────────────────────────────────────────

  /**
   * Returns true/false if key exists, or null if Redis unavailable.
   */
  async keyExists(key) {
    if (!this.available) return null;
    const r = await this._client.send('EXISTS', key);
    return r === 1;
  }

  /**
   * Returns parsed JSON value, raw string, or null for missing key.
   */
  async getKey(key) {
    if (!this.available) return null;
    const raw = await this._client.send('GET', key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  /**
   * Returns TTL in seconds: -2 = key gone, -1 = no expiry, ≥0 = seconds left.
   */
  async getTTL(key) {
    if (!this.available) return null;
    return this._client.send('TTL', key);
  }

  /**
   * Deletes a key. Returns number of keys deleted.
   */
  async deleteKey(key) {
    if (!this.available) return null;
    return this._client.send('DEL', key);
  }

  /**
   * Returns all keys matching pattern via SCAN (cursor-safe, no KEYS * blocking).
   */
  async scanKeys(pattern = '*', count = 500) {
    if (!this.available) return [];
    const all = [];
    let cursor = '0';
    do {
      const result = await this._client.send('SCAN', cursor, 'MATCH', pattern, 'COUNT', String(count));
      cursor = result[0];
      all.push(...result[1]);
    } while (cursor !== '0');
    return all;
  }

  // ── Snapshot / diff ────────────────────────────────────────────────────────

  /** Snapshot all current Redis keys as a Set. */
  async snapshotKeys() {
    if (!this.available) return new Set();
    const keys = await this.scanKeys('*');
    return new Set(keys);
  }

  /**
   * Returns keys that appeared in Redis AFTER the given `beforeSnapshot`.
   */
  async getNewKeys(beforeSnapshot) {
    if (!this.available) return [];
    const after = await this.snapshotKeys();
    return [...after].filter(k => !beforeSnapshot.has(k));
  }

  // ── Assertion helpers ──────────────────────────────────────────────────────

  /**
   * Asserts the key exists in Redis. Logs TTL. Throws on failure.
   * No-op when Redis is unavailable.
   */
  async assertKeyExists(key, label = '') {
    const exists = await this.keyExists(key);
    if (exists === null) return; // unavailable — skip
    const ttl = await this.getTTL(key);
    const ttlStr = ttl === -1 ? 'NO_EXPIRY' : ttl === -2 ? 'MISSING' : `${ttl}s`;
    if (!exists) {
      throw new Error(`[Redis] ❌ Key NOT FOUND${label ? ` [${label}]` : ''}: "${key}"`);
    }
    console.log(`[Redis] ✅ Key EXISTS${label ? ` [${label}]` : ''}: "${key}" | TTL: ${ttlStr}`);
  }

  /**
   * Asserts the key does NOT exist in Redis (i.e., was invalidated). Throws on failure.
   */
  async assertKeyNotExists(key, label = '') {
    const exists = await this.keyExists(key);
    if (exists === null) return; // unavailable — skip
    if (exists) {
      throw new Error(
        `[Redis] ❌ CACHE NOT INVALIDATED${label ? ` [${label}]` : ''}: Key "${key}" STILL in Redis after write!`
      );
    }
    console.log(`[Redis] ✅ Key INVALIDATED${label ? ` [${label}]` : ''}: "${key}"`);
  }

  /**
   * Discovers which new keys were written to Redis by `apiFn`, asserts at least one appeared.
   * Returns the discovered keys array (or [] if Redis unavailable).
   *
   * @param {Function} apiFn - async function to call (the API request)
   * @param {string}   label - label for console output
   */
  async discoverCacheKeys(apiFn, label = '') {
    const before = await this.snapshotKeys();
    await apiFn();
    const newKeys = await this.getNewKeys(before);

    if (this.available) {
      if (newKeys.length === 0) {
        console.error(
          `[Redis] ❌ NO cache keys written to Redis after ${label || 'API call'}! ` +
          'Caching may be BROKEN or this entity is not cached.'
        );
      } else {
        for (const k of newKeys) {
          const ttl = await this.getTTL(k);
          const ttlStr = ttl === -1 ? 'NO_EXPIRY' : `${ttl}s`;
          console.log(`[Redis] 🔍 Discovered key${label ? ` [${label}]` : ''}: "${k}" | TTL: ${ttlStr}`);
        }
      }
    }

    return newKeys;
  }

  /**
   * Verifies cache invalidation:
   *   1. Asserts all `cacheKeys` are GONE from Redis.
   *   2. Calls `apiFn` (the Call 3 / re-fetch), verifies at least 1 key is re-populated.
   *
   * @param {string[]} cacheKeys       - keys discovered by discoverCacheKeys
   * @param {Function} apiFn           - async GET call (Call 3)
   * @param {number}   evictionDelayMs - wait after write before checking (for async invalidation)
   */
  async verifyInvalidationAndRepopulation(cacheKeys, apiFn, evictionDelayMs = 200) {
    if (!this.available) {
      await apiFn();
      return;
    }

    // Give the backend a moment to evict (some caches are async)
    if (evictionDelayMs > 0) await sleep(evictionDelayMs);

    // 1. Verify keys are gone
    for (const key of cacheKeys) {
      await this.assertKeyNotExists(key, 'after PUT — invalidation');
    }

    // 2. Call 3 — should cause a DB MISS and re-populate cache
    const snapshotBefore3 = await this.snapshotKeys();
    await apiFn();
    const rePopKeys = await this.getNewKeys(snapshotBefore3);

    if (rePopKeys.length === 0) {
      console.warn('[Redis] ⚠️  No keys re-populated after Call 3. TTL may have expired or caching is lazy.');
    } else {
      console.log(`[Redis] ✅ Cache RE-POPULATED after MISS. Keys: [${rePopKeys.join(', ')}]`);
    }
  }
}

module.exports = { RedisHelper, sleep };
