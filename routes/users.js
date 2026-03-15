// routes/users.js — Admin user management
const express = require('express');
const db      = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — all users (admin)
router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, name, email, phone, is_admin, created_at, last_login FROM users ORDER BY created_at DESC'
  ).all();
  res.json({ users, total: users.length });
});

// GET /api/users/:id — single user with their orders (admin)
router.get('/:id', requireAdmin, (req, res) => {
  const user = db.prepare(
    'SELECT id, name, email, phone, is_admin, created_at, last_login FROM users WHERE id = ?'
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.params.id);
  const ordersWithItems = orders.map(o => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)
  }));

  res.json({ user: { ...user, is_admin: user.is_admin === 1 }, orders: ordersWithItems });
});

// DELETE /api/users/:id — remove user (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User removed.' });
});

module.exports = router;
