// routes/orders.js — Orders with full item persistence
const express  = require('express');
const db       = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendOrderConfirmationEmail } = require('../utils/mailer');

const router = express.Router();

// ── PLACE ORDER ──
// POST /api/orders
router.post('/', requireAuth, (req, res) => {
  const { items, payment_method, payment_ref, notes } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: 'Order must contain at least one item.' });
  }
  if (!payment_method) {
    return res.status(400).json({ error: 'Payment method is required.' });
  }

  // Calculate total from server side (never trust client total)
  let amount = 0;
  const validatedItems = [];

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(item.id);
    if (!product) {
      return res.status(400).json({ error: `Product ID ${item.id} not found or unavailable.` });
    }
    const qty = parseInt(item.qty) || 1;
    const lineTotal = product.price * qty;
    amount += lineTotal;
    validatedItems.push({
      product_id:   product.id,
      product_name: product.name,
      category:     product.category,
      price_each:   product.price,
      quantity:     qty,
      line_total:   lineTotal,
      image_url:    product.image_url
    });
  }

  // Get user details
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  // Generate order ID: SMP-YYYYMMDD-XXXXXX
  const now = new Date();
  const datePart = now.toISOString().slice(0,10).replace(/-/g,'');
  const randPart = Math.random().toString(36).slice(2,8).toUpperCase();
  const orderId = `SMP-${datePart}-${randPart}`;

  // Save order and items in a transaction
  const placeOrder = db.transaction(() => {
    db.prepare(`
      INSERT INTO orders (id, user_id, customer_name, customer_email, customer_phone, amount, payment_method, payment_ref, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, req.user.id, user.name, user.email, user.phone || '', amount, payment_method, payment_ref || '', notes || '');

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, category, price_each, quantity, line_total, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    validatedItems.forEach(i => {
      insertItem.run(orderId, i.product_id, i.product_name, i.category, i.price_each, i.quantity, i.line_total, i.image_url);
    });

    // Reduce stock
    validatedItems.forEach(i => {
      db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(i.quantity, i.product_id);
    });
  });

  placeOrder();

  // Fetch full order for response
  const order = getFullOrder(orderId);

  // Send confirmation email (non-blocking)
  sendOrderConfirmationEmail(order).catch(err => console.error('Email error:', err));

  res.status(201).json({
    message: 'Order placed successfully.',
    order
  });
});

// ── GET MY ORDERS (customer) ──
// GET /api/orders/mine
router.get('/mine', requireAuth, (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);

  const fullOrders = orders.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
  }));

  res.json({ orders: fullOrders, total: fullOrders.length });
});

// ── GET SINGLE ORDER ──
// GET /api/orders/:id
router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  // Customers can only see their own orders; admins can see all
  if (!req.user.is_admin && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  res.json({ order: getFullOrder(req.params.id) });
});

// ── GET ALL ORDERS (admin) ──
// GET /api/orders
router.get('/', requireAdmin, (req, res) => {
  const { status, method, from, to, limit = 50, offset = 0 } = req.query;
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status = ?';         params.push(status); }
  if (method) { query += ' AND payment_method = ?'; params.push(method); }
  if (from)   { query += ' AND created_at >= ?';    params.push(from); }
  if (to)     { query += ' AND created_at <= ?';    params.push(to); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const orders = db.prepare(query).all(...params);
  const fullOrders = orders.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
  }));

  const totalCount = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const totalRevenue = db.prepare('SELECT SUM(amount) as s FROM orders WHERE payment_status = "completed"').get().s || 0;

  res.json({ orders: fullOrders, total: totalCount, revenue: totalRevenue });
});

// ── UPDATE ORDER STATUS (admin) ──
// PATCH /api/orders/:id/status
router.patch('/:id/status', requireAdmin, (req, res) => {
  const { status, payment_status } = req.body;
  db.prepare(`
    UPDATE orders SET status = ?, payment_status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status || 'confirmed', payment_status || 'completed', req.params.id);
  res.json({ message: 'Order status updated.' });
});

// ── ADMIN DASHBOARD STATS ──
// GET /api/orders/admin/stats
router.get('/admin/stats', requireAdmin, (req, res) => {
  const stats = {
    totalOrders:    db.prepare('SELECT COUNT(*) as c FROM orders').get().c,
    totalUsers:     db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 0').get().c,
    totalRevenue:   db.prepare('SELECT SUM(amount) as s FROM orders').get().s || 0,
    totalProducts:  db.prepare('SELECT COUNT(*) as c FROM products WHERE active = 1').get().c,
    recentOrders:   db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10').all().map(o => ({
                      ...o,
                      items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
                    })),
    byPaymentMethod: db.prepare(`
                      SELECT payment_method, COUNT(*) as count, SUM(amount) as total
                      FROM orders GROUP BY payment_method
                    `).all(),
    lowStock:       db.prepare('SELECT * FROM products WHERE stock < 5 AND active = 1').all()
  };
  res.json(stats);
});

// ── HELPER ──
function getFullOrder(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  return { ...order, items };
}

module.exports = router;
