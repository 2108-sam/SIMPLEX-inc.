// db/database.js — SQLite database setup for Simplex Inc.
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './db/simplex.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── CREATE TABLES ──
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    phone       TEXT,
    password    TEXT    NOT NULL,
    is_admin    INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    last_login  TEXT
  );

  -- Products table
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    price       REAL    NOT NULL,
    description TEXT,
    image_url   TEXT,
    badge       TEXT,
    stock       INTEGER DEFAULT 100,
    active      INTEGER DEFAULT 1,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  -- Orders table
  CREATE TABLE IF NOT EXISTS orders (
    id            TEXT    PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    customer_name TEXT    NOT NULL,
    customer_email TEXT   NOT NULL,
    customer_phone TEXT,
    amount        REAL    NOT NULL,
    currency      TEXT    DEFAULT 'KES',
    payment_method TEXT   NOT NULL,
    payment_status TEXT   DEFAULT 'pending',
    payment_ref   TEXT,
    status        TEXT    DEFAULT 'confirmed',
    notes         TEXT,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Order items table (each line of an order)
  CREATE TABLE IF NOT EXISTS order_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    TEXT    NOT NULL,
    product_id  INTEGER,
    product_name TEXT   NOT NULL,
    category    TEXT,
    price_each  REAL    NOT NULL,
    quantity    INTEGER NOT NULL,
    line_total  REAL    NOT NULL,
    image_url   TEXT,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  -- Sessions / tokens blacklist
  CREATE TABLE IF NOT EXISTS token_blacklist (
    token       TEXT    PRIMARY KEY,
    blacklisted_at TEXT DEFAULT (datetime('now'))
  );

  -- Contact messages
  CREATE TABLE IF NOT EXISTS contact_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT,
    phone       TEXT,
    message     TEXT    NOT NULL,
    read        INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );
`);

// ── SEED PRODUCTS if empty ──
const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
if (productCount.c === 0) {
  const insertProduct = db.prepare(`
    INSERT INTO products (name, category, price, description, image_url, badge, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const products = [
    ['Milanese Leather Tote',    'Bags & Purses',  28500, 'Full-grain leather tote with gold hardware. Handcrafted in Italy.',        'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80', 'new',  50],
    ['Riviera Crossbody',        'Bags & Purses',  18900, 'Compact pebbled leather crossbody. Fits all essentials.',                   'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&q=80', '',     40],
    ['Gold Vermeil Chain',       'Jewelry',        12400, '18k gold vermeil over sterling silver. 45cm chain.',                        'https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=600&q=80', 'new',  80],
    ['Pearl Drop Earrings',      'Jewelry',         8200, 'Freshwater pearl drops set in 14k gold. Timeless elegance.',                'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80', '',     60],
    ['Monaco Sunglasses',        'Sunglasses',      9800, 'Acetate frames with gradient lenses. UV400 protection.',                    'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&q=80', 'sale', 35],
    ['Havana Tortoise Frames',   'Sunglasses',     11500, 'Classic tortoiseshell acetate. Polarized lenses.',                          'https://images.unsplash.com/photo-1473496169904-658ba7574b0d?w=600&q=80', '',     30],
    ['Swiss Dress Watch',        'Watches',       145000, 'Swiss quartz movement, sapphire crystal, 50m water resistance.',            'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&q=80', 'new',  15],
    ['Rose Gold Bracelet Watch', 'Watches',        62000, 'Minimalist rose gold case on a mesh bracelet.',                             'https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600&q=80', '',     20],
    ['Cashmere Wrap Scarf',      'Hats & Scarves',  7400, '100% Mongolian cashmere in camel & ivory.',                                 'https://images.unsplash.com/photo-1520903920243-00d872a2d1c9?w=600&q=80', '',     55],
    ['Wide Brim Felt Hat',       'Hats & Scarves',  5600, 'Wool felt with leather band. Structured wide brim.',                        'https://images.unsplash.com/photo-1514995428455-447d4443fa7f?w=600&q=80', 'sale', 45],
    ['Structured Clutch',        'Bags & Purses',  14200, 'Satin-finish structured minaudière with removable chain.',                  'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=600&q=80', '',     25],
    ['Layered Gold Necklace',    'Jewelry',        15600, 'Three-layered 18k gold necklace set. Wear together or apart.',              'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80', 'new',  40],
  ];
  const insertMany = db.transaction(() => {
    products.forEach(p => insertProduct.run(...p));
  });
  insertMany();
  console.log('✅ Products seeded.');
}

// ── SEED ADMIN if not exists ──
const bcrypt = require('bcryptjs');
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.ADMIN_EMAIL || 'okochibwire296@gmail.com');
if (!adminExists) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin2026', 10);
  db.prepare(`INSERT INTO users (name, email, phone, password, is_admin) VALUES (?, ?, ?, ?, 1)`)
    .run('Okochi Bwire', process.env.ADMIN_EMAIL || 'okochibwire296@gmail.com', '0798543248', hash);
  console.log('✅ Admin user created.');
}

module.exports = db;
