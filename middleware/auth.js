// middleware/auth.js — JWT authentication middleware
const jwt = require('jsonwebtoken');
const db  = require('../db/database');

// Verify JWT token
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  // Check blacklist
  const blacklisted = db.prepare('SELECT token FROM token_blacklist WHERE token = ?').get(token);
  if (blacklisted) {
    return res.status(401).json({ error: 'Token has been invalidated. Please sign in again.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

// Admin-only middleware
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  });
}

// Optional auth — attaches user if token present, continues either way
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (_) {}
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };
