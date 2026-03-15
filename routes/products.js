// routes/products.js — Products CRUD
const express = require('express');
const db      = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── GET ALL PRODUCTS ──
// GET /api/products
router.get('/', (req, res) => {
  const { category, badge, search } = req.query;
  let query = 'SELECT * FROM products WHERE active = 1';
  const params = [];

  if (category) { query += ' AND category = ?'; params.push(category); }
  if (badge)    { query += ' AND badge = ?';    params.push(badge); }
  if (search)   { query += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += ' ORDER BY created_at DESC';
  const products = db.prepare(query).all(...params);
  res.json({ products, total: products.length });
});

// ── GET SINGLE PRODUCT ──
// GET /api/products/:id
router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product });
});

// ── GET CATEGORIES ──
// GET /api/products/meta/categories
router.get('/meta/categories', (req, res) => {
  const cats = db.prepare('SELECT DISTINCT category FROM products WHERE active = 1').all();
  res.json({ categories: cats.map(c => c.category) });
});

// ── CREATE PRODUCT (admin) ──
// POST /api/products
router.post('/', requireAdmin, (req, res) => {
  const { name, category, price, description, image_url, badge, stock } = req.body;
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'Name, category and price are required.' });
  }
  const result = db.prepare(
    'INSERT INTO products (name, category, price, description, image_url, badge, stock) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, category, price, description || '', image_url || '', badge || '', stock || 100);
  res.status(201).json({ message: 'Product created.', id: result.lastInsertRowid });
});

// ── UPDATE PRODUCT (admin) ──
// PUT /api/products/:id
router.put('/:id', requireAdmin, (req, res) => {
  const { name, category, price, description, image_url, badge, stock, active } = req.body;
  db.prepare(`
    UPDATE products SET name=?, category=?, price=?, description=?, image_url=?, badge=?, stock=?, active=?
    WHERE id=?
  `).run(name, category, price, description, image_url, badge, stock, active !== undefined ? active : 1, req.params.id);
  res.json({ message: 'Product updated.' });
});

// ── DELETE PRODUCT (admin — soft delete) ──
// DELETE /api/products/:id
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Product removed.' });
});

module.exports = router;
