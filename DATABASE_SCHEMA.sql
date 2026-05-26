-- =========================================================
-- BIKRI-KENDRA DATABASE SCHEMA STRUCTURE
-- Consolidated Master Database DDL
-- =========================================================

-- ---------------------------------------------------------
-- DATABASE: user_db
-- ---------------------------------------------------------
DROP DATABASE IF EXISTS billing_db;
DROP DATABASE IF EXISTS auth_db;
DROP DATABASE IF EXISTS user_db;
DROP DATABASE IF EXISTS inventory_db;
DROP DATABASE IF EXISTS sales_db;
CREATE DATABASE user_db;
USE user_db;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) UNIQUE,
    mobile VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150),
    status ENUM('ACTIVE','INACTIVE','LOCKED') NOT NULL DEFAULT 'ACTIVE',
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_status ON users(status);


CREATE TABLE roles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,   -- AppRole.name()
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,  -- AppPermission.name()
    description VARCHAR(255) NOT NULL
);

CREATE TABLE user_roles (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    event_id BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, role_id, event_id),

    CONSTRAINT fk_ur_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_ur_role
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE
);

CREATE TABLE role_permissions (
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,

    PRIMARY KEY (role_id, permission_id),

    CONSTRAINT fk_rp_role
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_rp_permission
        FOREIGN KEY (permission_id)
        REFERENCES permissions(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_rp_permission ON role_permissions(permission_id);

-- Migration: add event_id to user_roles for event-scoped roles
ALTER TABLE user_roles
  ADD COLUMN event_id BIGINT NULL AFTER role_id;

-- If you want event-scoped uniqueness per user+role+event, adjust PK/indexes accordingly.
-- Create a composite primary key replacement if the DB allows it (requires dropping old PK):
-- ALTER TABLE user_roles DROP PRIMARY KEY, ADD PRIMARY KEY (user_id, role_id, event_id);

-- Optional: add foreign key to events table if it exists
-- ALTER TABLE user_roles
--   ADD CONSTRAINT fk_ur_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- Index event_id for faster queries
CREATE INDEX IF NOT EXISTS idx_user_roles_event ON user_roles(event_id);

-- Backfill: if you're moving existing assignments into a default/global event, set event_id=NULL (no-op)
-- UPDATE user_roles SET event_id = NULL WHERE event_id IS NULL;

-- ---------------------------------------------------------
-- DATABASE: auth_db
-- ---------------------------------------------------------
DROP DATABASE IF EXISTS auth_db;
CREATE DATABASE auth_db;
USE auth_db;

-- ---------------------------------------------------------
-- DATABASE: inventory_db
-- ---------------------------------------------------------

DROP DATABASE IF EXISTS inventory_db;
CREATE DATABASE inventory_db;
USE inventory_db;

/* =========================================================
   INVENTORY SERVICE - SCHEMA
   ========================================================= */

/* ---------- CLEANUP (SAFE RESET) ---------- */
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS stock_movement;
DROP TABLE IF EXISTS counter_stocks;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS purchase;
DROP TABLE IF EXISTS stock;
DROP TABLE IF EXISTS product_supplier;
DROP TABLE IF EXISTS product;
DROP TABLE IF EXISTS supplier;
DROP TABLE IF EXISTS category;

SET FOREIGN_KEY_CHECKS = 1;


/* ---------- MASTER TABLES ---------- */

CREATE TABLE category (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE supplier (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


/* ---------- PRODUCT ---------- */

CREATE TABLE product (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    mrp DECIMAL(12,2) NOT NULL,
    selling_price DECIMAL(12,2) NOT NULL,
    discount DECIMAL(5,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_category
        FOREIGN KEY (category_id) REFERENCES category(id)
);

CREATE INDEX idx_product_name ON product(name);
CREATE INDEX idx_product_price ON product(selling_price);
CREATE INDEX idx_product_category ON product(category_id);


/* ---------- PRODUCT ↔ SUPPLIER ---------- */

CREATE TABLE product_supplier (
    product_id BIGINT NOT NULL,
    supplier_id BIGINT NOT NULL,
    PRIMARY KEY (product_id, supplier_id),
    CONSTRAINT fk_ps_product
        FOREIGN KEY (product_id) REFERENCES product(id),
    CONSTRAINT fk_ps_supplier
        FOREIGN KEY (supplier_id) REFERENCES supplier(id)
);


/* ---------- STOCK ---------- */

CREATE TABLE stock (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    location VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_stock_product
        FOREIGN KEY (product_id) REFERENCES product(id),
    CONSTRAINT uq_stock_product_location
        UNIQUE (product_id, location),
    CONSTRAINT chk_stock_quantity
        CHECK (quantity >= 0)
);

CREATE INDEX idx_stock_product ON stock(product_id);
CREATE INDEX idx_stock_location ON stock(location);


/* ---------- PURCHASE ---------- */

CREATE TABLE purchase (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    supplier_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,      -- from user-service
    quantity INT NOT NULL,
    purchase_price DECIMAL(12,2) NOT NULL,
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchase_product
        FOREIGN KEY (product_id) REFERENCES product(id),
    CONSTRAINT fk_purchase_supplier
        FOREIGN KEY (supplier_id) REFERENCES supplier(id),
    CONSTRAINT chk_purchase_qty
        CHECK (quantity > 0)
);

CREATE INDEX idx_purchase_product ON purchase(product_id);
CREATE INDEX idx_purchase_supplier ON purchase(supplier_id);
CREATE INDEX idx_purchase_user ON purchase(user_id);
CREATE INDEX idx_purchase_date ON purchase(purchase_date);


/* ---------- SALES ---------- */
CREATE TABLE sales (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    product_id BIGINT NOT NULL,

    seller_user VARCHAR(255) NOT NULL,   -- cashier / salesperson

    shop_id BIGINT NOT NULL,

    quantity INT NOT NULL,

    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_sales_product
        FOREIGN KEY (product_id) REFERENCES product(id),

    CONSTRAINT chk_sales_qty
        CHECK (quantity > 0)
);

CREATE INDEX idx_sales_seller ON sales(seller_user);
CREATE INDEX idx_sales_product ON sales(product_id);
CREATE INDEX idx_sales_date ON sales(sale_date);



/* ---------- STOCK MOVEMENT ---------- */

CREATE TABLE stock_movement (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    username VARCHAR(100) NOT NULL,   -- from JWT (auth service)
    movement_type ENUM ('IN','OUT','ADJUSTMENT') NOT NULL,
    quantity INT NOT NULL,
    reason VARCHAR(255),
    movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sm_product
        FOREIGN KEY (product_id) REFERENCES product(id)
);

CREATE INDEX idx_sm_product ON stock_movement(product_id);
CREATE INDEX idx_sm_username ON stock_movement(username);
CREATE INDEX idx_sm_date ON stock_movement(movement_date);
CREATE INDEX idx_sm_type ON stock_movement(movement_type);
CREATE INDEX idx_sm_product_event ON stock_movement(product_id, event_id);

-- =========================================================
-- MIGRATION: EVENT-SCOPED ARCHITECTURE
-- =========================================================

-- Safely add event_id column to stock table
ALTER TABLE stock ADD COLUMN event_id BIGINT NOT NULL DEFAULT 1;

-- Drop legacy unique constraints (handles uq_stock_product_loc and uq_stock_product_location)
ALTER TABLE stock DROP INDEX uq_stock_product_location;

-- Add updated unique constraint including event_id
ALTER TABLE stock ADD CONSTRAINT uq_stock_product_event_loc UNIQUE (product_id, event_id, location);


-- Add event_id columns to other inventory entities
ALTER TABLE purchase ADD COLUMN event_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE sales ADD COLUMN event_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE stock_movement ADD COLUMN event_id BIGINT NOT NULL DEFAULT 1;

/* =============================================================================
   UPDATED MIGRATION SCRIPT: OLD INVENTORY SCHEMA TO NEW INVENTORY SCHEMA
   ============================================================================= */

-- 1. Disable foreign key checks to perform safe constraint refactoring
SET FOREIGN_KEY_CHECKS = 0;

-- 2. Rename the legacy 'sales' table to 'counter_stocks'
RENAME TABLE `sales` TO `counter_stocks`;

-- 3. Explicitly add the 'event_id' column to the 'counter_stocks' table
-- Since event_id was already added to the 'sales' table before rename, we drop it first
-- to allow the explicit ADD COLUMN statement to execute without a duplicate column error.
ALTER TABLE `counter_stocks` DROP COLUMN `event_id`;
ALTER TABLE `counter_stocks` ADD COLUMN `event_id` BIGINT NOT NULL DEFAULT 1;

-- 4. Drop legacy constraints on the renamed 'counter_stocks' table
ALTER TABLE `counter_stocks` DROP FOREIGN KEY `fk_sales_product`;
ALTER TABLE `counter_stocks` DROP CHECK `chk_sales_qty`;

-- 5. Update index names to reflect the table rename (drop old, build new)
-- We drop old indexes BEFORE adding the new foreign key constraint so idx_sales_product is not locked.
ALTER TABLE `counter_stocks` DROP INDEX `idx_sales_seller`;
ALTER TABLE `counter_stocks` DROP INDEX `idx_sales_product`;
ALTER TABLE `counter_stocks` DROP INDEX `idx_sales_date`;

CREATE INDEX `idx_counter_stocks_seller` ON `counter_stocks`(`seller_user`);
CREATE INDEX `idx_counter_stocks_product` ON `counter_stocks`(`product_id`);
CREATE INDEX `idx_counter_stocks_date` ON `counter_stocks`(`sale_date`);

-- 6. Add new foreign key constraint with updated naming convention
ALTER TABLE `counter_stocks` 
    ADD CONSTRAINT `fk_counter_stocks_product` 
    FOREIGN KEY (`product_id`) REFERENCES `product`(`id`);

-- 7. Expand 'stock_movement' ENUM to support the new 'TRANSFER' type
ALTER TABLE `stock_movement` 
    MODIFY COLUMN `movement_type` ENUM('IN','OUT','ADJUSTMENT','TRANSFER') NOT NULL;

-- 8. Add location tracking and shop columns to 'stock_movement' after the 'reason' field
ALTER TABLE `stock_movement` 
    ADD COLUMN `location_from` VARCHAR(100) NULL AFTER `reason`,
    ADD COLUMN `location_to` VARCHAR(100) NULL AFTER `location_from`,
    ADD COLUMN `shop_id` BIGINT NULL AFTER `location_to`;

-- 9. Add a composite index on transfer locations for fast aggregation lookups
CREATE INDEX `idx_sm_locations` ON `stock_movement`(`location_from`, `location_to`);

-- 10. Support explicit Initial and Live quantity tracking in counter_stocks
ALTER TABLE `counter_stocks` ADD COLUMN `initial_quantity` INT NOT NULL DEFAULT 0;
ALTER TABLE `counter_stocks` ADD COLUMN `live_quantity` INT NOT NULL DEFAULT 0;

-- Copy existing quantity values
UPDATE `counter_stocks` SET `initial_quantity` = `quantity`, `live_quantity` = `quantity`;

-- Drop the old quantity column
ALTER TABLE `counter_stocks` DROP COLUMN `quantity`;

-- 11. Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE product ADD COLUMN min_threshold INT NOT NULL DEFAULT 10;

-- 12. Clean up any duplicate counter_stocks rows by merging their quantities into a single row per (product_id, shop_id, event_id)
-- Create temporary table with merged quantities
CREATE TEMPORARY TABLE temp_counter_stocks AS
SELECT 
    MIN(id) as id,
    product_id,
    shop_id,
    event_id,
    SUM(initial_quantity) as initial_quantity,
    SUM(live_quantity) as live_quantity,
    MAX(seller_user) as seller_user,
    MAX(sale_date) as sale_date,
    MIN(created_at) as created_at,
    MAX(updated_at) as updated_at
FROM counter_stocks
GROUP BY product_id, shop_id, event_id;

-- Clear original table
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM counter_stocks;

-- Re-insert merged records
INSERT INTO counter_stocks (id, product_id, shop_id, event_id, initial_quantity, live_quantity, seller_user, sale_date, created_at, updated_at)
SELECT id, product_id, shop_id, event_id, initial_quantity, live_quantity, seller_user, sale_date, created_at, updated_at
FROM temp_counter_stocks;
SET FOREIGN_KEY_CHECKS = 1;

-- Drop temporary table
DROP TEMPORARY TABLE temp_counter_stocks;

-- Add strict UNIQUE constraint to prevent duplicate counter stocks
ALTER TABLE counter_stocks ADD CONSTRAINT uq_counter_stocks_prod_shop_event UNIQUE (product_id, shop_id, event_id);



-- ---------------------------------------------------------
-- DATABASE: sales_db
-- ---------------------------------------------------------

DROP DATABASE IF EXISTS sales_db;
CREATE DATABASE sales_db;
USE sales_db;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS shop_staff_assignment;
DROP TABLE IF EXISTS shop;
DROP TABLE IF EXISTS event;
DROP TABLE IF EXISTS sales_return;
DROP TABLE IF EXISTS sales_payment;
DROP TABLE IF EXISTS sales_order_item;
DROP TABLE IF EXISTS sales_order;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE sales_order (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    order_number VARCHAR(50) NOT NULL UNIQUE,

    -- Shop reference
    shop_id BIGINT NOT NULL,

    -- Seller snapshot
    seller_id BIGINT NOT NULL,
    seller_name VARCHAR(100) NOT NULL,

    -- Customer snapshot
    customer_name VARCHAR(150),
    customer_mobile VARCHAR(20),

    -- Financials
    order_subtotal DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0,

    -- Link to Billing Service
    billing_invoice_number VARCHAR(50),

    status ENUM(
        'CREATED',
        'CONFIRMED',
        'CANCELLED',
        'RETURNED',
        'PARTIALLY_RETURNED'
    ) DEFAULT 'CREATED',

    cancellation_reason VARCHAR(255),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_sales_order_shop ON sales_order(shop_id);
CREATE INDEX idx_sales_order_seller ON sales_order(seller_id);
CREATE INDEX idx_sales_order_created ON sales_order(created_at);
CREATE INDEX idx_sales_order_invoice ON sales_order(billing_invoice_number);


CREATE TABLE sales_order_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    sales_order_id BIGINT NOT NULL,

    product_id BIGINT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    hsn_code VARCHAR(20),

    quantity INT NOT NULL,

    mrp DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,

    line_total DECIMAL(12,2) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sales_item_order
        FOREIGN KEY (sales_order_id)
        REFERENCES sales_order(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_sales_item_order ON sales_order_item(sales_order_id);
CREATE INDEX idx_sales_item_product ON sales_order_item(product_id);

CREATE TABLE sales_payment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    sales_order_id BIGINT NOT NULL,

    payment_mode ENUM(
        'CASH',
        'ONLINE',
        'UPI',
        'CARD',
        'BANK_TRANSFER',
        'BOTH'
    ) NOT NULL,

    payment_reference VARCHAR(100),

    amount DECIMAL(12,2) NOT NULL,
    cash_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    online_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    payment_status ENUM(
        'SUCCESS',
        'FAILED',
        'REFUNDED'
    ) DEFAULT 'SUCCESS',

    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sales_payment_order
        FOREIGN KEY (sales_order_id)
        REFERENCES sales_order(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_sales_payment_order ON sales_payment(sales_order_id);
CREATE INDEX idx_sales_payment_date ON sales_payment(paid_at);

CREATE TABLE sales_return (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    sales_order_id BIGINT NOT NULL,
    sales_order_item_id BIGINT NOT NULL,

    product_id BIGINT NOT NULL,

    processed_by BIGINT NOT NULL,
    processed_by_name VARCHAR(100) NOT NULL,

    quantity INT NOT NULL,
    refund_amount DECIMAL(12,2) NOT NULL,

    reason VARCHAR(255),

    billing_invoice_number VARCHAR(50),

    returned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sales_return_order
        FOREIGN KEY (sales_order_id)
        REFERENCES sales_order(id)
);

CREATE TABLE event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(100),
    description TEXT,
    location VARCHAR(255),
    start_date DATETIME,
    end_date DATETIME,
    is_active BOOLEAN DEFAULT TRUE
);


CREATE TABLE shop (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shop_name VARCHAR(255) NOT NULL,
    category_id BIGINT NOT NULL,
    counter_number INT NOT NULL,
     event_id BIGINT,
    is_active BOOLEAN DEFAULT TRUE,

    CONSTRAINT fk_shop_event
        FOREIGN KEY (event_id)
        REFERENCES event(id)
        ON DELETE SET NULL
);

CREATE TABLE shop_staff_assignment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    shop_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,

    role_code VARCHAR(50) NOT NULL,

    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP NULL,

    is_active BOOLEAN DEFAULT TRUE,

    CONSTRAINT uk_shop_role UNIQUE (shop_id, role_code),
    CONSTRAINT fk_shop FOREIGN KEY (shop_id) REFERENCES shop(id)
);

-- =========================================================
-- MIGRATION: EVENT-SCOPED ARCHITECTURE
-- =========================================================

ALTER TABLE sales_order ADD COLUMN event_id BIGINT NOT NULL AFTER order_number;
ALTER TABLE event ADD COLUMN created_by BIGINT AFTER is_active;
ALTER TABLE event ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER is_active;
ALTER TABLE event ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;
ALTER TABLE shop DROP FOREIGN KEY fk_shop_event; 
ALTER TABLE shop ADD CONSTRAINT fk_shop_event FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE SET NULL;

ALTER TABLE shop_staff_assignment ADD COLUMN event_id BIGINT;

UPDATE shop_staff_assignment ssa 
INNER JOIN shop s ON ssa.shop_id = s.id 
SET ssa.event_id = s.event_id;

ALTER TABLE shop ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE shop ADD COLUMN closed_at TIMESTAMP NULL;

CREATE INDEX idx_ssa_user_event ON shop_staff_assignment(user_id, event_id);


-- CREATE TABLE for Shop Shift Session
CREATE TABLE IF NOT EXISTS shop_shift_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shop_id BIGINT NOT NULL,
    event_id BIGINT NOT NULL,
    status ENUM('OPEN', 'CLOSED', 'RECONCILED') NOT NULL DEFAULT 'OPEN',
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL DEFAULT NULL,
    
    opening_cash_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    expected_closing_cash DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    actual_closing_cash DECIMAL(12,2) DEFAULT 0.00,
    expected_closing_online DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    actual_closing_online DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    
    opened_by_user_id BIGINT NOT NULL,
    closed_by_user_id BIGINT DEFAULT NULL,
    reconciled_by_user_id BIGINT DEFAULT NULL,
    reconciled_at TIMESTAMP NULL DEFAULT NULL,
    reconciliation_comment VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_shift_shop_event (shop_id, event_id),
    INDEX idx_shift_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CREATE TABLE for Shop Shift Denomination
CREATE TABLE IF NOT EXISTS shop_shift_denomination (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shift_session_id BIGINT NOT NULL,
    entry_type ENUM('OPENING', 'CLOSING') NOT NULL,
    currency_value INT NOT NULL,
    note_count INT NOT NULL DEFAULT 0,
    
    CONSTRAINT fk_denomination_session
        FOREIGN KEY (shift_session_id)
        REFERENCES shop_shift_session(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ALTER TABLE sales_order to add nullable shift_session_id
ALTER TABLE sales_order 
ADD COLUMN shift_session_id BIGINT DEFAULT NULL AFTER event_id,
ADD CONSTRAINT fk_sales_order_shift 
    FOREIGN KEY (shift_session_id) 
    REFERENCES shop_shift_session(id)
    ON DELETE SET NULL;

-- Migration: Add reconciliation audit columns to shop_shift_session
ALTER TABLE shop_shift_session
ADD INDEX idx_shift_active_lookup (shop_id, event_id, status, opened_at DESC);



-- ---------------------------------------------------------
-- DATABASE: billing_db
-- ---------------------------------------------------------

DROP DATABASE IF EXISTS billing_db;
CREATE DATABASE billing_db;
USE billing_db;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS invoice_audit;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE invoices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    invoice_no VARCHAR(50) NOT NULL UNIQUE,

    -- Link to Sales Service
    sales_order_number VARCHAR(50) NOT NULL UNIQUE,

    -- Shop snapshot (from Sales)
    shop_id BIGINT NOT NULL,

    -- Seller snapshot
    seller_id BIGINT NOT NULL,
    seller_name VARCHAR(100) NOT NULL,

    -- Cashier / Billing user
    billed_by BIGINT NOT NULL,

    -- Customer snapshot
    customer_name VARCHAR(150),
    customer_mobile VARCHAR(20),
    customer_gstin VARCHAR(20),

    -- Financials (Billing owns these)
    subtotal_amount DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    tax_amount DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL,

    status VARCHAR(20) NOT NULL,
    billing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_invoice_no ON invoices(invoice_no);
CREATE INDEX idx_invoice_sales_order ON invoices(sales_order_number);
CREATE INDEX idx_invoice_date ON invoices(billing_date);
CREATE INDEX idx_invoice_seller ON invoices(seller_id);
CREATE INDEX idx_invoice_shop ON invoices(shop_id);

CREATE TABLE invoice_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    invoice_id BIGINT NOT NULL,

    product_id BIGINT NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    hsn_code VARCHAR(20),

    quantity INT NOT NULL,

    unit_price DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,

    tax_rate DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,

    total_price DECIMAL(12,2) NOT NULL,
    returned_quantity INT DEFAULT 0,

    CONSTRAINT fk_invoice_items_invoice
        FOREIGN KEY (invoice_id)
        REFERENCES invoices(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON invoice_items(product_id);

CREATE TABLE payments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    invoice_id BIGINT NOT NULL,

    payment_mode ENUM('CASH','UPI','CARD','BANK_TRANSFER','BOTH') NOT NULL,
    payment_reference VARCHAR(100),

    amount DECIMAL(12,2) NOT NULL,

    payment_status ENUM(
        'SUCCESS',
        'FAILED',
        'PENDING',
        'REFUNDED'
    ) DEFAULT 'SUCCESS',

    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    received_by BIGINT NOT NULL,

    CONSTRAINT fk_payments_invoice
        FOREIGN KEY (invoice_id)
        REFERENCES invoices(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_payment_invoice ON payments(invoice_id);
CREATE INDEX idx_payment_date ON payments(paid_at);

CREATE TABLE invoice_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,

    invoice_id BIGINT NOT NULL,

    action ENUM(
        'CREATED',
        'ISSUED',
        'PAID',
        'PARTIALLY_PAID',
        'CANCELLED',
        'REFUNDED',
        'RETURNED'
    ) NOT NULL,

    action_by BIGINT NOT NULL,
    remarks VARCHAR(255),

    action_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_invoice_audit_invoice
        FOREIGN KEY (invoice_id)
        REFERENCES invoices(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_invoice_audit_invoice ON invoice_audit(invoice_id);
CREATE INDEX idx_invoice_audit_date ON invoice_audit(action_at);

-- =========================================================
-- MIGRATION: EVENT-SCOPED ARCHITECTURE
-- =========================================================

ALTER TABLE invoices ADD COLUMN event_id BIGINT NOT NULL AFTER sales_order_number;


