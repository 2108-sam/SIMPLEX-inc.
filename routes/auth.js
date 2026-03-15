// routes/auth.js — Register, Login, Logout, Profile
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── REGISTER ──
// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  // Check if email already registered
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), email.toLowerCase().trim(), phone || null, hashedPassword);

  const user = { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase(), is_admin: 0 };
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({
    message: 'Account created successfully.',
    token,
    user: { id: user.id, name: user.name, email: user.email, phone: phone || null, is_admin: false }
  });
});

// ── LOGIN ──
// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Update last login
  db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);

  const payload = { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin === 1 };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.json({
    message: 'Signed in successfully.',
    token,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, is_admin: user.is_admin === 1 }
  });
});

// ── LOGOUT ──
// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization'].split(' ')[1];
  db.prepare('INSERT OR IGNORE INTO token_blacklist (token) VALUES (?)').run(token);
  res.json({ message: 'Signed out successfully.' });
});

// ── GET PROFILE ──
// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, is_admin, created_at, last_login FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: { ...user, is_admin: user.is_admin === 1 } });
});

// ── UPDATE PROFILE ──
// PUT /api/auth/me
router.put('/me', requireAuth, (req, res) => {
  const { name, phone } = req.body;
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?')
    .run(name || req.user.name, phone || null, req.user.id);
  res.json({ message: 'Profile updated successfully.' });
});

// ── CHANGE PASSWORD ──
// PUT /api/auth/password
router.put('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password required.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const hashed = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
  res.json({ message: 'Password changed successfully.' });
});

module.exports = router;
